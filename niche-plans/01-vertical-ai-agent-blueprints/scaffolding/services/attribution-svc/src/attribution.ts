/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { randomUUID } from 'node:crypto';
import { getTenantId } from '@abetworks/core';

/**
 * Immutable, append-only attribution ledger for AbetVerticals.
 *
 * Real-estate channel-partner payouts and ad ROAS depend on a single,
 * uncontestable source of truth for "who produced this booking". Every touch
 * (portal lead, campaign click, channel-partner referral) is recorded as an
 * append-only event; events are NEVER updated or deleted. On booking, we resolve
 * attribution across the recorded touches using a configurable model.
 *
 * Two implementations satisfy AttributionStore: an in-memory store (tests/dev)
 * and a PostgreSQL-backed store (see pg-attribution.ts) where append-only is
 * enforced by a database trigger.
 */

export type AttributionModel = 'first_touch' | 'last_touch' | 'linear';

export interface AttributionEvent {
  id: string;
  tenantId: string;
  recordId: string;
  source: string; // e.g. "portal:99acres", "meta_ads", "cp"
  campaign?: string;
  partnerCode?: string;
  occurredAt: string; // ISO timestamp
}

export interface AttributionShare {
  eventId: string;
  source: string;
  partnerCode?: string;
  weight: number; // 0..1, shares sum to 1 across a record's touches
}

export interface NewTouch {
  recordId: string;
  source: string;
  campaign?: string;
  partnerCode?: string;
  occurredAt?: string;
}

/** Pure attribution resolution over an ordered touch list. Weights sum to 1. */
export function resolveShares(
  touches: AttributionEvent[],
  model: AttributionModel = 'last_touch',
): AttributionShare[] {
  if (touches.length === 0) return [];
  const toShare = (e: AttributionEvent, weight: number): AttributionShare => ({
    eventId: e.id,
    source: e.source,
    partnerCode: e.partnerCode,
    weight,
  });
  if (model === 'first_touch') return [toShare(touches[0], 1)];
  if (model === 'last_touch') return [toShare(touches[touches.length - 1], 1)];
  const w = 1 / touches.length;
  return touches.map((e) => toShare(e, w));
}

export interface AttributionStore {
  record(input: NewTouch): Promise<AttributionEvent>;
  touches(recordId: string): Promise<AttributionEvent[]>;
  attribute(recordId: string, model?: AttributionModel): Promise<AttributionShare[]>;
}

/** In-memory append-only ledger (unit tests / dev). */
export class InMemoryAttributionStore implements AttributionStore {
  private readonly events: AttributionEvent[] = [];
  private seq = 0;

  async record(input: NewTouch): Promise<AttributionEvent> {
    const event: AttributionEvent = {
      id: randomUUID(),
      tenantId: getTenantId(),
      recordId: input.recordId,
      source: input.source,
      campaign: input.campaign,
      partnerCode: input.partnerCode,
      occurredAt: input.occurredAt ?? new Date().toISOString(),
    };
    // Preserve stable ordering for identical timestamps.
    (event as any).__seq = this.seq++;
    this.events.push(event);
    return event;
  }

  async touches(recordId: string): Promise<AttributionEvent[]> {
    const tenantId = getTenantId();
    return this.events
      .filter((e) => e.tenantId === tenantId && e.recordId === recordId)
      .sort((a, b) => {
        const t = a.occurredAt.localeCompare(b.occurredAt);
        return t !== 0 ? t : (a as any).__seq - (b as any).__seq;
      });
  }

  async attribute(recordId: string, model: AttributionModel = 'last_touch'): Promise<AttributionShare[]> {
    return resolveShares(await this.touches(recordId), model);
  }
}
