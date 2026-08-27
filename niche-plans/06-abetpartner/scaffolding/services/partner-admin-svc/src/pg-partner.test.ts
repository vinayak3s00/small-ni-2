/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runWithPrincipal } from '@abetworks/core';
import { Pool } from 'pg';
import { createPool, migrate } from './db';
import { PgPartnerStore } from './pg-partner';
import { WorkspaceExistsError } from './partner';

const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;

// The partner IS the tenant here.
const P1 = '11111111-1111-1111-1111-111111111111';
const P2 = '22222222-2222-2222-2222-222222222222';
const asP1 = <T>(fn: () => Promise<T>) => runWithPrincipal({ sub: 'p1', tenantId: P1, roles: ['owner'] }, fn);
const asP2 = <T>(fn: () => Promise<T>) => runWithPrincipal({ sub: 'p2', tenantId: P2, roles: ['owner'] }, fn);

d('PgPartnerStore (integration)', () => {
  let pool: Pool;
  let store: PgPartnerStore;

  beforeAll(async () => {
    pool = createPool();
    await migrate(pool);
    await pool.query('TRUNCATE workspace, workspace_grant, usage_event RESTART IDENTITY CASCADE');
    store = new PgPartnerStore(pool);
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it('provisions isolated workspaces and rejects duplicates', async () => {
    const ws = await asP1(() => store.provision(P1, 'Acme Retail'));
    expect(ws.tenantId).toBeTruthy();
    await expect(asP1(() => store.provision(P1, 'Acme Retail'))).rejects.toBeInstanceOf(
      WorkspaceExistsError,
    );
  });

  it('enforces RLS: partner 2 cannot see partner 1 workspaces', async () => {
    const list = await asP2(() => store.listWorkspaces(P2));
    expect(list).toHaveLength(0);
  });

  it('grants scope and gates access; cross-partner cannot access', async () => {
    const [ws] = await asP1(() => store.listWorkspaces(P1));
    await asP1(() => store.grant(P1, ws.id, ['reports:read']));
    expect(await asP1(() => store.canAccess(P1, ws.id, 'reports:read'))).toBe(true);
    expect(await asP1(() => store.canAccess(P1, ws.id, 'pii:read'))).toBe(false);
    // Partner 2 (RLS-scoped) sees no grant on partner 1's workspace.
    expect(await asP2(() => store.canAccess(P2, ws.id, 'reports:read'))).toBe(false);
  });

  it('rolls up usage with margin', async () => {
    const [ws] = await asP1(() => store.listWorkspaces(P1));
    await asP1(() => store.recordUsage(P1, ws.id, 400));
    await asP1(() => store.recordUsage(P1, ws.id, 600)); // total 1000
    const rollup = await asP1(() => store.billingRollup(P1, 5, 12));
    const line = rollup.find((r) => r.workspaceId === ws.id)!;
    expect(line.meteredUnits).toBe(1000);
    expect(line.marginMinor).toBe(7000);
  });
});
