/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { describe, it, expect } from 'vitest';
import { runWithPrincipal } from '@abetworks/core';
import { InMemoryAttributionStore } from './attribution';

const principal = { sub: 'u1', tenantId: 't1', roles: ['sales'] };
const ctx = <T>(fn: () => Promise<T>) => runWithPrincipal(principal, fn);

async function seed(store: InMemoryAttributionStore, recordId: string) {
  await store.record({ recordId, source: 'portal:99acres', occurredAt: '2026-06-01T09:00:00Z' });
  await store.record({ recordId, source: 'meta_ads', campaign: 'monsoon', occurredAt: '2026-06-02T09:00:00Z' });
  await store.record({ recordId, source: 'cp', partnerCode: 'CP-042', occurredAt: '2026-06-03T09:00:00Z' });
}

describe('InMemoryAttributionStore', () => {
  it('orders touches chronologically', async () => {
    const store = new InMemoryAttributionStore();
    await ctx(() => seed(store, 'r1'));
    const touches = await ctx(() => store.touches('r1'));
    expect(touches.map((t) => t.source)).toEqual(['portal:99acres', 'meta_ads', 'cp']);
  });

  it('last_touch credits the final touch fully', async () => {
    const store = new InMemoryAttributionStore();
    await ctx(() => seed(store, 'r1'));
    const shares = await ctx(() => store.attribute('r1', 'last_touch'));
    expect(shares).toHaveLength(1);
    expect(shares[0].partnerCode).toBe('CP-042');
    expect(shares[0].weight).toBe(1);
  });

  it('first_touch credits the first touch fully', async () => {
    const store = new InMemoryAttributionStore();
    await ctx(() => seed(store, 'r1'));
    const shares = await ctx(() => store.attribute('r1', 'first_touch'));
    expect(shares[0].source).toBe('portal:99acres');
  });

  it('linear splits weight evenly and sums to 1', async () => {
    const store = new InMemoryAttributionStore();
    await ctx(() => seed(store, 'r1'));
    const shares = await ctx(() => store.attribute('r1', 'linear'));
    expect(shares).toHaveLength(3);
    expect(shares.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(1, 10);
  });

  it('is tenant-isolated', async () => {
    const store = new InMemoryAttributionStore();
    await ctx(() => seed(store, 'r1'));
    const other = { sub: 'x', tenantId: 't2', roles: [] };
    const touches = await runWithPrincipal(other, () => store.touches('r1'));
    expect(touches).toHaveLength(0);
  });

  it('returns no shares for an unknown record', async () => {
    const store = new InMemoryAttributionStore();
    expect(await ctx(() => store.attribute('nope'))).toEqual([]);
  });
});
