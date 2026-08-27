/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { Pool, type PoolClient } from 'pg';
import { withTenantScope, type QueryRunner } from '@abetworks/core';
import {
  decide,
  rowKeyFor,
  type Entity,
  type Mutation,
  type StoredRow,
  type SyncResult,
  type SyncStore,
} from './sync';

function asRunner(client: PoolClient): QueryRunner {
  return { query: (sql, params) => client.query(sql, params as any[]) };
}

/**
 * PostgreSQL-backed offline-sync engine with a DURABLE, append-only op-log.
 *
 * Idempotency is guaranteed across processes and restarts by
 * UNIQUE(tenant_id, client_mutation_id) on sync_mutation: a replayed mutation
 * hits ON CONFLICT DO NOTHING and is reported as a duplicate. Conflict
 * resolution (LWW / server-authoritative / append-only) is decided against the
 * current synced_row and materialized via upsert — all inside one tenant-scoped
 * transaction so RLS isolates every tenant's data.
 */
export class PgSyncStore implements SyncStore {
  constructor(private readonly pool: Pool) {}

  private async tx<T>(fn: (tx: QueryRunner) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      return await withTenantScope(asRunner(client), fn);
    } finally {
      client.release();
    }
  }

  async sync(mutations: Mutation[]): Promise<SyncResult> {
    return this.tx(async (tx) => {
      const result: SyncResult = { applied: [], duplicates: [], conflicts: [], newOpId: '' };

      for (const m of mutations) {
        const now = m.payload.updatedAt ?? new Date().toISOString();
        const rowKey = rowKeyFor(m);

        // Current materialized state for the decision.
        const cur = await tx.query(
          'SELECT data, updated_at FROM synced_row WHERE entity = $1 AND row_key = $2',
          [m.entity, rowKey],
        );
        const existing: StoredRow | undefined = cur.rows[0]
          ? {
              id: rowKey,
              entity: m.entity,
              data: cur.rows[0].data,
              updatedAt: new Date(cur.rows[0].updated_at).toISOString(),
            }
          : undefined;
        const decision = decide(m, existing, now);

        // Append to the op-log; ON CONFLICT means this mutation was already applied.
        const ins = await tx.query(
          `INSERT INTO sync_mutation (tenant_id, client_mutation_id, entity, op, payload, resolution)
           VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4::jsonb, $5)
           ON CONFLICT (tenant_id, client_mutation_id) DO NOTHING
           RETURNING seq`,
          [m.clientMutationId, m.entity, m.op, JSON.stringify(m.payload), decision.resolution],
        );

        if (!ins.rows[0]) {
          result.duplicates.push(m.clientMutationId); // durable idempotent replay
          continue;
        }

        if (decision.write) {
          await tx.query(
            `INSERT INTO synced_row (tenant_id, entity, row_key, data, updated_at)
             VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3::jsonb, $4)
             ON CONFLICT (tenant_id, entity, row_key)
             DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
            [m.entity, rowKey, JSON.stringify(m.payload), now],
          );
        }

        result.applied.push(m.clientMutationId);
        if (decision.resolution !== 'applied') {
          result.conflicts.push({ clientMutationId: m.clientMutationId, resolution: decision.resolution });
        }
      }

      // The current max op sequence acts as the sync cursor.
      const cursor = await tx.query('SELECT COALESCE(MAX(seq), 0)::text AS op FROM sync_mutation');
      result.newOpId = `op-${cursor.rows[0].op}`;
      return result;
    });
  }

  async getRow(entity: Entity, id: string): Promise<StoredRow | undefined> {
    return this.tx(async (tx) => {
      const { rows } = await tx.query(
        'SELECT data, updated_at FROM synced_row WHERE entity = $1 AND row_key = $2',
        [entity, id],
      );
      if (!rows[0]) return undefined;
      return {
        id,
        entity,
        data: rows[0].data,
        updatedAt: new Date(rows[0].updated_at).toISOString(),
      };
    });
  }
}
