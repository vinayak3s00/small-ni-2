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
const token = (tenantId: string, roles: string[] = ['compliance_officer']) =>
  jwt.sign({ sub: 'officer', tenant_id: tenantId, roles }, SECRET);

describe('kyc-svc API (observability)', () => {
  let app: ReturnType<typeof buildServer>;
  beforeAll(() => {
    app = buildServer();
  });

  it('serves liveness and readiness', async () => {
    expect((await app.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);
    const ready = await app.inject({ method: 'GET', url: '/readyz' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({ status: 'ok', checks: { db: 'ok' } });
  });

  it('reports 503 when the db ping fails', async () => {
    const degraded = buildServer({ dbPing: () => false });
    const ready = await degraded.inject({ method: 'GET', url: '/readyz' });
    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toMatchObject({ status: 'degraded', checks: { db: 'fail' } });
  });

  it('rejects unauthenticated requests with a consistent shape + request id', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/kyc', payload: {} });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatchObject({ code: 'unauthorized' });
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('echoes an inbound x-request-id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-request-id': 'trace-7' },
    });
    expect(res.headers['x-request-id']).toBe('trace-7');
  });

  it('runs the KYC lifecycle and maps domain errors to stable codes', async () => {
    const auth = { authorization: `Bearer ${token('tenant-a')}` };
    const created = await app.inject({
      method: 'POST',
      url: '/v1/kyc',
      headers: auth,
      payload: { partyId: 'p1' },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;

    // Invalid transition (pending -> verified) => 409 conflict shape.
    const bad = await app.inject({
      method: 'POST',
      url: `/v1/kyc/${id}/transition`,
      headers: auth,
      payload: { to: 'verified' },
    });
    expect(bad.statusCode).toBe(409);
    expect(bad.json().error).toMatchObject({ code: 'conflict' });

    // Unknown record => 404 not_found shape.
    const missing = await app.inject({ method: 'GET', url: '/v1/kyc/nope', headers: auth });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error).toMatchObject({ code: 'not_found' });
  });

  it('returns 400 for missing partyId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/kyc',
      headers: { authorization: `Bearer ${token('tenant-a')}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatchObject({ code: 'bad_request' });
  });

  it('emits a billable "ai_actions" meter event on KYC creation', async () => {
    const meterSink = new InMemoryMeterSink();
    const metered = buildServer({ meterSink: meterSink.sink });
    const created = await metered.inject({
      method: 'POST',
      url: '/v1/kyc',
      headers: { authorization: `Bearer ${token('tenant-m')}` },
      payload: { partyId: 'p1' },
    });
    expect(created.statusCode).toBe(201);
    expect(meterSink.events).toHaveLength(1);
    expect(meterSink.events[0]).toMatchObject({
      tenantId: 'tenant-m',
      meter: 'ai_actions',
      service: 'kyc-svc',
      eventId: created.json().id,
    });
  });
});
