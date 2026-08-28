/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { InMemoryMeterSink } from '@abetworks/core';
import { InMemoryAttributionStore } from './attribution';
import { buildServer } from './server';

const SECRET = 'dev-secret-change-me';
const auth = {
  authorization: `Bearer ${jwt.sign({ sub: 'u', tenant_id: 'tenant-at', roles: ['sales'] }, SECRET)}`,
};

describe('attribution-svc metering', () => {
  it('emits a billable "records" event per attribution touch recorded', async () => {
    const meterSink = new InMemoryMeterSink();
    const app = buildServer(new InMemoryAttributionStore(), { meterSink: meterSink.sink });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/attribution/events',
      headers: auth,
      payload: { recordId: 'r1', source: 'portal:99acres' },
    });
    expect(res.statusCode).toBe(201);
    expect(meterSink.events).toHaveLength(1);
    expect(meterSink.events[0]).toMatchObject({
      tenantId: 'tenant-at',
      meter: 'records',
      service: 'attribution-svc',
      eventId: res.json().id,
    });
  });

  it('requires auth', async () => {
    const app = buildServer();
    const res = await app.inject({ method: 'POST', url: '/v1/attribution/events', payload: {} });
    expect(res.statusCode).toBe(401);
  });
});
