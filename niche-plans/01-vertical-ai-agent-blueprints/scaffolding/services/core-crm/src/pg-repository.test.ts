/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runWithPrincipal } from '@abetworks/core';
import { Pool } from 'pg';
import { createPool, migrate } from './db';
import { PgRepo } from './pg-repository';
import { SlotTakenError } from './repository';

// These tests exercise REAL Postgres + RLS. They run only when DATABASE_URL is
// set (e.g. `docker compose up postgres` first), and skip cleanly otherwise so
// the default `npm test` stays hermetic.
const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;

const TA = '11111111-1111-1111-1111-111111111111';
const TB = '22222222-2222-2222-2222-222222222222';
const asA = <T>(fn: () => Promise<T>) =>
  runWithPrincipal({ sub: 'u', tenantId: TA, roles: ['sales'] }, fn);
const asB = <T>(fn: () => Promise<T>) =>
  runWithPrincipal({ sub: 'u', tenantId: TB, roles: ['sales'] }, fn);

d('PgRepo (integration)', () => {
  let pool: Pool;
  let repo: PgRepo;

  beforeAll(async () => {
    pool = createPool();
    await migrate(pool);
    await pool.query('TRUNCATE record, booking');
    repo = new PgRepo(pool);
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it('persists and reads back a record within a tenant', async () => {
    const created = await asA(() =>
      repo.createRecord({
        vertical: 'realty',
        source: 'portal',
        party: { name: 'Asha', phones: ['+9199'], languages: ['hi'] },
      }),
    );
    const fetched = await asA(() => repo.getRecord(created.id));
    expect(fetched?.party.name).toBe('Asha');
    expect(fetched?.tenantId).toBe(TA);
  });

  it('enforces RLS: tenant B cannot see tenant A rows', async () => {
    await asA(() =>
      repo.createRecord({ vertical: 'realty', source: 'portal', party: { name: 'OnlyA', phones: [], languages: [] } }),
    );
    const listB = await asB(() => repo.listRecords());
    expect(listB.every((r) => r.tenantId === TB)).toBe(true);
    expect(listB.find((r) => r.party.name === 'OnlyA')).toBeUndefined();
  });

  it('stores explainable score', async () => {
    const created = await asA(() =>
      repo.createRecord({ vertical: 'realty', source: 'portal', party: { name: 'Scored', phones: [], languages: [] } }),
    );
    const updated = await asA(() => repo.setScore(created.id, 84, ['budget match']));
    expect(updated?.score).toBe(84);
    expect(updated?.scoreReasons).toEqual(['budget match']);
  });

  it('prevents double-booking at the database level', async () => {
    const rec = await asA(() =>
      repo.createRecord({ vertical: 'realty', source: 'portal', party: { name: 'Booker', phones: [], languages: [] } }),
    );
    const slot = '2026-09-01T10:00:00.000Z';
    await asA(() => repo.book(rec.id, 'agent-1', slot));
    await expect(asA(() => repo.book(rec.id, 'agent-1', slot))).rejects.toBeInstanceOf(SlotTakenError);
  });

  it('allows the same slot for different tenants (isolation)', async () => {
    const slot = '2026-09-02T10:00:00.000Z';
    const recA = await asA(() =>
      repo.createRecord({ vertical: 'realty', source: 'x', party: { name: 'A', phones: [], languages: [] } }),
    );
    const recB = await asB(() =>
      repo.createRecord({ vertical: 'realty', source: 'x', party: { name: 'B', phones: [], languages: [] } }),
    );
    await asA(() => repo.book(recA.id, 'agent-9', slot));
    // Same resource+slot but different tenant must succeed.
    await expect(asB(() => repo.book(recB.id, 'agent-9', slot))).resolves.toBeTruthy();
  });
});
