/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { describe, it, expect } from 'vitest';
import { runWithPrincipal } from '@abetworks/core';
import { AttributionLedger } from './attribution';

const principal = { sub: 'u1', tenantId: 't1', roles: ['sales'] };
const ctx = <T>(fn: () => T) => runWithPrincipal(principal, fn);

function seed(ledger: AttributionLedger, recordId: string) {
  ledger.record({ recordId, source: 'portal:99acres', occurredAt: '2026-06-01T09:00:00Z' });
  ledger.record({ recordId, source: 'meta_ads', campaign: 'monsoon', occurredAt: '2026-06-02T09:00:00Z' });
  ledger.record({ recordId, source: 'cp', partnerCode: 'CP-042', occurredAt: '2026-06-03T09:00:00Z' });
}

describe('AttributionLedger', () => {
  it('orders touches chronologically', () => {
    const ledger = new AttributionLedger();
    ctx(() => seed(ledger, 'r1'));
    const touches = ctx(() => ledger.touches('r1'));
    expect(touches.map((t) => t.source)).toEqual(['portal:99acres', 'meta_ads', 'cp']);
  });

  it('last_touch credits the final touch fully', () => {
    const ledger = new AttributionLedger();
    ctx(() => seed(ledger, 'r1'));
    const shares = ctx(() => ledger.attribute('r1', 'last_touch'));
    expect(shares).toHaveLength(1);
    expect(shares[0].partnerCode).toBe('CP-042');
    expect(shares[0].weight).toBe(1);
  });

  it('first_touch credits the first touch fully', () => {
    const ledger = new AttributionLedger();
    ctx(() => seed(ledger, 'r1'));
    const shares = ctx(() => ledger.attribute('r1', 'first_touch'));
    expect(shares[0].source).toBe('portal:99acres');
  });

  it('linear splits weight evenly and sums to 1', () => {
    const ledger = new AttributionLedger();
    ctx(() => seed(ledger, 'r1'));
    const shares = ctx(() => ledger.attribute('r1', 'linear'));
    expect(shares).toHaveLength(3);
    const total = shares.reduce((s, x) => s + x.weight, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('is tenant-isolated', () => {
    const ledger = new AttributionLedger();
    ctx(() => seed(ledger, 'r1'));
    const other = { sub: 'x', tenantId: 't2', roles: [] };
    const touches = runWithPrincipal(other, () => ledger.touches('r1'));
    expect(touches).toHaveLength(0);
  });

  it('returns no shares for an unknown record', () => {
    const ledger = new AttributionLedger();
    expect(ctx(() => ledger.attribute('nope'))).toEqual([]);
  });
});
