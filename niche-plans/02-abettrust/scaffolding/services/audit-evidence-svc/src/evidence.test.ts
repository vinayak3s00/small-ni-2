/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { describe, it, expect } from 'vitest';
import type { AuditEvent } from '@abetworks/core';
import { AuditChain } from './evidence';

const ev = (id: string, action: AuditEvent['action'] = 'read'): AuditEvent => ({
  tenantId: 't1',
  actor: 'u1',
  action,
  entity: 'record',
  entityId: id,
  at: new Date().toISOString(),
});

describe('AuditChain', () => {
  it('appends events with a valid hash chain', () => {
    const chain = new AuditChain();
    chain.append(ev('a'));
    chain.append(ev('b', 'export'));
    chain.append(ev('c', 'write'));
    expect(chain.verify()).toBe(true);
  });

  it('detects tampering (deletion/modification breaks the chain)', () => {
    const chain = new AuditChain();
    chain.append(ev('a'));
    chain.append(ev('b'));
    // Tamper with an internal event via a cast into the private array.
    (chain as any).events[0].entityId = 'HACKED';
    expect(chain.verify()).toBe(false);
  });

  it('filters events by action', () => {
    const chain = new AuditChain();
    chain.append(ev('a', 'read'));
    chain.append(ev('b', 'export'));
    expect(chain.query({ action: 'export' })).toHaveLength(1);
  });

  it('generates a deterministic-shape evidence pack', () => {
    const chain = new AuditChain();
    chain.append(ev('a'));
    chain.append(ev('b'));
    const pack = chain.generatePack('2026-Q2', '2000-01-01T00:00:00Z', '2100-01-01T00:00:00Z');
    expect(pack.eventCount).toBe(2);
    expect(pack.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(pack.merkleRoot).toMatch(/^[a-f0-9]{64}$/);
  });
});
