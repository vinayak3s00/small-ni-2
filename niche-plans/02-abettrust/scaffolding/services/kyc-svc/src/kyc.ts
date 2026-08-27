/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { randomUUID } from 'node:crypto';
import { getTenantId, getPrincipal } from '@abetworks/core';

/**
 * KYC / suitability lifecycle with an append-only disclosure trail.
 *
 * KYC state machine:
 *   pending --submit--> submitted --verify--> verified
 *                          |                     |
 *                          +--reject--> rejected +--expire--> expired
 *
 * Every state change and every disclosure is appended to an immutable trail,
 * satisfying AbetTrust's audit-grade communication requirement. Disclosures
 * (e.g. product risk statements) must be recorded before a suitability record
 * can be marked complete.
 */

export type KycStatus = 'pending' | 'submitted' | 'verified' | 'rejected' | 'expired';

const TRANSITIONS: Record<KycStatus, KycStatus[]> = {
  pending: ['submitted'],
  submitted: ['verified', 'rejected'],
  verified: ['expired'],
  rejected: [],
  expired: [],
};

export interface TrailEntry {
  at: string;
  actor: string;
  kind: 'status_change' | 'disclosure';
  detail: string;
}

export interface KycRecord {
  id: string;
  tenantId: string;
  partyId: string;
  status: KycStatus;
  documents: string[];
  disclosures: string[];
  trail: TrailEntry[];
}

export class InvalidKycTransition extends Error {
  constructor(from: KycStatus, to: KycStatus) {
    super(`invalid KYC transition: ${from} -> ${to}`);
    this.name = 'InvalidKycTransition';
  }
}

export class KycService {
  private records = new Map<string, KycRecord>();

  private scoped(id: string): KycRecord | undefined {
    const rec = this.records.get(id);
    if (rec && rec.tenantId === getTenantId()) return rec;
    return undefined;
  }

  private appendTrail(rec: KycRecord, kind: TrailEntry['kind'], detail: string): void {
    rec.trail.push({ at: new Date().toISOString(), actor: getPrincipal().sub, kind, detail });
  }

  create(partyId: string, documents: string[] = []): KycRecord {
    const rec: KycRecord = {
      id: randomUUID(),
      tenantId: getTenantId(),
      partyId,
      status: 'pending',
      documents,
      disclosures: [],
      trail: [],
    };
    this.appendTrail(rec, 'status_change', 'created as pending');
    this.records.set(rec.id, rec);
    return rec;
  }

  transition(id: string, to: KycStatus): KycRecord {
    const rec = this.scoped(id);
    if (!rec) throw new Error('kyc record not found for tenant');
    if (!TRANSITIONS[rec.status].includes(to)) {
      throw new InvalidKycTransition(rec.status, to);
    }
    const from = rec.status;
    rec.status = to;
    this.appendTrail(rec, 'status_change', `${from} -> ${to}`);
    return rec;
  }

  /** Record a disclosure (append-only). Required before suitability is complete. */
  addDisclosure(id: string, disclosure: string): KycRecord {
    const rec = this.scoped(id);
    if (!rec) throw new Error('kyc record not found for tenant');
    rec.disclosures.push(disclosure);
    this.appendTrail(rec, 'disclosure', disclosure);
    return rec;
  }

  /** Suitability is only complete when KYC is verified AND disclosures exist. */
  isSuitabilityComplete(id: string): boolean {
    const rec = this.scoped(id);
    if (!rec) return false;
    return rec.status === 'verified' && rec.disclosures.length > 0;
  }

  get(id: string): KycRecord | undefined {
    return this.scoped(id);
  }
}
