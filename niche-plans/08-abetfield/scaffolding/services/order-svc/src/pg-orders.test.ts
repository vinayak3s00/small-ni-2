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
import { PgOrderStore } from './pg-orders';
import { InsufficientStockError } from './orders';

const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;

const TA = '11111111-1111-1111-1111-111111111111';
const TB = '22222222-2222-2222-2222-222222222222';
const asA = <T>(fn: () => Promise<T>) =>
  runWithPrincipal({ sub: 'rep-a', tenantId: TA, roles: ['field_rep'] }, fn);
const asB = <T>(fn: () => Promise<T>) =>
  runWithPrincipal({ sub: 'rep-b', tenantId: TB, roles: ['field_rep'] }, fn);

d('PgOrderStore (integration)', () => {
  let pool: Pool;
  let store: PgOrderStore;

  beforeAll(async () => {
    pool = createPool();
    await migrate(pool);
    await pool.query('TRUNCATE field_order, field_order_line, stock_position, catalog_item RESTART IDENTITY CASCADE');
    store = new PgOrderStore(pool);
    await asA(async () => {
      await store.setItem({ sku: 'A', name: 'Item A', priceMinor: 10000, gstRate: 0.18 }, 10);
      await store.setItem({ sku: 'B', name: 'Item B', priceMinor: 25000, gstRate: 0.05 }, 3);
    });
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it('places a GST-aware order and decrements stock', async () => {
    const order = await asA(() => store.place('c1', 'outlet-1', 'INR', [{ sku: 'A', qty: 2 }]));
    expect(order.totalMinor).toBe(23600);
    expect(await asA(() => store.stockOf('A'))).toBe(8);
  });

  it('rolls back the whole order when a line exceeds stock', async () => {
    // B only has 3 in stock. Attempt A:1 (ok) + B:5 (too many) => nothing persists.
    const before = await asA(() => store.stockOf('A'));
    await expect(
      asA(() => store.place('c2', 'outlet-1', 'INR', [{ sku: 'A', qty: 1 }, { sku: 'B', qty: 5 }])),
    ).rejects.toBeInstanceOf(InsufficientStockError);
    expect(await asA(() => store.stockOf('A'))).toBe(before); // rolled back
  });

  it('is idempotent on clientOrderId (no double allocation)', async () => {
    const first = await asA(() => store.place('c3', 'o1', 'INR', [{ sku: 'A', qty: 1 }]));
    const stockAfterFirst = await asA(() => store.stockOf('A'));
    const replay = await asA(() => store.place('c3', 'o1', 'INR', [{ sku: 'A', qty: 1 }]));
    expect(replay.id).toBe(first.id);
    expect(await asA(() => store.stockOf('A'))).toBe(stockAfterFirst);
  });

  it('enforces RLS: tenant B has its own (empty) stock, cannot see A', async () => {
    expect(await asB(() => store.stockOf('A'))).toBe(0);
  });
});
