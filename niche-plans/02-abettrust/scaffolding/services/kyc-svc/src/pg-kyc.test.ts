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
import { PgKycStore } from './pg-kyc';
import { InvalidKycTransition } from './kyc';

// Real Postgres + RLS. Runs only when DATABASE_URL is set; skips otherwise.
const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;

const TA = '11111111-1111-1111-1111-111111111111';
const TB = '22222222-2222-2222-2222-222222222222';
const asA = <T>(fn: () => Promise<T>) =>
  runWithPrincipal({ sub: 'officer-a', tenantId: TA, roles: ['compliance_officer'] }, fn);
const asB = <T>(fn: () => Promise<T>) =>
  runWithPrincipal({ sub: 'officer-b', tenantId: TB, roles: ['compliance_officer'] }, fn);

d('PgKycStore (integration)', () => {
  let pool: Pool;
  let store: PgKycStore;

  beforeAll(async () => {
    pool = createPool();
    await migrate(pool);
    await pool.query('TRUNCATE kyc_record, kyc_trail RESTART IDENTITY');
    store = new PgKycStore(pool);
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it('persists the full lifecycle with an audit trail', async () => {
    const rec = await asA(async () => {
      const r = await store.create('party-1', ['aadhaar.pdf']);
      await store.transition(r.id, 'submitted');
      await store.transition(r.id, 'verified');
      await store.addDisclosure(r.id, 'Risk disclosure v1');
      return (await store.get(r.id))!;
    });
    expect(rec.status).toBe('verified');
    expect(rec.disclosures).toContain('Risk disclosure v1');
    // Trail: created + 2 transitions + 1 disclosure = 4 entries.
    expect(rec.trail.length).toBe(4);
    expect(await asA(() => store.isSuitabilityComplete(rec.id))).toBe(true);
  });

  it('rejects an invalid transition', async () => {
    const r = await asA(() => store.create('party-2'));
    await expect(asA(() => store.transition(r.id, 'verified'))).rejects.toBeInstanceOf(
      InvalidKycTransition,
    );
  });

  it('enforces RLS: tenant B cannot read tenant A records', async () => {
    const r = await asA(() => store.create('party-3'));
    const seen = await asB(() => store.get(r.id));
    expect(seen).toBeUndefined();
  });

  it('trail is append-only at the database level (UPDATE blocked)', async () => {
    await asA(() => store.create('party-4'));
    // A direct UPDATE on the trail must be rejected by the trigger.
    await expect(pool.query('UPDATE kyc_trail SET detail = $1', ['tampered'])).rejects.toThrow(
      /append-only/,
    );
  });
});
