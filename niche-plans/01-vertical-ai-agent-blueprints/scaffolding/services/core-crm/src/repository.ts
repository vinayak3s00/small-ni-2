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

export type NewRecord = Omit<RecordRow, 'id' | 'tenantId' | 'stage' | 'createdAt'>;

export class SlotTakenError extends Error {
  constructor() {
    super('slot no longer available');
    this.name = 'SlotTakenError';
  }
}

/**
 * Repository contract implemented by both the in-memory (tests/dev) and the
 * PostgreSQL-backed (production) stores. All methods are tenant-scoped: the
 * pg implementation relies on RLS + withTenantScope, so callers never pass a
 * tenant id — it comes from the request's tenant context.
 */
export interface CrmRepository {
  createRecord(input: NewRecord): Promise<RecordRow>;
  listRecords(filter?: { minScore?: number }): Promise<RecordRow[]>;
  getRecord(id: string): Promise<RecordRow | undefined>;
  setScore(id: string, score: number, reasons: string[]): Promise<RecordRow | undefined>;
  book(recordId: string, resourceId: string, slotStart: string): Promise<BookingRow>;
}

/**
 * In-memory repository that emulates the platform's tenant isolation: every
 * read/write is filtered by the current tenant (as PostgreSQL RLS does).
 * Used for unit tests and local dev without a database.
 */
export class InMemoryRepo implements CrmRepository {
  private records: RecordRow[] = [];
  private bookings: BookingRow[] = [];

  async createRecord(input: NewRecord): Promise<RecordRow> {
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

  async listRecords(filter: { minScore?: number } = {}): Promise<RecordRow[]> {
    const tenantId = getTenantId();
    return this.records
      .filter((r) => r.tenantId === tenantId)
      .filter((r) => (filter.minScore == null ? true : (r.score ?? 0) >= filter.minScore));
  }

  async getRecord(id: string): Promise<RecordRow | undefined> {
    const tenantId = getTenantId();
    return this.records.find((r) => r.id === id && r.tenantId === tenantId);
  }

  async setScore(id: string, score: number, reasons: string[]): Promise<RecordRow | undefined> {
    const row = await this.getRecord(id);
    if (row) {
      row.score = score;
      row.scoreReasons = reasons;
    }
    return row;
  }

  async book(recordId: string, resourceId: string, slotStart: string): Promise<BookingRow> {
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
