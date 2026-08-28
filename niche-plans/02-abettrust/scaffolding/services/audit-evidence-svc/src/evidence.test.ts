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
  it('appends events with a valid hash chain', async () => {
    const chain = new AuditChain();
    await chain.append(ev('a'));
    await chain.append(ev('b', 'export'));
    await chain.append(ev('c', 'write'));
    expect(await chain.verify()).toBe(true);
  });

  it('links each event to the previous hash', async () => {
    const chain = new AuditChain();
    const a = await chain.append(ev('a'));
    const b = await chain.append(ev('b'));
    expect(b.prevHash).toBe(a.hash);
    expect(a.seq).toBe(0);
    expect(b.seq).toBe(1);
  });

  it('detects tampering (modification breaks the chain)', async () => {
    const chain = new AuditChain();
    await chain.append(ev('a'));
    await chain.append(ev('b'));
    // Tamper with an internal event via a cast into the private array.
    (chain as unknown as { events: { entityId: string }[] }).events[0].entityId = 'HACKED';
    expect(await chain.verify()).toBe(false);
  });

  it('filters events by action', async () => {
    const chain = new AuditChain();
    await chain.append(ev('a', 'read'));
    await chain.append(ev('b', 'export'));
    expect(await chain.query({ action: 'export' })).toHaveLength(1);
  });

  it('generates a deterministic-shape evidence pack', async () => {
    const chain = new AuditChain();
    await chain.append(ev('a'));
    await chain.append(ev('b'));
    const pack = await chain.generatePack('2026-Q2', '2000-01-01T00:00:00Z', '2100-01-01T00:00:00Z');
    expect(pack.eventCount).toBe(2);
    expect(pack.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(pack.merkleRoot).toMatch(/^[a-f0-9]{64}$/);
  });
});
