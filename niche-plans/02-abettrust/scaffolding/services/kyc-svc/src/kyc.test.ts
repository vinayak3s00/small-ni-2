/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { describe, it, expect } from 'vitest';
import { runWithPrincipal } from '@abetworks/core';
import { KycService, InvalidKycTransition } from './kyc';

const principal = { sub: 'officer-1', tenantId: 't1', roles: ['compliance_officer'] };
const ctx = <T>(fn: () => T) => runWithPrincipal(principal, fn);

describe('KycService lifecycle', () => {
  it('follows the valid state path pending->submitted->verified', () => {
    const svc = new KycService();
    const rec = ctx(() => {
      const r = svc.create('party-1', ['aadhaar.pdf']);
      svc.transition(r.id, 'submitted');
      return svc.transition(r.id, 'verified');
    });
    expect(rec.status).toBe('verified');
  });

  it('rejects an invalid transition (pending -> verified)', () => {
    const svc = new KycService();
    expect(() =>
      ctx(() => {
        const r = svc.create('party-1');
        return svc.transition(r.id, 'verified'); // must go via submitted
      }),
    ).toThrow(InvalidKycTransition);
  });

  it('records an append-only trail of every change', () => {
    const svc = new KycService();
    const rec = ctx(() => {
      const r = svc.create('party-1');
      svc.transition(r.id, 'submitted');
      svc.addDisclosure(r.id, 'Product risk disclosure v2');
      return svc.get(r.id)!;
    });
    const kinds = rec.trail.map((t) => t.kind);
    expect(kinds).toContain('status_change');
    expect(kinds).toContain('disclosure');
    expect(rec.trail.every((t) => t.actor === 'officer-1')).toBe(true);
  });

  it('suitability is incomplete without a disclosure', () => {
    const svc = new KycService();
    const complete = ctx(() => {
      const r = svc.create('party-1');
      svc.transition(r.id, 'submitted');
      svc.transition(r.id, 'verified');
      return svc.isSuitabilityComplete(r.id);
    });
    expect(complete).toBe(false);
  });

  it('suitability is complete when verified AND disclosed', () => {
    const svc = new KycService();
    const complete = ctx(() => {
      const r = svc.create('party-1');
      svc.transition(r.id, 'submitted');
      svc.transition(r.id, 'verified');
      svc.addDisclosure(r.id, 'Risk disclosure');
      return svc.isSuitabilityComplete(r.id);
    });
    expect(complete).toBe(true);
  });

  it('isolates records by tenant', () => {
    const svc = new KycService();
    const other = { sub: 'x', tenantId: 't2', roles: [] };
    const id = ctx(() => svc.create('party-1').id);
    expect(runWithPrincipal(other, () => svc.get(id))).toBeUndefined();
  });
});
