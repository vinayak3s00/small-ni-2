/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runWithPrincipal } from '@abetworks/core';
import { Pool } from 'pg';
import { createPool, migrate } from './db';
import { PgSyncStore } from './pg-sync';
import type { Mutation } from './sync';

const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;

const TA = '11111111-1111-1111-1111-111111111111';
const TB = '22222222-2222-2222-2222-222222222222';
const asA = <T>(fn: () => Promise<T>) => runWithPrincipal({ sub: 'a', tenantId: TA, roles: ['field_rep'] }, fn);
const asB = <T>(fn: () => Promise<T>) => runWithPrincipal({ sub: 'b', tenantId: TB, roles: ['field_rep'] }, fn);

const order = (id: string, cmid: string, updatedAt: string, extra: any = {}): Mutation => ({
  clientMutationId: cmid,
  entity: 'field_order',
  op: 'update',
  payload: { id, updatedAt, ...extra },
});

d('PgSyncStore (integration)', () => {
  let pool: Pool;
  let store: PgSyncStore;

  beforeAll(async () => {
    pool = createPool();
    await migrate(pool);
    await pool.query('TRUNCATE sync_mutation, synced_row RESTART IDENTITY');
    store = new PgSyncStore(pool);
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it('applies then replays idempotently across separate calls (durable op-log)', async () => {
    const m = order('o1', 'cmid-1', '2026-06-01T10:00:00Z', { totalMinor: 5000 });
    const r1 = await asA(() => store.sync([m]));
    expect(r1.applied).toEqual(['cmid-1']);
    const r2 = await asA(() => store.sync([m]));
    expect(r2.duplicates).toEqual(['cmid-1']);
    expect(r2.applied).toEqual([]);
  });

  it('field_order LWW keeps the newer value', async () => {
    await asA(() => store.sync([order('o2', 'c1', '2026-06-01T10:00:00Z', { totalMinor: 100 })]));
    const late = await asA(() => store.sync([order('o2', 'c2', '2026-06-01T09:00:00Z', { totalMinor: 999 })]));
    expect(late.conflicts[0].resolution).toBe('lww_existing_newer');
    expect((await asA(() => store.getRow('field_order', 'o2')))?.data.totalMinor).toBe(100);
  });

  it('stock_position is server-authoritative', async () => {
    await asA(() => store.sync([{ clientMutationId: 's1', entity: 'stock_position', op: 'create', payload: { id: 'sku-1', qty: 10 } }]));
    const conflict = await asA(() => store.sync([{ clientMutationId: 's2', entity: 'stock_position', op: 'update', payload: { id: 'sku-1', qty: 999 } }]));
    expect(conflict.conflicts[0].resolution).toBe('server_authoritative_kept');
    expect((await asA(() => store.getRow('stock_position', 'sku-1')))?.data.qty).toBe(10);
  });

  it('enforces RLS: tenant B cannot see tenant A rows', async () => {
    const seen = await asB(() => store.getRow('field_order', 'o1'));
    expect(seen).toBeUndefined();
  });

  it('op-log is append-only at the database level', async () => {
    await expect(pool.query("UPDATE sync_mutation SET resolution = 'x'")).rejects.toThrow(/append-only/);
    await expect(pool.query('DELETE FROM sync_mutation')).rejects.toThrow(/append-only/);
  });
});
