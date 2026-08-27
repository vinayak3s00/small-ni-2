/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { Pool, type PoolClient } from 'pg';
import { withTenantScope, type QueryRunner } from '@abetworks/core';
import {
  resolveShares,
  type AttributionEvent,
  type AttributionModel,
  type AttributionShare,
  type AttributionStore,
  type NewTouch,
} from './attribution';

function asRunner(client: PoolClient): QueryRunner {
  return { query: (sql, params) => client.query(sql, params as any[]) };
}

function mapEvent(r: any): AttributionEvent {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    recordId: r.record_id,
    source: r.source,
    campaign: r.campaign ?? undefined,
    partnerCode: r.partner_code ?? undefined,
    occurredAt: new Date(r.occurred_at).toISOString(),
  };
}

/**
 * PostgreSQL-backed append-only attribution ledger. RLS isolates rows by tenant;
 * a database trigger makes the table tamper-evident (no UPDATE/DELETE).
 */
export class PgAttributionStore implements AttributionStore {
  constructor(private readonly pool: Pool) {}

  private async tx<T>(fn: (tx: QueryRunner) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      return await withTenantScope(asRunner(client), fn);
    } finally {
      client.release();
    }
  }

  async record(input: NewTouch): Promise<AttributionEvent> {
    return this.tx(async (tx) => {
      const { rows } = await tx.query(
        `INSERT INTO attribution_event (tenant_id, record_id, source, campaign, partner_code, occurred_at)
         VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, COALESCE($5::timestamptz, now()))
         RETURNING *`,
        [input.recordId, input.source, input.campaign ?? null, input.partnerCode ?? null, input.occurredAt ?? null],
      );
      return mapEvent(rows[0]);
    });
  }

  async touches(recordId: string): Promise<AttributionEvent[]> {
    return this.tx(async (tx) => {
      const { rows } = await tx.query(
        `SELECT * FROM attribution_event WHERE record_id = $1
         ORDER BY occurred_at ASC, seq ASC`,
        [recordId],
      );
      return rows.map(mapEvent);
    });
  }

  async attribute(recordId: string, model: AttributionModel = 'last_touch'): Promise<AttributionShare[]> {
    return resolveShares(await this.touches(recordId), model);
  }
}
