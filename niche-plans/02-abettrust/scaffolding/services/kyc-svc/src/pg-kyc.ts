/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { Pool, type PoolClient } from 'pg';
import { getPrincipal, withTenantScope, type QueryRunner } from '@abetworks/core';
import {
  InvalidKycTransition,
  KycNotFound,
  TRANSITIONS,
  type KycRecord,
  type KycStatus,
  type KycStore,
  type TrailEntry,
} from './kyc';

function asRunner(client: PoolClient): QueryRunner {
  return { query: (sql, params) => client.query(sql, params as any[]) };
}

/**
 * PostgreSQL-backed KYC store. Every operation runs in withTenantScope() so
 * RLS isolates rows to the current tenant. The disclosure/audit trail is
 * append-only at the database level (a trigger blocks UPDATE/DELETE).
 */
export class PgKycStore implements KycStore {
  constructor(private readonly pool: Pool) {}

  private async tx<T>(fn: (tx: QueryRunner) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      return await withTenantScope(asRunner(client), fn);
    } finally {
      client.release();
    }
  }

  private async trail(tx: QueryRunner, kycId: string, kind: TrailEntry['kind'], detail: string) {
    await tx.query(
      `INSERT INTO kyc_trail (tenant_id, kyc_id, actor, kind, detail)
       VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4)`,
      [kycId, getPrincipal().sub, kind, detail],
    );
  }

  private async hydrate(tx: QueryRunner, id: string): Promise<KycRecord | undefined> {
    const { rows } = await tx.query('SELECT * FROM kyc_record WHERE id = $1', [id]);
    if (!rows[0]) return undefined;
    const r = rows[0];
    const { rows: trail } = await tx.query(
      'SELECT actor, kind, detail, at FROM kyc_trail WHERE kyc_id = $1 ORDER BY id',
      [id],
    );
    return {
      id: r.id,
      tenantId: r.tenant_id,
      partyId: r.party_id,
      status: r.status,
      documents: r.documents ?? [],
      disclosures: r.disclosures ?? [],
      trail: trail.map((t: any) => ({
        actor: t.actor,
        kind: t.kind,
        detail: t.detail,
        at: new Date(t.at).toISOString(),
      })),
    };
  }

  async create(partyId: string, documents: string[] = []): Promise<KycRecord> {
    return this.tx(async (tx) => {
      const { rows } = await tx.query(
        `INSERT INTO kyc_record (tenant_id, party_id, documents)
         VALUES (current_setting('app.tenant_id')::uuid, $1, $2)
         RETURNING id`,
        [partyId, documents],
      );
      const id = rows[0].id;
      await this.trail(tx, id, 'status_change', 'created as pending');
      return (await this.hydrate(tx, id))!;
    });
  }

  async transition(id: string, to: KycStatus): Promise<KycRecord> {
    return this.tx(async (tx) => {
      const { rows } = await tx.query('SELECT status FROM kyc_record WHERE id = $1 FOR UPDATE', [id]);
      if (!rows[0]) throw new KycNotFound(id);
      const from = rows[0].status as KycStatus;
      if (!TRANSITIONS[from].includes(to)) throw new InvalidKycTransition(from, to);

      await tx.query('UPDATE kyc_record SET status = $2, updated_at = now() WHERE id = $1', [id, to]);
      await this.trail(tx, id, 'status_change', `${from} -> ${to}`);
      return (await this.hydrate(tx, id))!;
    });
  }

  async addDisclosure(id: string, disclosure: string): Promise<KycRecord> {
    return this.tx(async (tx) => {
      const { rows } = await tx.query(
        `UPDATE kyc_record SET disclosures = array_append(disclosures, $2), updated_at = now()
         WHERE id = $1 RETURNING id`,
        [id, disclosure],
      );
      if (!rows[0]) throw new KycNotFound(id);
      await this.trail(tx, id, 'disclosure', disclosure);
      return (await this.hydrate(tx, id))!;
    });
  }

  async isSuitabilityComplete(id: string): Promise<boolean> {
    return this.tx(async (tx) => {
      const { rows } = await tx.query(
        `SELECT status = 'verified' AND cardinality(disclosures) > 0 AS complete
         FROM kyc_record WHERE id = $1`,
        [id],
      );
      return !!rows[0]?.complete;
    });
  }

  async get(id: string): Promise<KycRecord | undefined> {
    return this.tx((tx) => this.hydrate(tx, id));
  }
}
