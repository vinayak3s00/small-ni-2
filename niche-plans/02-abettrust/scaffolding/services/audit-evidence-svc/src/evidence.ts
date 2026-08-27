/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { createHash } from 'node:crypto';
import type { AuditEvent } from '@abetworks/core';

/**
 * Tamper-evident, append-only audit log. Each event's hash folds in the
 * previous event's hash, so any modification or deletion of an earlier event
 * breaks verification. Two implementations satisfy AuditStore: an in-memory
 * chain (tests/dev) and a PostgreSQL WORM store (see pg-evidence.ts) where
 * append-only is enforced by a database trigger and RLS isolates each tenant.
 */

export interface ChainedEvent extends AuditEvent {
  seq: number;
  prevHash: string;
  hash: string;
}

export interface EvidencePack {
  period: string;
  generatedAt: string;
  eventCount: number;
  merkleRoot: string;
  hash: string;
}

export const GENESIS = '0'.repeat(64);

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Canonical hash for a chain link. Kept pure and shared so the in-memory and
 * Postgres stores produce identical hashes for identical inputs.
 */
export function linkHash(prevHash: string, event: AuditEvent, seq: number): string {
  return sha256(prevHash + canonical(event) + seq);
}

/** Stable serialization of the audited fields (excludes chain metadata). */
export function canonical(event: AuditEvent): string {
  return JSON.stringify({
    tenantId: event.tenantId,
    actor: event.actor,
    action: event.action,
    entity: event.entity,
    entityId: event.entityId,
    fields: event.fields ?? null,
    at: event.at,
  });
}

export function merkleRoot(hashes: string[]): string {
  return hashes.length ? sha256(hashes.join('')) : GENESIS;
}

export interface AuditQuery {
  from?: string;
  to?: string;
  action?: string;
}

export interface AuditStore {
  append(event: AuditEvent): Promise<ChainedEvent>;
  verify(): Promise<boolean>;
  query(filter?: AuditQuery): Promise<ChainedEvent[]>;
  generatePack(period: string, from: string, to: string): Promise<EvidencePack>;
}

/** In-memory tamper-evident chain (unit tests / dev). */
export class AuditChain implements AuditStore {
  private events: ChainedEvent[] = [];

  async append(event: AuditEvent): Promise<ChainedEvent> {
    const seq = this.events.length;
    const prevHash = seq === 0 ? GENESIS : this.events[seq - 1].hash;
    const hash = linkHash(prevHash, event, seq);
    const chained: ChainedEvent = { ...event, seq, prevHash, hash };
    this.events.push(chained);
    return chained;
  }

  async verify(): Promise<boolean> {
    let prev = GENESIS;
    for (let i = 0; i < this.events.length; i++) {
      const e = this.events[i];
      if (e.seq !== i || e.prevHash !== prev) return false;
      const { seq, prevHash, hash, ...raw } = e;
      if (linkHash(prevHash, raw as AuditEvent, seq) !== hash) return false;
      prev = hash;
    }
    return true;
  }

  async query(filter: AuditQuery = {}): Promise<ChainedEvent[]> {
    return this.events.filter((e) => {
      if (filter.action && e.action !== filter.action) return false;
      if (filter.from && e.at < filter.from) return false;
      if (filter.to && e.at > filter.to) return false;
      return true;
    });
  }

  async generatePack(period: string, from: string, to: string): Promise<EvidencePack> {
    const events = await this.query({ from, to });
    const root = merkleRoot(events.map((e) => e.hash));
    const generatedAt = new Date().toISOString();
    const hash = sha256(period + generatedAt + root + events.length);
    return { period, generatedAt, eventCount: events.length, merkleRoot: root, hash };
  }
}
