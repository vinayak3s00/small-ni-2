/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { describe, it, expect, beforeAll } from 'vitest';
import jwt from 'jsonwebtoken';
import { InMemoryMeterSink } from '@abetworks/core';
import { buildServer } from './server';

const SECRET = 'dev-secret-change-me';
const tokenFor = (tenantId: string) =>
  jwt.sign({ sub: 'u1', tenant_id: tenantId, roles: ['sales'] }, SECRET);

describe('core-crm API', () => {
  let app: ReturnType<typeof buildServer>;
  beforeAll(() => {
    app = buildServer();
  });

  it('serves liveness and readiness', async () => {
    const health = await app.inject({ method: 'GET', url: '/healthz' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ status: 'ok' });

    const ready = await app.inject({ method: 'GET', url: '/readyz' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({ status: 'ok', checks: { db: 'ok' } });
  });

  it('reports 503 from readiness when the db ping fails', async () => {
    const degraded = buildServer({ dbPing: () => false });
    const ready = await degraded.inject({ method: 'GET', url: '/readyz' });
    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toMatchObject({ status: 'degraded', checks: { db: 'fail' } });
  });

  it('rejects unauthenticated requests with a consistent error shape + request id', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/records' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatchObject({ code: 'unauthorized' });
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('echoes an inbound x-request-id for correlation', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-request-id': 'trace-42' },
    });
    expect(res.headers['x-request-id']).toBe('trace-42');
  });

  it('creates and lists records scoped to the tenant', async () => {
    const auth = { authorization: `Bearer ${tokenFor('tenant-a')}` };
    const create = await app.inject({
      method: 'POST',
      url: '/v1/records',
      headers: auth,
      payload: { vertical: 'realty', source: 'portal', party: { name: 'Asha' } },
    });
    expect(create.statusCode).toBe(201);

    const list = await app.inject({ method: 'GET', url: '/v1/records', headers: auth });
    expect(list.json()).toHaveLength(1);

    const other = await app.inject({
      method: 'GET',
      url: '/v1/records',
      headers: { authorization: `Bearer ${tokenFor('tenant-b')}` },
    });
    expect(other.json()).toHaveLength(0);
  });

  it('returns a 400 with a stable code for invalid input', async () => {
    const auth = { authorization: `Bearer ${tokenFor('tenant-a')}` };
    const res = await app.inject({ method: 'POST', url: '/v1/records', headers: auth, payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatchObject({ code: 'bad_request' });
  });

  it('prevents double-booking the same slot with a conflict error shape', async () => {
    const auth = { authorization: `Bearer ${tokenFor('tenant-c')}` };
    const payload = { recordId: 'r1', resourceId: 'agent-1', slotStart: '2026-09-01T10:00:00Z' };
    const first = await app.inject({ method: 'POST', url: '/v1/bookings', headers: auth, payload });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({ method: 'POST', url: '/v1/bookings', headers: auth, payload });
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toMatchObject({ code: 'conflict' });
  });

  it('emits a billable "records" meter event on record creation', async () => {
    const meterSink = new InMemoryMeterSink();
    const metered = buildServer({ meterSink: meterSink.sink });
    const auth = { authorization: `Bearer ${tokenFor('tenant-bill')}` };
    const created = await metered.inject({
      method: 'POST',
      url: '/v1/records',
      headers: auth,
      payload: { vertical: 'realty', source: 'portal', party: { name: 'Asha' } },
    });
    expect(created.statusCode).toBe(201);
    expect(meterSink.events).toHaveLength(1);
    expect(meterSink.events[0]).toMatchObject({
      tenantId: 'tenant-bill',
      meter: 'records',
      quantity: 1,
      service: 'core-crm',
      eventId: created.json().id, // idempotent: tied to the record id
    });
  });
});
