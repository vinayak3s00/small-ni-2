/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { describe, it, expect } from 'vitest';
import { runWithPrincipal } from '@abetworks/core';
import { OrderService, InsufficientStockError, UnknownSkuError } from './orders';

const principal = { sub: 'rep-1', tenantId: 't1', roles: ['field_rep'] };
const ctx = <T>(fn: () => T) => runWithPrincipal(principal, fn);

function svcWithStock() {
  const svc = new OrderService();
  ctx(() => {
    svc.setItem({ sku: 'A', name: 'Item A', priceMinor: 10000, gstRate: 0.18 }, 10);
    svc.setItem({ sku: 'B', name: 'Item B', priceMinor: 25000, gstRate: 0.05 }, 3);
  });
  return svc;
}

describe('OrderService', () => {
  it('places a GST-aware order and allocates stock', () => {
    const svc = svcWithStock();
    const order = ctx(() => svc.place('c1', 'outlet-1', 'INR', [{ sku: 'A', qty: 2 }]));
    expect(order.subtotalMinor).toBe(20000);
    expect(order.gstMinor).toBe(3600);
    expect(order.totalMinor).toBe(23600);
    expect(ctx(() => svc.stockOf('A'))).toBe(8); // 10 - 2
  });

  it('rejects the whole order when any line exceeds stock (all-or-nothing)', () => {
    const svc = svcWithStock();
    expect(() =>
      ctx(() => svc.place('c1', 'outlet-1', 'INR', [{ sku: 'A', qty: 1 }, { sku: 'B', qty: 5 }])),
    ).toThrow(InsufficientStockError);
    // No stock should have been deducted from A since the order failed.
    expect(ctx(() => svc.stockOf('A'))).toBe(10);
  });

  it('is idempotent on clientOrderId', () => {
    const svc = svcWithStock();
    const first = ctx(() => svc.place('c1', 'outlet-1', 'INR', [{ sku: 'A', qty: 2 }]));
    const replay = ctx(() => svc.place('c1', 'outlet-1', 'INR', [{ sku: 'A', qty: 2 }]));
    expect(replay.id).toBe(first.id);
    expect(ctx(() => svc.stockOf('A'))).toBe(8); // only deducted once
  });

  it('rejects unknown sku', () => {
    const svc = svcWithStock();
    expect(() => ctx(() => svc.place('c1', 'o1', 'INR', [{ sku: 'Z', qty: 1 }]))).toThrow(UnknownSkuError);
  });

  it('is tenant-scoped for stock', () => {
    const svc = svcWithStock();
    const other = { sub: 'x', tenantId: 't2', roles: [] };
    expect(runWithPrincipal(other, () => svc.stockOf('A'))).toBe(0);
  });
});
