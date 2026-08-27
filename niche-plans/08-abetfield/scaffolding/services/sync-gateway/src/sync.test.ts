/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { describe, it, expect } from 'vitest';
import { runWithPrincipal } from '@abetworks/core';
import { SyncEngine, type Mutation } from './sync';

const principal = { sub: 'rep-1', tenantId: 't1', roles: ['field_rep'] };
const ctx = <T>(fn: () => Promise<T>) => runWithPrincipal(principal, fn);

const order = (id: string, cmid: string, updatedAt: string, extra: any = {}): Mutation => ({
  clientMutationId: cmid,
  entity: 'field_order',
  op: 'update',
  payload: { id, updatedAt, ...extra },
});

describe('SyncEngine — offline-first', () => {
  it('applies new mutations and replays idempotently', async () => {
    const e = new SyncEngine();
    const m = order('o1', 'cmid-1', '2026-06-01T10:00:00Z', { totalMinor: 5000 });
    const r1 = await ctx(() => e.sync([m]));
    expect(r1.applied).toEqual(['cmid-1']);
    const r2 = await ctx(() => e.sync([m]));
    expect(r2.applied).toEqual([]);
    expect(r2.duplicates).toEqual(['cmid-1']);
  });

  it('field_order uses last-writer-wins by client timestamp', async () => {
    const e = new SyncEngine();
    await ctx(() => e.sync([order('o1', 'c1', '2026-06-01T10:00:00Z', { totalMinor: 100 })]));
    const late = await ctx(() => e.sync([order('o1', 'c2', '2026-06-01T09:00:00Z', { totalMinor: 999 })]));
    expect(late.conflicts[0].resolution).toBe('lww_existing_newer');
    expect((await ctx(() => e.getRow('field_order', 'o1')))?.data.totalMinor).toBe(100);
  });

  it('stock_position is server-authoritative on conflict', async () => {
    const e = new SyncEngine();
    await ctx(() =>
      e.sync([{ clientMutationId: 's1', entity: 'stock_position', op: 'create', payload: { id: 'sku-1', qty: 10 } }]),
    );
    const conflict = await ctx(() =>
      e.sync([{ clientMutationId: 's2', entity: 'stock_position', op: 'update', payload: { id: 'sku-1', qty: 999 } }]),
    );
    expect(conflict.conflicts[0].resolution).toBe('server_authoritative_kept');
    expect((await ctx(() => e.getRow('stock_position', 'sku-1')))?.data.qty).toBe(10);
  });

  it('visits are append-only and tenant-isolated', async () => {
    const e = new SyncEngine();
    const other = { sub: 'rep-2', tenantId: 't2', roles: ['field_rep'] };
    await ctx(() =>
      e.sync([{ clientMutationId: 'v1', entity: 'visit', op: 'create', payload: { id: 'outlet-1' } }]),
    );
    const seen = await runWithPrincipal(other, () => e.getRow('visit', 'v1'));
    expect(seen).toBeUndefined();
  });
});
