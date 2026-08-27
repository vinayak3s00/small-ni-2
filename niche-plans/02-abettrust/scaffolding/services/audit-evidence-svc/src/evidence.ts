/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { createHash } from 'node:crypto';
import type { AuditEvent } from '@abetworks/core';

/**
 * Append-only audit store with a tamper-evident hash chain. Each event's hash
 * incorporates the previous event's hash, so any modification or deletion of an
 * earlier event breaks verification. Production mirrors this to S3 Object Lock
 * (WORM); this store is the in-process authority for tests + local dev.
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

const GENESIS = '0'.repeat(64);

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export class AuditChain {
  private events: ChainedEvent[] = [];

  append(event: AuditEvent): ChainedEvent {
    const seq = this.events.length;
    const prevHash = seq === 0 ? GENESIS : this.events[seq - 1].hash;
    const hash = sha256(prevHash + JSON.stringify(event) + seq);
    const chained: ChainedEvent = { ...event, seq, prevHash, hash };
    this.events.push(chained);
    return chained;
  }

  /** Verify the whole chain is intact (no insert/modify/delete). */
  verify(): boolean {
    let prev = GENESIS;
    for (let i = 0; i < this.events.length; i++) {
      const e = this.events[i];
      if (e.seq !== i || e.prevHash !== prev) return false;
      const { seq, prevHash, hash, ...raw } = e;
      const expected = sha256(prevHash + JSON.stringify(raw) + seq);
      if (expected !== hash) return false;
      prev = hash;
    }
    return true;
  }

  query(filter: { from?: string; to?: string; action?: string } = {}): ChainedEvent[] {
    return this.events.filter((e) => {
      if (filter.action && e.action !== filter.action) return false;
      if (filter.from && e.at < filter.from) return false;
      if (filter.to && e.at > filter.to) return false;
      return true;
    });
  }

  /** Generate a hash-chained evidence pack (auditor export) for a period. */
  generatePack(period: string, from: string, to: string): EvidencePack {
    const events = this.query({ from, to });
    const leaves = events.map((e) => e.hash);
    const merkleRoot = leaves.length ? sha256(leaves.join('')) : GENESIS;
    const generatedAt = new Date().toISOString();
    const hash = sha256(period + generatedAt + merkleRoot + events.length);
    return { period, generatedAt, eventCount: events.length, merkleRoot, hash };
  }
}
