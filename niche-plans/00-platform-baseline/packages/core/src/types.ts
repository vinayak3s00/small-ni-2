/**
 * Shared domain types used across every Abetworks service.
 * These mirror the platform baseline data model (one data model).
 */

export type UUID = string;

export type ResidencyRegion = 'ap-south-1';

export type TenantTier = 'free' | 'growth' | 'scale' | 'enterprise';

export interface Tenant {
  id: UUID;
  name: string;
  residency: ResidencyRegion;
  tier: TenantTier;
}

export type PartyKind = 'lead' | 'patient' | 'applicant' | 'partner' | 'customer';

export interface Party {
  id: UUID;
  tenantId: UUID;
  kind: PartyKind;
  name: string;
  phones: string[];
  emails: string[];
  languages: string[];
  consent: Record<string, unknown>;
  createdAt: string;
}

export type AuditAction = 'read' | 'write' | 'export';

export interface AuditEvent {
  tenantId: UUID;
  actor: string;
  action: AuditAction;
  entity: string;
  entityId: string;
  fields?: string[];
  at: string;
}

/** Explainable score attached to a record (baseline: refreshes <=30s, exposes reasons). */
export interface ExplainableScore {
  score: number;
  reasons: string[];
  refreshedAt: string;
}

/** The authenticated principal carried through every request/event. */
export interface Principal {
  sub: string;
  tenantId: UUID;
  roles: string[];
}
