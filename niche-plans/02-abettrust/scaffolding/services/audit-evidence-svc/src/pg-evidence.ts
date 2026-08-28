/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { Pool, type PoolClient } from 'pg';
import { withTenantScope, type QueryRunner, type AuditEvent } from '@abetworks/core';
import {
  GENESIS,
  linkHash,
  merkleRoot,
  sha256,
  type AuditQuery,
  type AuditStore,
  type ChainedEvent,
  type EvidencePack,
} from './evidence';

function asRunner(client: PoolClient): QueryRunner {
  return { query: (sql, params) => client.query(sql, params as unknown[]) };
}

/** A raw database row (column name -> value) before it is mapped to a domain type. */
type Row = Record<string, unknown>;

function mapRow(r: Row): ChainedEvent {
  return {
    tenantId: r.tenant_id as string,
    actor: r.actor as string,
    action: r.action as ChainedEvent['action'],
    entity: r.entity as string,
    entityId: r.entity_id as string,
    fields: (r.fields as string[] | null) ?? undefined,
    at: new Date(r.at as string).toISOString(),
    seq: Number(r.seq),
    prevHash: r.prev_hash as string,
    hash: r.hash as string,
  };
}

/**
 * PostgreSQL WORM audit store. Appends are serialized per tenant with a
 * transaction-scoped advisory lock so the hash chain stays consistent under
 * concurrency. Append-only is enforced by a DB trigger; RLS isolates each
 * tenant's chain. This is the durable, tamper-evident record regulated buyers
 * require (mirrors S3 Object Lock in production).
 */
export class PgAuditStore implements AuditStore {
  constructor(private readonly pool: Pool) {}

  private async tx<T>(fn: (tx: QueryRunner) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      return await withTenantScope(asRunner(client), fn);
    } finally {
      client.release();
    }
  }

  async append(event: AuditEvent): Promise<ChainedEvent> {
    return this.tx(async (tx) => {
      // Serialize appends for this tenant's chain (advisory lock on tenant id).
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [event.tenantId]);

      const last = await tx.query(
        'SELECT seq, hash FROM audit_event ORDER BY seq DESC LIMIT 1',
      );
      const lastRow = last.rows[0] as Row | undefined;
      const seq = lastRow ? Number(lastRow.seq) + 1 : 0;
      const prevHash = lastRow ? (lastRow.hash as string) : GENESIS;
      const hash = linkHash(prevHash, event, seq);

      await tx.query(
        `INSERT INTO audit_event (tenant_id, seq, actor, action, entity, entity_id, fields, at, prev_hash, hash)
         VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [seq, event.actor, event.action, event.entity, event.entityId, event.fields ?? null, event.at, prevHash, hash],
      );
      return { ...event, seq, prevHash, hash };
    });
  }

  async verify(): Promise<boolean> {
    return this.tx(async (tx) => {
      const { rows } = await tx.query('SELECT * FROM audit_event ORDER BY seq');
      let prev = GENESIS;
      for (let i = 0; i < rows.length; i++) {
        const e = mapRow(rows[i] as Row);
        if (e.seq !== i || e.prevHash !== prev) return false;
        const { seq, prevHash, hash, ...raw } = e;
        if (linkHash(prevHash, raw as AuditEvent, seq) !== hash) return false;
        prev = hash;
      }
      return true;
    });
  }

  async query(filter: AuditQuery = {}): Promise<ChainedEvent[]> {
    return this.tx(async (tx) => {
      const { rows } = await tx.query(
        `SELECT * FROM audit_event
         WHERE ($1::text IS NULL OR action = $1)
           AND ($2::timestamptz IS NULL OR at >= $2)
           AND ($3::timestamptz IS NULL OR at <= $3)
         ORDER BY seq`,
        [filter.action ?? null, filter.from ?? null, filter.to ?? null],
      );
      return (rows as Row[]).map(mapRow);
    });
  }

  async generatePack(period: string, from: string, to: string): Promise<EvidencePack> {
    return this.tx(async (tx) => {
      const { rows } = await tx.query(
        'SELECT hash FROM audit_event WHERE at >= $1 AND at <= $2 ORDER BY seq',
        [from, to],
      );
      const root = merkleRoot((rows as Row[]).map((r) => r.hash as string));
      const generatedAt = new Date().toISOString();
      const hash = sha256(period + generatedAt + root + rows.length);
      await tx.query(
        `INSERT INTO evidence_pack (tenant_id, period, event_count, merkle_root, hash, generated_at)
         VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5)`,
        [period, rows.length, root, hash, generatedAt],
      );
      return { period, generatedAt, eventCount: rows.length, merkleRoot: root, hash };
    });
  }
}
