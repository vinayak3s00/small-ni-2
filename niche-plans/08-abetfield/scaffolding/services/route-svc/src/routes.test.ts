/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { describe, it, expect } from 'vitest';
import { runWithPrincipal } from '@abetworks/core';
import { RouteService, GeoCheckInError } from './routes';
import { haversineMeters } from './geo';

const principal = { sub: 'rep-1', tenantId: 't1', roles: ['field_rep'] };
const ctx = <T>(fn: () => T) => runWithPrincipal(principal, fn);

// A reference outlet location (approx. Mumbai).
const OUTLET = { lat: 19.076, lng: 72.8777 };

describe('geo', () => {
  it('haversine returns ~0 for identical points', () => {
    expect(haversineMeters(OUTLET, OUTLET)).toBeLessThan(1);
  });

  it('haversine measures a known short distance (~157m for 0.001 lat)', () => {
    const d = haversineMeters(OUTLET, { lat: OUTLET.lat + 0.001, lng: OUTLET.lng });
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(120); // ~111m per 0.001 deg latitude
  });
});

describe('RouteService', () => {
  it('verifies a check-in within the radius', () => {
    const svc = new RouteService(100);
    const result = ctx(() => {
      const o = svc.registerOutlet('Kirana A', OUTLET);
      // ~11m away.
      return svc.checkIn(o.id, { lat: OUTLET.lat + 0.0001, lng: OUTLET.lng });
    });
    expect(result.verified).toBe(true);
    expect(result.distanceMeters).toBeLessThan(100);
  });

  it('rejects a check-in outside the radius with a reason', () => {
    const svc = new RouteService(100);
    const result = ctx(() => {
      const o = svc.registerOutlet('Kirana A', OUTLET);
      // ~1.1km away.
      return svc.checkIn(o.id, { lat: OUTLET.lat + 0.01, lng: OUTLET.lng });
    });
    expect(result.verified).toBe(false);
    expect(result.reason).toMatch(/too far/);
  });

  it('isolates outlets by tenant', () => {
    const svc = new RouteService();
    const other = { sub: 'rep-2', tenantId: 't2', roles: ['field_rep'] };
    const outletId = ctx(() => svc.registerOutlet('Kirana A', OUTLET).id);
    expect(() =>
      runWithPrincipal(other, () => svc.checkIn(outletId, OUTLET)),
    ).toThrow(GeoCheckInError);
  });

  it('stores and retrieves a beat plan for a rep+date', () => {
    const svc = new RouteService();
    ctx(() => svc.planBeat('rep-1', '2026-09-01', ['o1', 'o2']));
    const plan = ctx(() => svc.beatFor('rep-1', '2026-09-01'));
    expect(plan?.outletIds).toEqual(['o1', 'o2']);
  });
});
