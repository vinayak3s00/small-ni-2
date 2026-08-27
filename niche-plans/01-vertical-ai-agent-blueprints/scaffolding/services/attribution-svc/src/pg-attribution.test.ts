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
import { PgAttributionStore } from './pg-attribution';

const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;

const TA = '11111111-1111-1111-1111-111111111111';
const TB = '22222222-2222-2222-2222-222222222222';
const asA = <T>(fn: () => Promise<T>) =>
  runWithPrincipal({ sub: 'u', tenantId: TA, roles: ['sales'] }, fn);
const asB = <T>(fn: () => Promise<T>) =>
  runWithPrincipal({ sub: 'u', tenantId: TB, roles: ['sales'] }, fn);

d('PgAttributionStore (integration)', () => {
  let pool: Pool;
  let store: PgAttributionStore;

  beforeAll(async () => {
    pool = createPool();
    await migrate(pool);
    await pool.query('TRUNCATE attribution_event RESTART IDENTITY');
    store = new PgAttributionStore(pool);
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it('records touches and resolves last_touch to the channel partner', async () => {
    await asA(async () => {
      await store.record({ recordId: 'r1', source: 'portal:99acres', occurredAt: '2026-06-01T09:00:00Z' });
      await store.record({ recordId: 'r1', source: 'cp', partnerCode: 'CP-042', occurredAt: '2026-06-03T09:00:00Z' });
    });
    const shares = await asA(() => store.attribute('r1', 'last_touch'));
    expect(shares[0].partnerCode).toBe('CP-042');
  });

  it('linear shares sum to 1', async () => {
    const shares = await asA(() => store.attribute('r1', 'linear'));
    expect(shares.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(1, 10);
  });

  it('enforces RLS: tenant B cannot see tenant A touches', async () => {
    const touches = await asB(() => store.touches('r1'));
    expect(touches).toHaveLength(0);
  });

  it('is append-only at the database level (UPDATE blocked)', async () => {
    await asA(() => store.record({ recordId: 'r2', source: 'meta_ads' }));
    await expect(pool.query("UPDATE attribution_event SET source = 'tampered'")).rejects.toThrow(
      /append-only/,
    );
    await expect(pool.query('DELETE FROM attribution_event')).rejects.toThrow(/append-only/);
  });
});
