/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

/**
 * White-labelled report generation for AbetPartner.
 *
 * Two guarantees from the plan:
 *   * Grant-gated — a partner can only generate a report for a client workspace
 *     it has been granted `reports:read` scope on. No grant => access denied.
 *   * White-labelled — the rendered report carries the partner's branding
 *     (brand name, colour, logo), never Abetworks' own.
 */

export interface Branding {
  brandName: string;
  primaryColor: string;
  logoUrl: string;
}

export interface WorkspaceGrant {
  workspaceId: string;
  scopes: string[];
}

export interface ReportRequest {
  workspaceId: string;
  title: string;
  metrics: Record<string, number>;
}

export interface RenderedReport {
  brandName: string;
  primaryColor: string;
  logoUrl: string;
  title: string;
  workspaceId: string;
  rows: { label: string; value: number }[];
  generatedAt: string;
}

export class AccessDeniedError extends Error {
  constructor(workspaceId: string) {
    super(`no reports:read grant for workspace ${workspaceId}`);
    this.name = 'AccessDeniedError';
  }
}

export class ReportingService {
  constructor(
    private readonly branding: Branding,
    private readonly grants: WorkspaceGrant[],
  ) {}

  private canRead(workspaceId: string): boolean {
    return this.grants.some(
      (g) => g.workspaceId === workspaceId && g.scopes.includes('reports:read'),
    );
  }

  generate(req: ReportRequest): RenderedReport {
    if (!this.canRead(req.workspaceId)) {
      throw new AccessDeniedError(req.workspaceId);
    }
    const rows = Object.entries(req.metrics)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return {
      brandName: this.branding.brandName,
      primaryColor: this.branding.primaryColor,
      logoUrl: this.branding.logoUrl,
      title: req.title,
      workspaceId: req.workspaceId,
      rows,
      generatedAt: new Date().toISOString(),
    };
  }
}
