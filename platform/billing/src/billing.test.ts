/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { describe, it, expect } from 'vitest';
import { MeterAggregator, type MeterEvent } from './metering';
import { calculateInvoice, serviceCreditMinor } from './invoice';
import { getPlan } from './pricing';

const ev = (id: string, meter: MeterEvent['meter'], qty: number, tenant = 't1'): MeterEvent => ({
  eventId: id,
  tenantId: tenant,
  meter,
  quantity: qty,
  at: '2026-06-01T00:00:00Z',
});

describe('MeterAggregator', () => {
  it('rolls usage up per tenant + meter', () => {
    const agg = new MeterAggregator();
    agg.ingest(ev('e1', 'records', 100));
    agg.ingest(ev('e2', 'records', 50));
    agg.ingest(ev('e3', 'messages', 20));
    const u = agg.usageFor('t1');
    expect(u.records).toBe(150);
    expect(u.messages).toBe(20);
    expect(u.voice_minutes).toBe(0);
  });

  it('is idempotent on eventId (at-least-once safe)', () => {
    const agg = new MeterAggregator();
    expect(agg.ingest(ev('dup', 'records', 10))).toBe(true);
    expect(agg.ingest(ev('dup', 'records', 10))).toBe(false); // ignored
    expect(agg.usageFor('t1').records).toBe(10);
  });

  it('isolates usage per tenant', () => {
    const agg = new MeterAggregator();
    agg.ingest(ev('a', 'records', 5, 't1'));
    agg.ingest(ev('b', 'records', 9, 't2'));
    expect(agg.usageFor('t1').records).toBe(5);
    expect(agg.usageFor('t2').records).toBe(9);
  });

  it('rejects negative quantities', () => {
    const agg = new MeterAggregator();
    expect(() => agg.ingest(ev('x', 'records', -1))).toThrow(/non-negative/);
  });
});

describe('calculateInvoice', () => {
  const zeroUsage = { records: 0, messages: 0, voice_minutes: 0, ai_actions: 0 };

  it('charges only the per-seat fee when usage is within allowances', () => {
    const inv = calculateInvoice({ planId: 'growth', seats: 5, usage: zeroUsage });
    // 5 seats x ₹1499 = ₹7495 = 749500 paise
    expect(inv.subtotalMinor).toBe(749500);
    expect(inv.totalMinor).toBe(749500);
    expect(inv.lines).toHaveLength(1);
  });

  it('adds metered overage beyond the included allowance', () => {
    const plan = getPlan('growth');
    // 10,500 records => 500 over included (10,000) at ₹0.5 = ₹250 = 25000 paise
    const inv = calculateInvoice({
      planId: 'growth',
      seats: 1,
      usage: { ...zeroUsage, records: 10_500 },
    });
    const overageLine = inv.lines.find((l) => l.description.includes('Records overage'));
    expect(overageLine?.amountMinor).toBe(500 * plan.meters.records.overageMinor);
    expect(inv.subtotalMinor).toBe(plan.perSeatMinor + 500 * plan.meters.records.overageMinor);
  });

  it('applies GST when a rate is provided', () => {
    const inv = calculateInvoice({ planId: 'growth', seats: 1, usage: zeroUsage, gstRate: 0.18 });
    expect(inv.gstMinor).toBe(Math.round(inv.subtotalMinor * 0.18));
    expect(inv.totalMinor).toBe(inv.subtotalMinor + inv.gstMinor);
  });

  it('free plan bills nothing even with usage (capped, not metered)', () => {
    const inv = calculateInvoice({
      planId: 'free',
      seats: 3,
      usage: { ...zeroUsage, records: 999999 },
    });
    expect(inv.totalMinor).toBe(0);
    expect(inv.lines).toHaveLength(0);
  });
});

describe('serviceCreditMinor (SLA)', () => {
  const monthly = 100_000; // ₹1000
  it('no credit when uptime meets the top tier', () => {
    expect(serviceCreditMinor(monthly, 0.9996)).toBe(0);
  });
  it('10% between 99.9 and 99.95', () => {
    expect(serviceCreditMinor(monthly, 0.9992)).toBe(10_000);
  });
  it('25% between 99.0 and 99.9', () => {
    expect(serviceCreditMinor(monthly, 0.995)).toBe(25_000);
  });
  it('50% below 99.0', () => {
    expect(serviceCreditMinor(monthly, 0.98)).toBe(50_000);
  });
});
