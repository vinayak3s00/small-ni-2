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

export class AttributionLedger {
  // Append-only store. No update/delete methods are exposed by design.
  private readonly events: AttributionEvent[] = [];

  record(input: {
    recordId: string;
    source: string;
    campaign?: string;
    partnerCode?: string;
    occurredAt?: string;
  }): AttributionEvent {
    const event: AttributionEvent = {
      id: randomUUID(),
      tenantId: getTenantId(),
      recordId: input.recordId,
      source: input.source,
      campaign: input.campaign,
      partnerCode: input.partnerCode,
      occurredAt: input.occurredAt ?? new Date().toISOString(),
    };
    this.events.push(event);
    return event;
  }

  /** Tenant-scoped touches for a record, ordered by time (stable). */
  touches(recordId: string): AttributionEvent[] {
    const tenantId = getTenantId();
    return this.events
      .filter((e) => e.tenantId === tenantId && e.recordId === recordId)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }

  /** Resolve attribution shares for a booked record. Weights sum to 1.0. */
  attribute(recordId: string, model: AttributionModel = 'last_touch'): AttributionShare[] {
    const touches = this.touches(recordId);
    if (touches.length === 0) return [];

    const toShare = (e: AttributionEvent, weight: number): AttributionShare => ({
      eventId: e.id,
      source: e.source,
      partnerCode: e.partnerCode,
      weight,
    });

    if (model === 'first_touch') return [toShare(touches[0], 1)];
    if (model === 'last_touch') return [toShare(touches[touches.length - 1], 1)];

    // linear: equal share across all touches.
    const w = 1 / touches.length;
    return touches.map((e) => toShare(e, w));
  }
}
