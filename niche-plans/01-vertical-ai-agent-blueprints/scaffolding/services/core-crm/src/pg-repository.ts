/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { Pool, type PoolClient } from 'pg';
import { withTenantScope, type QueryRunner } from '@abetworks/core';
import {
  type BookingRow,
  type CrmRepository,
  type NewRecord,
  type RecordRow,
  SlotTakenError,
} from './repository';

/** Adapt a checked-out pg client to the platform QueryRunner contract. */
function asRunner(client: PoolClient): QueryRunner {
  return { query: (sql, params) => client.query(sql, params as unknown[]) };
}

/** A raw database row (column name -> value) before it is mapped to a domain type. */
type Row = Record<string, unknown>;

function mapRecord(r: Row): RecordRow {
  return {
    id: r.id as string,
    tenantId: r.tenant_id as string,
    vertical: r.vertical as RecordRow['vertical'],
    stage: r.stage as RecordRow['stage'],
    source: r.source as string,
    party: {
      name: r.party_name as string,
      phones: (r.party_phones as string[] | null) ?? [],
      languages: (r.party_langs as string[] | null) ?? [],
    },
    score: (r.score as number | null) ?? undefined,
    scoreReasons: (r.score_reasons as string[] | null) ?? undefined,
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}

/**
 * PostgreSQL-backed repository. Every operation runs inside withTenantScope(),
 * which opens a transaction and sets app.tenant_id so RLS isolates rows to the
 * current tenant. The service never filters by tenant in SQL — the database
 * does, which is the whole point of the RLS design.
 */
export class PgRepo implements CrmRepository {
  constructor(private readonly pool: Pool) {}

  private async inTenantTx<T>(fn: (tx: QueryRunner) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      return await withTenantScope(asRunner(client), fn);
    } finally {
      client.release();
    }
  }

  async createRecord(input: NewRecord): Promise<RecordRow> {
    return this.inTenantTx(async (tx) => {
      const { rows } = await tx.query(
        `INSERT INTO record (tenant_id, vertical, source, party_name, party_phones, party_langs)
         VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5)
         RETURNING *`,
        [
          input.vertical,
          input.source,
          input.party.name,
          input.party.phones ?? [],
          input.party.languages ?? [],
        ],
      );
      return mapRecord(rows[0] as Row);
    });
  }

  async listRecords(filter: { minScore?: number } = {}): Promise<RecordRow[]> {
    return this.inTenantTx(async (tx) => {
      const { rows } = await tx.query(
        `SELECT * FROM record
         WHERE ($1::int IS NULL OR COALESCE(score, 0) >= $1)
         ORDER BY created_at DESC`,
        [filter.minScore ?? null],
      );
      return (rows as Row[]).map(mapRecord);
    });
  }

  async getRecord(id: string): Promise<RecordRow | undefined> {
    return this.inTenantTx(async (tx) => {
      const { rows } = await tx.query('SELECT * FROM record WHERE id = $1', [id]);
      return rows[0] ? mapRecord(rows[0] as Row) : undefined;
    });
  }

  async setScore(id: string, score: number, reasons: string[]): Promise<RecordRow | undefined> {
    return this.inTenantTx(async (tx) => {
      const { rows } = await tx.query(
        `UPDATE record SET score = $2, score_reasons = $3::jsonb, updated_at = now()
         WHERE id = $1 RETURNING *`,
        [id, score, JSON.stringify(reasons)],
      );
      return rows[0] ? mapRecord(rows[0] as Row) : undefined;
    });
  }

  async book(recordId: string, resourceId: string, slotStart: string): Promise<BookingRow> {
    try {
      return await this.inTenantTx(async (tx) => {
        const { rows } = await tx.query(
          `INSERT INTO booking (tenant_id, record_id, resource_id, slot_start)
           VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3)
           RETURNING *`,
          [recordId, resourceId, slotStart],
        );
        const b = rows[0] as Row;
        return {
          id: b.id as string,
          tenantId: b.tenant_id as string,
          recordId: b.record_id as string,
          resourceId: b.resource_id as string,
          slotStart: new Date(b.slot_start as string).toISOString(),
          status: b.status as BookingRow['status'],
          version: b.version as number,
        };
      });
    } catch (err: unknown) {
      // 23505 = unique_violation => the (tenant, resource, slot) is already booked.
      if ((err as { code?: string }).code === '23505') throw new SlotTakenError();
      throw err;
    }
  }
}
