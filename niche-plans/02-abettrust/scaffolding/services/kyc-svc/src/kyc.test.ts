/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { describe, it, expect } from 'vitest';
import { runWithPrincipal } from '@abetworks/core';
import { InMemoryKycStore, InvalidKycTransition, KycNotFound } from './kyc';

const principal = { sub: 'officer-1', tenantId: 't1', roles: ['compliance_officer'] };
const ctx = <T>(fn: () => Promise<T>) => runWithPrincipal(principal, fn);

describe('KYC lifecycle (in-memory store)', () => {
  it('follows the valid state path pending->submitted->verified', async () => {
    const svc = new InMemoryKycStore();
    const rec = await ctx(async () => {
      const r = await svc.create('party-1', ['aadhaar.pdf']);
      await svc.transition(r.id, 'submitted');
      return svc.transition(r.id, 'verified');
    });
    expect(rec.status).toBe('verified');
  });

  it('rejects an invalid transition (pending -> verified)', async () => {
    const svc = new InMemoryKycStore();
    await expect(
      ctx(async () => {
        const r = await svc.create('party-1');
        return svc.transition(r.id, 'verified'); // must go via submitted
      }),
    ).rejects.toBeInstanceOf(InvalidKycTransition);
  });

  it('records an append-only trail of every change', async () => {
    const svc = new InMemoryKycStore();
    const rec = await ctx(async () => {
      const r = await svc.create('party-1');
      await svc.transition(r.id, 'submitted');
      await svc.addDisclosure(r.id, 'Product risk disclosure v2');
      return (await svc.get(r.id))!;
    });
    const kinds = rec.trail.map((t) => t.kind);
    expect(kinds).toContain('status_change');
    expect(kinds).toContain('disclosure');
    expect(rec.trail.every((t) => t.actor === 'officer-1')).toBe(true);
  });

  it('suitability is incomplete without a disclosure', async () => {
    const svc = new InMemoryKycStore();
    const complete = await ctx(async () => {
      const r = await svc.create('party-1');
      await svc.transition(r.id, 'submitted');
      await svc.transition(r.id, 'verified');
      return svc.isSuitabilityComplete(r.id);
    });
    expect(complete).toBe(false);
  });

  it('suitability is complete when verified AND disclosed', async () => {
    const svc = new InMemoryKycStore();
    const complete = await ctx(async () => {
      const r = await svc.create('party-1');
      await svc.transition(r.id, 'submitted');
      await svc.transition(r.id, 'verified');
      await svc.addDisclosure(r.id, 'Risk disclosure');
      return svc.isSuitabilityComplete(r.id);
    });
    expect(complete).toBe(true);
  });

  it('isolates records by tenant', async () => {
    const svc = new InMemoryKycStore();
    const other = { sub: 'x', tenantId: 't2', roles: [] };
    const id = await ctx(async () => (await svc.create('party-1')).id);
    const seen = await runWithPrincipal(other, () => svc.get(id));
    expect(seen).toBeUndefined();
  });

  it('throws KycNotFound for a missing record', async () => {
    const svc = new InMemoryKycStore();
    await expect(ctx(() => svc.transition('nope', 'submitted'))).rejects.toBeInstanceOf(KycNotFound);
  });
});
