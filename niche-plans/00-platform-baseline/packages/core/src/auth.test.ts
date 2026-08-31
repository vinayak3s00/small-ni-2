/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { verifyToken, parseBearer } from './auth';

const SECRET = 'unit-test-secret';

describe('verifyToken', () => {
  it('extracts the principal from a valid HS256 token', () => {
    const token = jwt.sign({ sub: 'u1', tenant_id: 't1', roles: ['sales', 'admin'] }, SECRET);
    const principal = verifyToken(token, SECRET);
    expect(principal).toEqual({ sub: 'u1', tenantId: 't1', roles: ['sales', 'admin'] });
  });

  it('accepts the short `tid` claim as tenant id', () => {
    const token = jwt.sign({ sub: 'u1', tid: 't2' }, SECRET);
    expect(verifyToken(token, SECRET).tenantId).toBe('t2');
  });

  it('rejects an unsigned (alg: none) token', () => {
    // Forge a token with alg:none and no signature — the classic bypass.
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'u1', tenant_id: 't1' })).toString(
      'base64url',
    );
    const forged = `${header}.${payload}.`;
    expect(() => verifyToken(forged, SECRET)).toThrow();
  });

  it('rejects a token signed with an algorithm outside the allowlist', () => {
    // Token is genuinely HS512-signed, but the allowlist only permits HS256.
    const token = jwt.sign({ sub: 'u1', tenant_id: 't1' }, SECRET, { algorithm: 'HS512' });
    expect(() => verifyToken(token, SECRET, { algorithms: ['HS256'] })).toThrow();
    // ...and succeeds when the algorithm is explicitly allowed.
    expect(verifyToken(token, SECRET, { algorithms: ['HS512'] }).sub).toBe('u1');
  });

  it('rejects a token with a bad signature', () => {
    const token = jwt.sign({ sub: 'u1', tenant_id: 't1' }, SECRET);
    expect(() => verifyToken(token, 'wrong-secret')).toThrow();
  });

  it('throws when required claims are missing', () => {
    const token = jwt.sign({ sub: 'u1' }, SECRET); // no tenant
    expect(() => verifyToken(token, SECRET)).toThrow(/required claims/);
  });

  it('normalizes a single-string roles claim into an array', () => {
    const token = jwt.sign({ sub: 'u1', tenant_id: 't1', roles: 'admin' }, SECRET);
    expect(verifyToken(token, SECRET).roles).toEqual(['admin']);
  });

  it('defaults roles to an empty array and drops non-string entries', () => {
    const noRoles = jwt.sign({ sub: 'u1', tenant_id: 't1' }, SECRET);
    expect(verifyToken(noRoles, SECRET).roles).toEqual([]);
    const junk = jwt.sign({ sub: 'u1', tenant_id: 't1', roles: ['ok', 42, null] }, SECRET);
    expect(verifyToken(junk, SECRET).roles).toEqual(['ok']);
  });

  it('enforces issuer and audience when provided', () => {
    const token = jwt.sign({ sub: 'u1', tenant_id: 't1' }, SECRET, {
      issuer: 'abetworks',
      audience: 'core-crm',
    });
    expect(verifyToken(token, SECRET, { issuer: 'abetworks', audience: 'core-crm' }).sub).toBe('u1');
    expect(() => verifyToken(token, SECRET, { issuer: 'evil' })).toThrow();
    expect(() => verifyToken(token, SECRET, { audience: 'other-svc' })).toThrow();
  });

  it('rejects an expired token but tolerates skew within clock tolerance', () => {
    const expired = jwt.sign({ sub: 'u1', tenant_id: 't1' }, SECRET, { expiresIn: -10 });
    expect(() => verifyToken(expired, SECRET)).toThrow();
    expect(verifyToken(expired, SECRET, { clockToleranceSec: 30 }).sub).toBe('u1');
  });
});

describe('parseBearer', () => {
  it('extracts the token from a well-formed header', () => {
    expect(parseBearer('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  it('throws on missing or malformed headers', () => {
    expect(() => parseBearer(undefined)).toThrow(/Authorization header/);
    expect(() => parseBearer('Basic xyz')).toThrow(/Authorization header/);
    expect(() => parseBearer('Bearer   ')).toThrow(/Authorization header/);
  });
});
