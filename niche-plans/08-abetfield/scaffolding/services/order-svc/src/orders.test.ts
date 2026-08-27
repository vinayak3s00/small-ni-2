/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { describe, it, expect } from 'vitest';
import { runWithPrincipal } from '@abetworks/core';
import { InMemoryOrderStore, InsufficientStockError, UnknownSkuError } from './orders';

const principal = { sub: 'rep-1', tenantId: 't1', roles: ['field_rep'] };
const ctx = <T>(fn: () => Promise<T>) => runWithPrincipal(principal, fn);

async function storeWithStock() {
  const store = new InMemoryOrderStore();
  await ctx(async () => {
    await store.setItem({ sku: 'A', name: 'Item A', priceMinor: 10000, gstRate: 0.18 }, 10);
    await store.setItem({ sku: 'B', name: 'Item B', priceMinor: 25000, gstRate: 0.05 }, 3);
  });
  return store;
}

describe('InMemoryOrderStore', () => {
  it('places a GST-aware order and allocates stock', async () => {
    const store = await storeWithStock();
    const order = await ctx(() => store.place('c1', 'outlet-1', 'INR', [{ sku: 'A', qty: 2 }]));
    expect(order.subtotalMinor).toBe(20000);
    expect(order.gstMinor).toBe(3600);
    expect(order.totalMinor).toBe(23600);
    expect(await ctx(() => store.stockOf('A'))).toBe(8);
  });

  it('rejects the whole order when any line exceeds stock (all-or-nothing)', async () => {
    const store = await storeWithStock();
    await expect(
      ctx(() => store.place('c1', 'outlet-1', 'INR', [{ sku: 'A', qty: 1 }, { sku: 'B', qty: 5 }])),
    ).rejects.toBeInstanceOf(InsufficientStockError);
    expect(await ctx(() => store.stockOf('A'))).toBe(10); // nothing deducted
  });

  it('is idempotent on clientOrderId', async () => {
    const store = await storeWithStock();
    const first = await ctx(() => store.place('c1', 'outlet-1', 'INR', [{ sku: 'A', qty: 2 }]));
    const replay = await ctx(() => store.place('c1', 'outlet-1', 'INR', [{ sku: 'A', qty: 2 }]));
    expect(replay.id).toBe(first.id);
    expect(await ctx(() => store.stockOf('A'))).toBe(8); // deducted once
  });

  it('rejects unknown sku', async () => {
    const store = await storeWithStock();
    await expect(
      ctx(() => store.place('c1', 'o1', 'INR', [{ sku: 'Z', qty: 1 }])),
    ).rejects.toBeInstanceOf(UnknownSkuError);
  });

  it('is tenant-scoped for stock', async () => {
    const store = await storeWithStock();
    const other = { sub: 'x', tenantId: 't2', roles: [] };
    expect(await runWithPrincipal(other, () => store.stockOf('A'))).toBe(0);
  });
});
