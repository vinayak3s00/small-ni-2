/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { Pool, type PoolClient } from 'pg';
import { withTenantScope, type QueryRunner } from '@abetworks/core';
import {
  WorkspaceExistsError,
  rollupLine,
  senderIdentityFor,
  type PartnerStore,
  type UsageRollupLine,
  type Workspace,
} from './partner';

function asRunner(client: PoolClient): QueryRunner {
  return { query: (sql, params) => client.query(sql, params as unknown[]) };
}

/** A raw database row (column name -> value) before it is mapped to a domain type. */
type Row = Record<string, unknown>;

function mapWorkspace(r: Row): Workspace {
  return {
    id: r.id as string,
    partnerId: r.partner_id as string,
    tenantId: r.tenant_id as string,
    clientName: r.client_name as string,
    status: r.status as Workspace['status'],
    senderIdentity: r.sender_identity as string,
  };
}

/**
 * PostgreSQL-backed hierarchical-tenancy store. The partner is the tenant, so
 * withTenantScope sets app.tenant_id = partnerId and RLS guarantees an agency
 * can only ever touch its own workspaces/grants/usage. Cross-partner access is
 * therefore impossible at the database level, not just in application checks.
 */
export class PgPartnerStore implements PartnerStore {
  constructor(private readonly pool: Pool) {}

  private async tx<T>(fn: (tx: QueryRunner) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      return await withTenantScope(asRunner(client), fn);
    } finally {
      client.release();
    }
  }

  async provision(_partnerId: string, clientName: string): Promise<Workspace> {
    try {
      return await this.tx(async (tx) => {
        const { rows } = await tx.query(
          `INSERT INTO workspace (partner_id, client_name, sender_identity)
           VALUES (current_setting('app.tenant_id')::uuid, $1, $2)
           RETURNING *`,
          [clientName, senderIdentityFor(clientName)],
        );
        return mapWorkspace(rows[0] as Row);
      });
    } catch (err: unknown) {
      // unique_violation
      if ((err as { code?: string }).code === '23505') throw new WorkspaceExistsError(clientName);
      throw err;
    }
  }

  async listWorkspaces(_partnerId: string): Promise<Workspace[]> {
    return this.tx(async (tx) => {
      const { rows } = await tx.query('SELECT * FROM workspace ORDER BY created_at');
      return (rows as Row[]).map(mapWorkspace);
    });
  }

  async grant(_partnerId: string, workspaceId: string, scopes: string[]): Promise<void> {
    await this.tx(async (tx) => {
      // Only inserts if the workspace belongs to this partner (RLS + existence check).
      const { rows } = await tx.query('SELECT 1 FROM workspace WHERE id = $1', [workspaceId]);
      if (!rows[0]) return; // not our workspace -> no grant recorded
      await tx.query(
        `INSERT INTO workspace_grant (partner_id, workspace_id, scopes)
         VALUES (current_setting('app.tenant_id')::uuid, $1, $2)`,
        [workspaceId, scopes],
      );
    });
  }

  async canAccess(_partnerId: string, workspaceId: string, scope: string): Promise<boolean> {
    return this.tx(async (tx) => {
      // RLS already restricts to this partner's rows; cross-partner => no rows => false.
      const { rows } = await tx.query(
        `SELECT 1 FROM workspace_grant
         WHERE workspace_id = $1 AND $2 = ANY(scopes) LIMIT 1`,
        [workspaceId, scope],
      );
      return rows.length > 0;
    });
  }

  async recordUsage(_partnerId: string, workspaceId: string, units: number): Promise<void> {
    await this.tx(async (tx) => {
      const { rows } = await tx.query('SELECT 1 FROM workspace WHERE id = $1', [workspaceId]);
      if (!rows[0]) return;
      await tx.query(
        `INSERT INTO usage_event (partner_id, workspace_id, units)
         VALUES (current_setting('app.tenant_id')::uuid, $1, $2)`,
        [workspaceId, units],
      );
    });
  }

  async billingRollup(
    _partnerId: string,
    wholesalePerUnitMinor: number,
    retailPerUnitMinor: number,
  ): Promise<UsageRollupLine[]> {
    return this.tx(async (tx) => {
      const { rows } = await tx.query(
        `SELECT w.id, w.client_name,
                COALESCE(SUM(u.units), 0)::int AS units
         FROM workspace w
         LEFT JOIN usage_event u ON u.workspace_id = w.id
         GROUP BY w.id, w.client_name
         ORDER BY w.client_name`,
      );
      return (rows as Row[]).map((r) =>
        rollupLine(
          r.id as string,
          r.client_name as string,
          Number(r.units),
          wholesalePerUnitMinor,
          retailPerUnitMinor,
        ),
      );
    });
  }
}
