/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { describe, it, expect } from 'vitest';
import { buildQuote, UnknownSkuError, type CatalogItem } from './quoting';
import { InMemoryOptInStore, guardOutbound } from './optin';

const catalog = new Map<string, CatalogItem>([
  ['A', { sku: 'A', name: 'Item A', priceMinor: 10000, gstRate: 0.18 }], // ₹100 @18%
  ['B', { sku: 'B', name: 'Item B', priceMinor: 25000, gstRate: 0.05 }], // ₹250 @5%
]);

describe('buildQuote (GST-aware, minor units)', () => {
  it('computes GST and totals correctly for a single line', () => {
    const q = buildQuote(catalog, 'INR', [{ sku: 'A', qty: 2 }]);
    expect(q.subtotalMinor).toBe(20000); // ₹200
    expect(q.gstMinor).toBe(3600); // 18% of 20000
    expect(q.totalMinor).toBe(23600);
    expect(q.currency).toBe('INR');
  });

  it('sums multiple lines with different GST rates', () => {
    const q = buildQuote(catalog, 'INR', [
      { sku: 'A', qty: 1 },
      { sku: 'B', qty: 1 },
    ]);
    expect(q.subtotalMinor).toBe(35000);
    expect(q.gstMinor).toBe(1800 + 1250); // 18% of 10000 + 5% of 25000
    expect(q.totalMinor).toBe(35000 + 3050);
  });

  it('supports non-INR currency label (multi-currency)', () => {
    const q = buildQuote(catalog, 'USD', [{ sku: 'A', qty: 1 }]);
    expect(q.currency).toBe('USD');
  });

  it('rejects unknown sku', () => {
    expect(() => buildQuote(catalog, 'INR', [{ sku: 'Z', qty: 1 }])).toThrow(UnknownSkuError);
  });

  it('rejects non-positive qty', () => {
    expect(() => buildQuote(catalog, 'INR', [{ sku: 'A', qty: 0 }])).toThrow(/positive/);
  });
});

describe('guardOutbound (WhatsApp opt-in + quality)', () => {
  it('blocks when not opted in', () => {
    const store = new InMemoryOptInStore();
    const r = guardOutbound(store, 't1', 'p1', 'Hello, your order shipped.');
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/opted in/);
  });

  it('allows a clean template once opted in', () => {
    const store = new InMemoryOptInStore();
    store.grant('t1', 'p1');
    const r = guardOutbound(store, 't1', 'p1', 'Hello, your order shipped.');
    expect(r.allowed).toBe(true);
  });

  it('blocks spammy templates to protect quality rating', () => {
    const store = new InMemoryOptInStore();
    store.grant('t1', 'p1');
    const r = guardOutbound(store, 't1', 'p1', 'WINNER! CLICK NOW for FREE!!!');
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/quality/);
  });
});
