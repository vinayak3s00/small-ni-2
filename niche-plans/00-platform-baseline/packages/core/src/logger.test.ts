/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { describe, it, expect } from 'vitest';
import { Logger, type LogRecord } from './logger';
import { runWithPrincipal } from './tenant-context';

function capture() {
  const records: LogRecord[] = [];
  return { records, sink: (r: LogRecord) => records.push(r) };
}

const principal = { sub: 'user-9', tenantId: 'tenant-xyz', roles: ['sales'] };

describe('Logger', () => {
  it('emits a structured record with level, msg, time', () => {
    const { records, sink } = capture();
    new Logger({ service: 'svc', sink, minLevel: 'debug' }).info('hello', { foo: 1 });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ level: 'info', msg: 'hello', service: 'svc', foo: 1 });
    expect(records[0].time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('respects the minimum level', () => {
    const { records, sink } = capture();
    const log = new Logger({ sink, minLevel: 'warn' });
    log.debug('nope');
    log.info('nope');
    log.warn('yes');
    log.error('yes');
    expect(records.map((r) => r.level)).toEqual(['warn', 'error']);
  });

  it('auto-correlates tenant + actor when inside a tenant context', () => {
    const { records, sink } = capture();
    const log = new Logger({ sink });
    runWithPrincipal(principal, () => log.info('scoped'));
    expect(records[0]).toMatchObject({ tenantId: 'tenant-xyz', actor: 'user-9' });
  });

  it('omits correlation fields outside a tenant context', () => {
    const { records, sink } = capture();
    new Logger({ sink }).info('unscoped');
    expect(records[0].tenantId).toBeUndefined();
    expect(records[0].actor).toBeUndefined();
  });

  it('child loggers inherit bound fields and requestId', () => {
    const { records, sink } = capture();
    const child = new Logger({ sink }).child({ requestId: 'req-1', component: 'repo' });
    child.info('work');
    expect(records[0]).toMatchObject({ requestId: 'req-1', component: 'repo' });
  });

  it('never throws even if the sink throws', () => {
    const log = new Logger({ sink: () => { throw new Error('sink boom'); } });
    expect(() => log.error('should not throw')).not.toThrow();
  });
});
