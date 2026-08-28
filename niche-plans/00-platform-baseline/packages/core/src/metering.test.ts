/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { describe, it, expect } from 'vitest';
import { MeterEmitter, InMemoryMeterSink } from './metering';
import { runWithPrincipal } from './tenant-context';

const principal = { sub: 'u1', tenantId: 'tenant-abc', roles: ['sales'] };

describe('MeterEmitter', () => {
  it('emits an event stamped with the tenant from context', () => {
    const sink = new InMemoryMeterSink();
    const m = new MeterEmitter({ service: 'core-crm', sink: sink.sink });
    runWithPrincipal(principal, () => m.count('records', { source: 'rec-1' }));
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]).toMatchObject({
      tenantId: 'tenant-abc',
      meter: 'records',
      quantity: 1,
      service: 'core-crm',
      source: 'rec-1',
    });
    expect(sink.events[0].eventId).toBeTruthy();
  });

  it('honours an explicit eventId for idempotency', () => {
    const sink = new InMemoryMeterSink();
    const m = new MeterEmitter({ sink: sink.sink });
    runWithPrincipal(principal, () => m.emit('messages', 3, { eventId: 'evt-42' }));
    expect(sink.events[0]).toMatchObject({ eventId: 'evt-42', meter: 'messages', quantity: 3 });
  });

  it('emits nothing when there is no tenant (no context, no override)', () => {
    const sink = new InMemoryMeterSink();
    new MeterEmitter({ sink: sink.sink }).count('records');
    expect(sink.events).toHaveLength(0);
  });

  it('accepts an explicit tenantId outside of context', () => {
    const sink = new InMemoryMeterSink();
    new MeterEmitter({ sink: sink.sink }).emit('ai_actions', 2, { tenantId: 'tenant-x' });
    expect(sink.events[0]).toMatchObject({ tenantId: 'tenant-x', meter: 'ai_actions', quantity: 2 });
  });

  it('ignores negative quantities and never throws on a bad sink', () => {
    const sink = new InMemoryMeterSink();
    const m = new MeterEmitter({ sink: sink.sink });
    runWithPrincipal(principal, () => m.emit('records', -5));
    expect(sink.events).toHaveLength(0);

    const boom = new MeterEmitter({ sink: () => { throw new Error('sink down'); } });
    expect(() => runWithPrincipal(principal, () => boom.count('records'))).not.toThrow();
  });
});
