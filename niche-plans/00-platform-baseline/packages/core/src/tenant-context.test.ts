/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { describe, it, expect } from 'vitest';
import { runWithPrincipal, getTenantId, getPrincipal, hasRole } from './tenant-context';
import { withTenantScope, type QueryRunner } from './rls';
import { AuditLogger, InMemoryAuditSink } from './audit';

const principal = { sub: 'user-1', tenantId: 'tenant-abc', roles: ['sales', 'admin'] };

describe('tenant-context', () => {
  it('exposes tenant id and roles within scope', () => {
    runWithPrincipal(principal, () => {
      expect(getTenantId()).toBe('tenant-abc');
      expect(hasRole('admin')).toBe(true);
      expect(hasRole('compliance_officer')).toBe(false);
      expect(getPrincipal().sub).toBe('user-1');
    });
  });

  it('throws outside of scope', () => {
    expect(() => getTenantId()).toThrow(/No tenant context/);
  });
});

describe('withTenantScope (RLS)', () => {
  it('sets app.tenant_id inside a transaction and commits', async () => {
    const calls: string[] = [];
    const runner: QueryRunner = {
      async query(sql: string, params?: unknown[]) {
        calls.push(params ? `${sql} :: ${JSON.stringify(params)}` : sql);
        return { rows: [] };
      },
    };
    await runWithPrincipal(principal, () =>
      withTenantScope(runner, async (tx) => {
        await tx.query('SELECT 1');
      }),
    );
    expect(calls[0]).toBe('BEGIN');
    expect(calls[1]).toContain('set_config');
    expect(calls[1]).toContain('tenant-abc');
    expect(calls).toContain('COMMIT');
  });

  it('rolls back on error', async () => {
    const calls: string[] = [];
    const runner: QueryRunner = {
      async query(sql: string) {
        calls.push(sql);
        if (sql === 'boom') throw new Error('fail');
        return { rows: [] };
      },
    };
    await expect(
      runWithPrincipal(principal, () =>
        withTenantScope(runner, async (tx) => {
          await tx.query('boom');
        }),
      ),
    ).rejects.toThrow('fail');
    expect(calls).toContain('ROLLBACK');
  });
});

describe('AuditLogger', () => {
  it('records an append-only event with actor + tenant', async () => {
    const sink = new InMemoryAuditSink();
    const logger = new AuditLogger(sink);
    await runWithPrincipal(principal, () => logger.record('export', 'record', 'rec-1', ['email']));
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]).toMatchObject({
      tenantId: 'tenant-abc',
      actor: 'user-1',
      action: 'export',
      entity: 'record',
      entityId: 'rec-1',
      fields: ['email'],
    });
  });
});
