/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { randomUUID } from 'node:crypto';
import { getTenantId, tryGetPrincipal } from './tenant-context';

/**
 * Usage metering emitter shared by every Abetworks service. Whenever a billable
 * action happens (a record created, a message sent, a voice minute consumed, an
 * AI action run), the service calls `meter.emit(...)`. The event is stamped with
 * the tenant from context and a unique id, then handed to a sink.
 *
 * The default sink writes a structured `meter` log line (ingestible by the
 * billing pipeline). Production swaps in a Kafka sink; the shape is identical,
 * so downstream @abetworks/billing MeterAggregator can consume it unchanged.
 */

/** Billable dimensions. Kept in sync with @abetworks/billing MeterKey. */
export type MeterKey = 'records' | 'messages' | 'voice_minutes' | 'ai_actions';

export interface MeterEvent {
  eventId: string;
  tenantId: string;
  meter: MeterKey;
  quantity: number;
  at: string;
  /** Optional context, e.g. the service and source entity. */
  service?: string;
  source?: string;
}

export type MeterSink = (event: MeterEvent) => void;

/** Default sink: emit a single structured JSON line tagged type=meter. */
export const logMeterSink: MeterSink = (event) => {
  // eslint-disable-next-line no-console
  process.stdout.write(JSON.stringify({ type: 'meter', ...event }) + '\n');
};

/** Collects emitted events in memory — for unit tests. */
export class InMemoryMeterSink {
  public readonly events: MeterEvent[] = [];
  readonly sink: MeterSink = (e) => {
    this.events.push(e);
  };
}

export interface MeterEmitterOptions {
  service?: string;
  sink?: MeterSink;
}

export class MeterEmitter {
  private readonly service?: string;
  private readonly sink: MeterSink;

  constructor(opts: MeterEmitterOptions = {}) {
    this.service = opts.service ?? process.env.SERVICE_NAME;
    this.sink = opts.sink ?? logMeterSink;
  }

  /**
   * Record `quantity` units of `meter` for the current tenant. `eventId` may be
   * supplied for idempotency (e.g. tie it to the entity id so retries dedupe);
   * otherwise a UUID is generated. Never throws — billing must not break the
   * request path.
   */
  emit(
    meter: MeterKey,
    quantity = 1,
    opts: { eventId?: string; source?: string; tenantId?: string } = {},
  ): void {
    try {
      if (quantity < 0) return;
      const tenantId = opts.tenantId ?? tryGetPrincipal()?.tenantId;
      if (!tenantId) return; // nothing to bill without a tenant
      const event: MeterEvent = {
        eventId: opts.eventId ?? randomUUID(),
        tenantId,
        meter,
        quantity,
        at: new Date().toISOString(),
        ...(this.service ? { service: this.service } : {}),
        ...(opts.source ? { source: opts.source } : {}),
      };
      this.sink(event);
    } catch {
      /* metering must never break the request */
    }
  }

  /** Convenience for the common "current tenant, 1 unit" case. */
  count(meter: MeterKey, opts?: { eventId?: string; source?: string }): void {
    this.emit(meter, 1, opts);
  }
}

/** Process-wide default emitter; services usually construct one with a service name. */
export const meter = new MeterEmitter();
