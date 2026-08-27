/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runWithPrincipal, type AuditEvent } from '@abetworks/core';
import { Pool } from 'pg';
import { createPool, migrate } from './db';
import { PgAuditStore } from './pg-evidence';

const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;

const TA = '11111111-1111-1111-1111-111111111111';
const TB = '22222222-2222-2222-2222-222222222222';

const evFor = (tenantId: string, id: string, action: AuditEvent['action'] = 'read'): AuditEvent => ({
  tenantId,
  actor: 'officer',
  action,
  entity: 'record',
  entityId: id,
  at: new Date().toISOString(),
});

const asA = <T>(fn: () => Promise<T>) =>
  runWithPrincipal({ sub: 'officer', tenantId: TA, roles: ['compliance_officer'] }, fn);
const asB = <T>(fn: () => Promise<T>) =>
  runWithPrincipal({ sub: 'officer', tenantId: TB, roles: ['compliance_officer'] }, fn);

d('PgAuditStore (integration, WORM)', () => {
  let pool: Pool;
  let store: PgAuditStore;

  beforeAll(async () => {
    pool = createPool();
    await migrate(pool);
    await pool.query('TRUNCATE audit_event, evidence_pack');
    store = new PgAuditStore(pool);
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it('appends a durable, verifiable per-tenant hash chain', async () => {
    const a = await asA(() => store.append(evFor(TA, 'a', 'write')));
    const b = await asA(() => store.append(evFor(TA, 'b', 'export')));
    expect(a.seq).toBe(0);
    expect(b.seq).toBe(1);
    expect(b.prevHash).toBe(a.hash);
    expect(await asA(() => store.verify())).toBe(true);
  });

  it('enforces RLS: tenant B cannot read tenant A events', async () => {
    const rowsB = await asB(() => store.query());
    expect(rowsB).toHaveLength(0);
    // Tenant B starts its own chain at seq 0 (independent chain).
    const first = await asB(() => store.append(evFor(TB, 'b1')));
    expect(first.seq).toBe(0);
  });

  it('is append-only at the database level (UPDATE and DELETE blocked)', async () => {
    await expect(pool.query("UPDATE audit_event SET actor = 'x'")).rejects.toThrow(/append-only/);
    await expect(pool.query('DELETE FROM audit_event')).rejects.toThrow(/append-only/);
  });

  it('generates and persists an evidence pack', async () => {
    const pack = await asA(() => store.generatePack('2026-Q2', '2000-01-01T00:00:00Z', '2100-01-01T00:00:00Z'));
    expect(pack.eventCount).toBeGreaterThanOrEqual(2);
    expect(pack.merkleRoot).toMatch(/^[a-f0-9]{64}$/);
    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM evidence_pack WHERE tenant_id = $1", [TA]);
    expect(rows[0].n).toBeGreaterThanOrEqual(1);
  });

  it('filters events by action', async () => {
    const exports = await asA(() => store.query({ action: 'export' }));
    expect(exports.every((e) => e.action === 'export')).toBe(true);
    expect(exports.length).toBeGreaterThanOrEqual(1);
  });
});
