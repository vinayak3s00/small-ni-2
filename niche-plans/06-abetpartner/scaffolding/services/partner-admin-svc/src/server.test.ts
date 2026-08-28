/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { InMemoryMeterSink } from '@abetworks/core';
import { InMemoryPartnerStore } from './partner';
import { buildServer } from './server';

const SECRET = 'dev-secret-change-me';
// The partner (agency) is the tenant.
const auth = {
  authorization: `Bearer ${jwt.sign({ sub: 'owner', tenant_id: 'partner-1', roles: ['owner'] }, SECRET)}`,
};

describe('partner-admin-svc metering', () => {
  it('emits a billable "records" event per workspace provisioned', async () => {
    const meterSink = new InMemoryMeterSink();
    const app = buildServer(new InMemoryPartnerStore(), { meterSink: meterSink.sink });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/workspaces',
      headers: auth,
      payload: { clientName: 'Acme Retail' },
    });
    expect(res.statusCode).toBe(201);
    expect(meterSink.events).toHaveLength(1);
    expect(meterSink.events[0]).toMatchObject({
      tenantId: 'partner-1',
      meter: 'records',
      service: 'partner-admin-svc',
      eventId: res.json().id,
    });
  });

  it('does not bill a duplicate workspace (409)', async () => {
    const meterSink = new InMemoryMeterSink();
    const app = buildServer(new InMemoryPartnerStore(), { meterSink: meterSink.sink });
    const payload = { clientName: 'Acme Retail' };
    await app.inject({ method: 'POST', url: '/v1/workspaces', headers: auth, payload });
    const dup = await app.inject({ method: 'POST', url: '/v1/workspaces', headers: auth, payload });
    expect(dup.statusCode).toBe(409);
    expect(meterSink.events).toHaveLength(1); // only the first provisioning billed
  });
});
