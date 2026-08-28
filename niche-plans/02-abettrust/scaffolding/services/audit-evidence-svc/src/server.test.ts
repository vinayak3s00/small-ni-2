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
const token = (roles: string[]) =>
  jwt.sign({ sub: 'officer', tenant_id: 'tenant-a', roles }, SECRET);

describe('audit-evidence-svc API (observability)', () => {
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
  });

  it('appends an audit event and echoes a request id', async () => {
    const auth = { authorization: `Bearer ${token(['compliance_officer'])}` };
    const res = await app.inject({
      method: 'POST',
      url: '/v1/audit/events',
      headers: auth,
      payload: { action: 'export', entity: 'kyc_record', entityId: 'k-1' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ seq: 0, action: 'export' });
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('forbids querying without the compliance role (stable shape)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/audit/events',
      headers: { authorization: `Bearer ${token(['sales'])}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatchObject({ code: 'forbidden' });
  });

  it('requires a period for evidence packs', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/evidence/packs',
      headers: { authorization: `Bearer ${token(['compliance_officer'])}` },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatchObject({ code: 'bad_request' });
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/audit/verify' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toMatchObject({ code: 'unauthorized' });
  });

  it('emits a billable "records" meter event per audit event appended', async () => {
    const meterSink = new InMemoryMeterSink();
    const metered = buildServer({ meterSink: meterSink.sink });
    const res = await metered.inject({
      method: 'POST',
      url: '/v1/audit/events',
      headers: { authorization: `Bearer ${token(['compliance_officer'])}` },
      payload: { action: 'export', entity: 'kyc_record', entityId: 'k-1' },
    });
    expect(res.statusCode).toBe(201);
    expect(meterSink.events).toHaveLength(1);
    expect(meterSink.events[0]).toMatchObject({
      tenantId: 'tenant-a',
      meter: 'records',
      service: 'audit-evidence-svc',
    });
  });
});
