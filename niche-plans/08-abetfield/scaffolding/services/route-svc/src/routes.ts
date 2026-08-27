/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { randomUUID } from 'node:crypto';
import { getTenantId } from '@abetworks/core';
import { GeoPoint, haversineMeters, withinRadius } from './geo';

/**
 * Beat planning + geo-verified check-in. A rep may only check in when their
 * GPS position is within the allowed radius of the outlet's registered
 * location, preventing fraudulent "armchair" visits. All data is tenant-scoped.
 */

export interface Outlet {
  id: string;
  tenantId: string;
  name: string;
  location: GeoPoint;
}

export interface BeatPlan {
  id: string;
  tenantId: string;
  repId: string;
  date: string;
  outletIds: string[];
}

export interface CheckInResult {
  outletId: string;
  verified: boolean;
  distanceMeters: number;
  reason?: string;
}

export class GeoCheckInError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'GeoCheckInError';
  }
}

export class RouteService {
  private outlets: Outlet[] = [];
  private plans: BeatPlan[] = [];

  constructor(private readonly checkInRadiusM = 100) {}

  registerOutlet(name: string, location: GeoPoint): Outlet {
    const outlet: Outlet = { id: randomUUID(), tenantId: getTenantId(), name, location };
    this.outlets.push(outlet);
    return outlet;
  }

  planBeat(repId: string, date: string, outletIds: string[]): BeatPlan {
    const plan: BeatPlan = { id: randomUUID(), tenantId: getTenantId(), repId, date, outletIds };
    this.plans.push(plan);
    return plan;
  }

  beatFor(repId: string, date: string): BeatPlan | undefined {
    const tenantId = getTenantId();
    return this.plans.find(
      (p) => p.tenantId === tenantId && p.repId === repId && p.date === date,
    );
  }

  /** Geo-verified check-in against the outlet's registered location. */
  checkIn(outletId: string, at: GeoPoint): CheckInResult {
    const tenantId = getTenantId();
    const outlet = this.outlets.find((o) => o.id === outletId && o.tenantId === tenantId);
    if (!outlet) {
      throw new GeoCheckInError('outlet not found for tenant');
    }
    const distance = Math.round(haversineMeters(outlet.location, at));
    const verified = withinRadius(outlet.location, at, this.checkInRadiusM);
    return {
      outletId,
      verified,
      distanceMeters: distance,
      reason: verified ? undefined : `too far from outlet (${distance}m > ${this.checkInRadiusM}m)`,
    };
  }
}
