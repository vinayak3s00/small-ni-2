/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { randomUUID } from 'node:crypto';

/**
 * Hierarchical tenancy for AbetPartner: a partner (agency) owns many client
 * workspaces, each of which is an isolated tenant. Partner users can only see
 * a workspace's data through an explicit, scoped grant — never raw client PII
 * by default. The PARTNER is the tenant boundary (partner_id = app.tenant_id).
 *
 * Two implementations satisfy PartnerStore: an in-memory store (tests/dev) and
 * a PostgreSQL-backed store (see pg-partner.ts) with RLS isolation.
 */

export interface Workspace {
  id: string;
  partnerId: string;
  tenantId: string; // isolated tenant id for this client
  clientName: string;
  status: 'active' | 'suspended';
  senderIdentity: string; // isolated sending domain/number
}

export interface UsageRollupLine {
  workspaceId: string;
  clientName: string;
  meteredUnits: number;
  wholesaleCostMinor: number;
  retailPriceMinor: number;
  marginMinor: number;
}

export class WorkspaceExistsError extends Error {
  constructor(name: string) {
    super(`workspace already exists for client: ${name}`);
    this.name = 'WorkspaceExistsError';
  }
}

/** Derive a per-client isolated sending identity. Pure; shared by both stores. */
export function senderIdentityFor(clientName: string): string {
  return `${clientName.toLowerCase().replace(/\s+/g, '-')}.mail.abetworks.in`;
}

/** Compute one billing rollup line. Pure; shared by both stores. */
export function rollupLine(
  workspaceId: string,
  clientName: string,
  units: number,
  wholesalePerUnitMinor: number,
  retailPerUnitMinor: number,
): UsageRollupLine {
  const wholesale = units * wholesalePerUnitMinor;
  const retail = units * retailPerUnitMinor;
  return {
    workspaceId,
    clientName,
    meteredUnits: units,
    wholesaleCostMinor: wholesale,
    retailPriceMinor: retail,
    marginMinor: retail - wholesale,
  };
}

export interface PartnerStore {
  provision(partnerId: string, clientName: string): Promise<Workspace>;
  listWorkspaces(partnerId: string): Promise<Workspace[]>;
  grant(partnerId: string, workspaceId: string, scopes: string[]): Promise<void>;
  canAccess(partnerId: string, workspaceId: string, scope: string): Promise<boolean>;
  recordUsage(partnerId: string, workspaceId: string, units: number): Promise<void>;
  billingRollup(
    partnerId: string,
    wholesalePerUnitMinor: number,
    retailPerUnitMinor: number,
  ): Promise<UsageRollupLine[]>;
}

/** In-memory hierarchical-tenancy store (unit tests / dev). */
export class InMemoryPartnerStore implements PartnerStore {
  private workspaces: Workspace[] = [];
  private grants = new Map<string, { workspaceId: string; scopes: string[] }[]>();
  private usage = new Map<string, number>();

  async provision(partnerId: string, clientName: string): Promise<Workspace> {
    if (this.workspaces.find((w) => w.partnerId === partnerId && w.clientName === clientName)) {
      throw new WorkspaceExistsError(clientName);
    }
    const ws: Workspace = {
      id: randomUUID(),
      partnerId,
      tenantId: randomUUID(),
      clientName,
      status: 'active',
      senderIdentity: senderIdentityFor(clientName),
    };
    this.workspaces.push(ws);
    return ws;
  }

  async listWorkspaces(partnerId: string): Promise<Workspace[]> {
    return this.workspaces.filter((w) => w.partnerId === partnerId);
  }

  async grant(partnerId: string, workspaceId: string, scopes: string[]): Promise<void> {
    const existing = this.grants.get(partnerId) ?? [];
    existing.push({ workspaceId, scopes });
    this.grants.set(partnerId, existing);
  }

  async canAccess(partnerId: string, workspaceId: string, scope: string): Promise<boolean> {
    const ws = this.workspaces.find((w) => w.id === workspaceId);
    if (!ws || ws.partnerId !== partnerId) return false; // cross-partner denied
    const grants = this.grants.get(partnerId) ?? [];
    return grants.some((g) => g.workspaceId === workspaceId && g.scopes.includes(scope));
  }

  async recordUsage(partnerId: string, workspaceId: string, units: number): Promise<void> {
    this.usage.set(workspaceId, (this.usage.get(workspaceId) ?? 0) + units);
  }

  async billingRollup(
    partnerId: string,
    wholesalePerUnitMinor: number,
    retailPerUnitMinor: number,
  ): Promise<UsageRollupLine[]> {
    const workspaces = await this.listWorkspaces(partnerId);
    return workspaces.map((w) =>
      rollupLine(w.id, w.clientName, this.usage.get(w.id) ?? 0, wholesalePerUnitMinor, retailPerUnitMinor),
    );
  }
}
