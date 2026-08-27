import { describe, it, expect, beforeAll } from 'vitest';
import jwt from 'jsonwebtoken';
import { buildServer } from './server';

const SECRET = 'dev-secret-change-me';
const tokenFor = (tenantId: string) =>
  jwt.sign({ sub: 'u1', tenant_id: tenantId, roles: ['sales'] }, SECRET);

describe('core-crm API', () => {
  let app: ReturnType<typeof buildServer>;
  beforeAll(() => {
    app = buildServer();
  });

  it('rejects unauthenticated requests', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/records' });
    expect(res.statusCode).toBe(401);
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

    // A different tenant sees nothing (isolation).
    const other = await app.inject({
      method: 'GET',
      url: '/v1/records',
      headers: { authorization: `Bearer ${tokenFor('tenant-b')}` },
    });
    expect(other.json()).toHaveLength(0);
  });

  it('prevents double-booking the same slot', async () => {
    const auth = { authorization: `Bearer ${tokenFor('tenant-c')}` };
    const payload = { recordId: 'r1', resourceId: 'agent-1', slotStart: '2026-09-01T10:00:00Z' };
    const first = await app.inject({ method: 'POST', url: '/v1/bookings', headers: auth, payload });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({ method: 'POST', url: '/v1/bookings', headers: auth, payload });
    expect(second.statusCode).toBe(409);
  });
});
