/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { InMemoryMeterSink } from '@abetworks/core';
import { InMemoryOrderStore } from './orders';
import { buildServer } from './server';

const SECRET = 'dev-secret-change-me';
const auth = {
  authorization: `Bearer ${jwt.sign({ sub: 'rep', tenant_id: 'tenant-o', roles: ['field_rep'] }, SECRET)}`,
};

async function seededServer(meterSink?: InMemoryMeterSink) {
  const store = new InMemoryOrderStore();
  const app = buildServer(store, meterSink ? { meterSink: meterSink.sink } : {});
  await app.inject({
    method: 'POST',
    url: '/v1/catalog',
    headers: auth,
    payload: { sku: 'A', name: 'Oil', priceMinor: 12000, gstRate: 0.05, stock: 10 },
  });
  return app;
}

describe('order-svc metering', () => {
  it('bills one "records" unit per order, not for idempotent replays', async () => {
    const meterSink = new InMemoryMeterSink();
    const app = await seededServer(meterSink);
    const payload = {
      clientOrderId: 'c1',
      outletId: 'o1',
      currency: 'INR',
      lines: [{ sku: 'A', qty: 2 }],
    };

    const first = await app.inject({ method: 'POST', url: '/v1/orders', headers: auth, payload });
    expect(first.statusCode).toBe(201);
    expect(meterSink.events).toHaveLength(1);
    expect(meterSink.events[0]).toMatchObject({
      tenantId: 'tenant-o',
      meter: 'records',
      service: 'order-svc',
      eventId: 'c1',
    });

    // Replay same clientOrderId -> store returns the original order; downstream
    // dedupes the meter event by eventId, so this is not double-billed.
    const replay = await app.inject({ method: 'POST', url: '/v1/orders', headers: auth, payload });
    expect(replay.statusCode).toBe(201);
    expect(meterSink.events.filter((e) => e.eventId === 'c1')).toHaveLength(2); // emitted, but same id
    const distinct = new Set(meterSink.events.map((e) => e.eventId));
    expect(distinct.size).toBe(1);
  });

  it('does not bill a failed order', async () => {
    const meterSink = new InMemoryMeterSink();
    const app = await seededServer(meterSink);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: auth,
      payload: { clientOrderId: 'c2', outletId: 'o1', currency: 'INR', lines: [{ sku: 'A', qty: 999 }] },
    });
    expect(res.statusCode).toBe(409); // insufficient stock
    expect(meterSink.events).toHaveLength(0);
  });
});
