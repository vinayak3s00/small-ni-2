/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { InMemoryMeterSink } from '@abetworks/core';
import { SyncEngine } from './sync';
import { buildServer } from './server';

const SECRET = 'dev-secret-change-me';
const auth = {
  authorization: `Bearer ${jwt.sign({ sub: 'rep', tenant_id: 'tenant-f', roles: ['field_rep'] }, SECRET)}`,
};

const mutation = (cmid: string) => ({
  clientMutationId: cmid,
  entity: 'field_order' as const,
  op: 'update' as const,
  payload: { id: 'o1', updatedAt: '2026-06-01T10:00:00Z', totalMinor: 5000 },
});

describe('sync-gateway metering', () => {
  it('bills one "records" unit per newly-applied mutation, not for duplicates', async () => {
    const meterSink = new InMemoryMeterSink();
    const app = buildServer(new SyncEngine(), { meterSink: meterSink.sink });

    const first = await app.inject({
      method: 'POST',
      url: '/v1/sync',
      headers: auth,
      payload: { mutations: [mutation('m1'), mutation('m2')] },
    });
    expect(first.statusCode).toBe(200);
    expect(meterSink.events).toHaveLength(2);
    expect(meterSink.events.every((e) => e.meter === 'records' && e.tenantId === 'tenant-f')).toBe(true);

    // Replaying the same mutations => duplicates, so no new billing.
    await app.inject({
      method: 'POST',
      url: '/v1/sync',
      headers: auth,
      payload: { mutations: [mutation('m1'), mutation('m2')] },
    });
    expect(meterSink.events).toHaveLength(2);
  });

  it('requires auth', async () => {
    const app = buildServer();
    const res = await app.inject({ method: 'POST', url: '/v1/sync', payload: { mutations: [] } });
    expect(res.statusCode).toBe(401);
  });
});
