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
 * by default.
 */

export interface Workspace {
  id: string;
  partnerId: string;
  tenantId: string; // isolated tenant id for this client
  clientName: string;
  status: 'active' | 'suspended';
  senderIdentity: string; // isolated sending domain/number
}

export interface WorkspaceGrant {
  workspaceId: string;
  scopes: string[]; // e.g. ['reports:read', 'pii:read']
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

export class PartnerRegistry {
  private workspaces: Workspace[] = [];
  private grants = new Map<string, WorkspaceGrant[]>(); // partnerId -> grants
  private usage = new Map<string, number>(); // workspaceId -> metered units

  provision(partnerId: string, clientName: string): Workspace {
    const clash = this.workspaces.find(
      (w) => w.partnerId === partnerId && w.clientName === clientName,
    );
    if (clash) throw new WorkspaceExistsError(clientName);

    const id = randomUUID();
    const ws: Workspace = {
      id,
      partnerId,
      tenantId: randomUUID(), // hard-isolated tenant
      clientName,
      status: 'active',
      senderIdentity: `${clientName.toLowerCase().replace(/\s+/g, '-')}.mail.abetworks.in`,
    };
    this.workspaces.push(ws);
    return ws;
  }

  listWorkspaces(partnerId: string): Workspace[] {
    return this.workspaces.filter((w) => w.partnerId === partnerId);
  }

  grant(partnerId: string, workspaceId: string, scopes: string[]): void {
    const existing = this.grants.get(partnerId) ?? [];
    existing.push({ workspaceId, scopes });
    this.grants.set(partnerId, existing);
  }

  /** Enforce the client-data wall: a partner may only access a workspace with a matching scope. */
  canAccess(partnerId: string, workspaceId: string, scope: string): boolean {
    const ws = this.workspaces.find((w) => w.id === workspaceId);
    if (!ws || ws.partnerId !== partnerId) return false; // cross-partner access denied
    const grants = this.grants.get(partnerId) ?? [];
    return grants.some((g) => g.workspaceId === workspaceId && g.scopes.includes(scope));
  }

  recordUsage(workspaceId: string, units: number): void {
    this.usage.set(workspaceId, (this.usage.get(workspaceId) ?? 0) + units);
  }

  /** Billing rollup with margin (retainer profitability). */
  billingRollup(
    partnerId: string,
    wholesalePerUnitMinor: number,
    retailPerUnitMinor: number,
  ): UsageRollupLine[] {
    return this.listWorkspaces(partnerId).map((w) => {
      const units = this.usage.get(w.id) ?? 0;
      const wholesale = units * wholesalePerUnitMinor;
      const retail = units * retailPerUnitMinor;
      return {
        workspaceId: w.id,
        clientName: w.clientName,
        meteredUnits: units,
        wholesaleCostMinor: wholesale,
        retailPriceMinor: retail,
        marginMinor: retail - wholesale,
      };
    });
  }
}
