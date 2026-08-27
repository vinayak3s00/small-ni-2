/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { describe, it, expect } from 'vitest';
import { InMemoryPartnerStore, WorkspaceExistsError } from './partner';

describe('InMemoryPartnerStore — hierarchical tenancy', () => {
  it('provisions isolated workspaces with unique tenant ids + sender identities', async () => {
    const store = new InMemoryPartnerStore();
    const a = await store.provision('partner-1', 'Acme Retail');
    const b = await store.provision('partner-1', 'Beta Foods');
    expect(a.tenantId).not.toBe(b.tenantId);
    expect(a.senderIdentity).not.toBe(b.senderIdentity);
    expect(await store.listWorkspaces('partner-1')).toHaveLength(2);
  });

  it('prevents duplicate client workspaces', async () => {
    const store = new InMemoryPartnerStore();
    await store.provision('partner-1', 'Acme Retail');
    await expect(store.provision('partner-1', 'Acme Retail')).rejects.toBeInstanceOf(
      WorkspaceExistsError,
    );
  });

  it('denies partner access to a workspace without a matching grant', async () => {
    const store = new InMemoryPartnerStore();
    const ws = await store.provision('partner-1', 'Acme Retail');
    expect(await store.canAccess('partner-1', ws.id, 'pii:read')).toBe(false);
    await store.grant('partner-1', ws.id, ['reports:read']);
    expect(await store.canAccess('partner-1', ws.id, 'reports:read')).toBe(true);
    expect(await store.canAccess('partner-1', ws.id, 'pii:read')).toBe(false); // scope not granted
  });

  it('denies cross-partner access even with a grant', async () => {
    const store = new InMemoryPartnerStore();
    const ws = await store.provision('partner-1', 'Acme Retail');
    await store.grant('partner-2', ws.id, ['reports:read']); // partner-2 does not own ws
    expect(await store.canAccess('partner-2', ws.id, 'reports:read')).toBe(false);
  });

  it('computes billing rollup with margin', async () => {
    const store = new InMemoryPartnerStore();
    const ws = await store.provision('partner-1', 'Acme Retail');
    await store.recordUsage('partner-1', ws.id, 1000);
    const rollup = await store.billingRollup('partner-1', 5, 12); // wholesale 5p, retail 12p
    expect(rollup[0].wholesaleCostMinor).toBe(5000);
    expect(rollup[0].retailPriceMinor).toBe(12000);
    expect(rollup[0].marginMinor).toBe(7000);
  });
});
