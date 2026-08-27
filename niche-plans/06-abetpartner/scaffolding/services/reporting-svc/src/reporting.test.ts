/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { describe, it, expect } from 'vitest';
import { ReportingService, AccessDeniedError, type Branding } from './reporting';

const branding: Branding = {
  brandName: 'GrowthPartners',
  primaryColor: '#0A66C2',
  logoUrl: 'https://cdn.growthpartners.example/logo.png',
};

describe('ReportingService', () => {
  it('generates a report for a granted workspace with partner branding', () => {
    const svc = new ReportingService(branding, [{ workspaceId: 'ws-1', scopes: ['reports:read'] }]);
    const report = svc.generate({
      workspaceId: 'ws-1',
      title: 'Q2 Performance',
      metrics: { conversions: 42, leads: 300 },
    });
    expect(report.brandName).toBe('GrowthPartners'); // white-labelled, not Abetworks
    expect(report.title).toBe('Q2 Performance');
    // rows sorted by label
    expect(report.rows.map((r) => r.label)).toEqual(['conversions', 'leads']);
  });

  it('denies report generation without a reports:read grant', () => {
    const svc = new ReportingService(branding, [{ workspaceId: 'ws-1', scopes: ['pii:read'] }]);
    expect(() =>
      svc.generate({ workspaceId: 'ws-1', title: 'X', metrics: {} }),
    ).toThrow(AccessDeniedError);
  });

  it('denies report generation for an ungranted workspace', () => {
    const svc = new ReportingService(branding, [{ workspaceId: 'ws-1', scopes: ['reports:read'] }]);
    expect(() =>
      svc.generate({ workspaceId: 'ws-2', title: 'X', metrics: {} }),
    ).toThrow(AccessDeniedError);
  });
});
