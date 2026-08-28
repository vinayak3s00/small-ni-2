/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import type { MeterKey } from './pricing';

/**
 * Usage metering. Services emit a MeterEvent whenever a billable action occurs
 * (a record created, a message sent, a voice minute consumed, an AI action
 * run). The MeterAggregator rolls events up per tenant + meter for a billing
 * period. Events are idempotent by eventId so at-least-once delivery (Kafka)
 * never double-counts.
 */

export interface MeterEvent {
  eventId: string; // producer-generated; dedupe key
  tenantId: string;
  meter: MeterKey;
  quantity: number;
  at: string; // ISO timestamp
}

export type UsageByMeter = Record<MeterKey, number>;

export class MeterAggregator {
  private seen = new Set<string>();
  // tenantId -> meter -> total quantity
  private totals = new Map<string, Map<MeterKey, number>>();

  /** Returns true if applied, false if a duplicate event was ignored. */
  ingest(event: MeterEvent): boolean {
    const dedupeKey = `${event.tenantId}:${event.eventId}`;
    if (this.seen.has(dedupeKey)) return false;
    if (event.quantity < 0) throw new Error('meter quantity must be non-negative');
    this.seen.add(dedupeKey);

    if (!this.totals.has(event.tenantId)) this.totals.set(event.tenantId, new Map());
    const perMeter = this.totals.get(event.tenantId)!;
    perMeter.set(event.meter, (perMeter.get(event.meter) ?? 0) + event.quantity);
    return true;
  }

  usageFor(tenantId: string): UsageByMeter {
    const perMeter = this.totals.get(tenantId) ?? new Map<MeterKey, number>();
    return {
      records: perMeter.get('records') ?? 0,
      messages: perMeter.get('messages') ?? 0,
      voice_minutes: perMeter.get('voice_minutes') ?? 0,
      ai_actions: perMeter.get('ai_actions') ?? 0,
    };
  }
}
