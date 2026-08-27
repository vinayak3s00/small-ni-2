import { describe, it, expect } from 'vitest';
import { PartnerRegistry, WorkspaceExistsError } from './partner';

describe('PartnerRegistry — hierarchical tenancy', () => {
  it('provisions isolated workspaces with unique tenant ids + sender identities', () => {
    const reg = new PartnerRegistry();
    const a = reg.provision('partner-1', 'Acme Retail');
    const b = reg.provision('partner-1', 'Beta Foods');
    expect(a.tenantId).not.toBe(b.tenantId);
    expect(a.senderIdentity).not.toBe(b.senderIdentity);
    expect(reg.listWorkspaces('partner-1')).toHaveLength(2);
  });

  it('prevents duplicate client workspaces', () => {
    const reg = new PartnerRegistry();
    reg.provision('partner-1', 'Acme Retail');
    expect(() => reg.provision('partner-1', 'Acme Retail')).toThrow(WorkspaceExistsError);
  });

  it('denies partner access to a workspace without a matching grant', () => {
    const reg = new PartnerRegistry();
    const ws = reg.provision('partner-1', 'Acme Retail');
    expect(reg.canAccess('partner-1', ws.id, 'pii:read')).toBe(false);
    reg.grant('partner-1', ws.id, ['reports:read']);
    expect(reg.canAccess('partner-1', ws.id, 'reports:read')).toBe(true);
    expect(reg.canAccess('partner-1', ws.id, 'pii:read')).toBe(false); // scope not granted
  });

  it('denies cross-partner access even with a grant', () => {
    const reg = new PartnerRegistry();
    const ws = reg.provision('partner-1', 'Acme Retail');
    reg.grant('partner-2', ws.id, ['reports:read']); // partner-2 does not own ws
    expect(reg.canAccess('partner-2', ws.id, 'reports:read')).toBe(false);
  });

  it('computes billing rollup with margin', () => {
    const reg = new PartnerRegistry();
    const ws = reg.provision('partner-1', 'Acme Retail');
    reg.recordUsage(ws.id, 1000);
    const rollup = reg.billingRollup('partner-1', 5, 12); // wholesale 5p/unit, retail 12p/unit
    expect(rollup[0].wholesaleCostMinor).toBe(5000);
    expect(rollup[0].retailPriceMinor).toBe(12000);
    expect(rollup[0].marginMinor).toBe(7000);
  });
});
