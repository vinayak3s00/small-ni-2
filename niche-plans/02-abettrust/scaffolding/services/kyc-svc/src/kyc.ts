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
 *
 * Two implementations satisfy the KycStore contract: an in-memory store for
 * unit tests/dev, and a PostgreSQL-backed store (see pg-kyc.ts) with RLS
 * isolation and a database-enforced append-only trail.
 */

export type KycStatus = 'pending' | 'submitted' | 'verified' | 'rejected' | 'expired';

export const TRANSITIONS: Record<KycStatus, KycStatus[]> = {
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

export class KycNotFound extends Error {
  constructor(id: string) {
    super(`kyc record not found for tenant: ${id}`);
    this.name = 'KycNotFound';
  }
}

/** Store contract shared by the in-memory and Postgres implementations. */
export interface KycStore {
  create(partyId: string, documents?: string[]): Promise<KycRecord>;
  transition(id: string, to: KycStatus): Promise<KycRecord>;
  addDisclosure(id: string, disclosure: string): Promise<KycRecord>;
  isSuitabilityComplete(id: string): Promise<boolean>;
  get(id: string): Promise<KycRecord | undefined>;
}

/** In-memory KYC store (unit tests / local dev). */
export class InMemoryKycStore implements KycStore {
  private records = new Map<string, KycRecord>();

  private scoped(id: string): KycRecord | undefined {
    const rec = this.records.get(id);
    return rec && rec.tenantId === getTenantId() ? rec : undefined;
  }

  private appendTrail(rec: KycRecord, kind: TrailEntry['kind'], detail: string): void {
    rec.trail.push({ at: new Date().toISOString(), actor: getPrincipal().sub, kind, detail });
  }

  async create(partyId: string, documents: string[] = []): Promise<KycRecord> {
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

  async transition(id: string, to: KycStatus): Promise<KycRecord> {
    const rec = this.scoped(id);
    if (!rec) throw new KycNotFound(id);
    if (!TRANSITIONS[rec.status].includes(to)) {
      throw new InvalidKycTransition(rec.status, to);
    }
    const from = rec.status;
    rec.status = to;
    this.appendTrail(rec, 'status_change', `${from} -> ${to}`);
    return rec;
  }

  async addDisclosure(id: string, disclosure: string): Promise<KycRecord> {
    const rec = this.scoped(id);
    if (!rec) throw new KycNotFound(id);
    rec.disclosures.push(disclosure);
    this.appendTrail(rec, 'disclosure', disclosure);
    return rec;
  }

  async isSuitabilityComplete(id: string): Promise<boolean> {
    const rec = this.scoped(id);
    return !!rec && rec.status === 'verified' && rec.disclosures.length > 0;
  }

  async get(id: string): Promise<KycRecord | undefined> {
    return this.scoped(id);
  }
}
