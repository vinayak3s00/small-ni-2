/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { randomUUID } from 'node:crypto';
import { getTenantId } from '@abetworks/core';

export type Vertical = 'realty' | 'care' | 'admit';

export interface RecordRow {
  id: string;
  tenantId: string;
  vertical: Vertical;
  stage: string;
  source: string;
  party: { name: string; phones: string[]; languages: string[] };
  score?: number;
  scoreReasons?: string[];
  createdAt: string;
}

export interface BookingRow {
  id: string;
  tenantId: string;
  recordId: string;
  resourceId: string;
  slotStart: string;
  status: 'booked' | 'cancelled';
  version: number;
}

export class SlotTakenError extends Error {
  constructor() {
    super('slot no longer available');
    this.name = 'SlotTakenError';
  }
}

/**
 * In-memory repository that emulates the platform's tenant isolation: every
 * read/write is filtered by the current tenant (as PostgreSQL RLS would do).
 * Swap for a pg-backed implementation using `withTenantScope` in production.
 */
export class InMemoryRepo {
  private records: RecordRow[] = [];
  private bookings: BookingRow[] = [];

  createRecord(input: Omit<RecordRow, 'id' | 'tenantId' | 'stage' | 'createdAt'>): RecordRow {
    const row: RecordRow = {
      id: randomUUID(),
      tenantId: getTenantId(),
      stage: 'new',
      createdAt: new Date().toISOString(),
      ...input,
    };
    this.records.push(row);
    return row;
  }

  listRecords(filter: { minScore?: number } = {}): RecordRow[] {
    const tenantId = getTenantId();
    return this.records
      .filter((r) => r.tenantId === tenantId)
      .filter((r) => (filter.minScore == null ? true : (r.score ?? 0) >= filter.minScore));
  }

  getRecord(id: string): RecordRow | undefined {
    const tenantId = getTenantId();
    return this.records.find((r) => r.id === id && r.tenantId === tenantId);
  }

  setScore(id: string, score: number, reasons: string[]): RecordRow | undefined {
    const row = this.getRecord(id);
    if (row) {
      row.score = score;
      row.scoreReasons = reasons;
    }
    return row;
  }

  /**
   * Book a slot with an optimistic uniqueness guarantee: two concurrent
   * bookings for the same (resourceId, slotStart) cannot both succeed.
   * Mirrors the DB `UNIQUE(resource_id, slot_start)` + version lock.
   */
  book(recordId: string, resourceId: string, slotStart: string): BookingRow {
    const tenantId = getTenantId();
    const clash = this.bookings.find(
      (b) =>
        b.tenantId === tenantId &&
        b.resourceId === resourceId &&
        b.slotStart === slotStart &&
        b.status === 'booked',
    );
    if (clash) throw new SlotTakenError();

    const row: BookingRow = {
      id: randomUUID(),
      tenantId,
      recordId,
      resourceId,
      slotStart,
      status: 'booked',
      version: 1,
    };
    this.bookings.push(row);
    return row;
  }
}
