/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import jwt, { type Algorithm } from 'jsonwebtoken';
import type { Principal } from './types';

/**
 * Options controlling how a bearer JWT is verified.
 *
 * Security note: `algorithms` is REQUIRED behaviour (defaulted here) — never
 * let the caller-supplied token dictate the verification algorithm. Passing an
 * explicit allowlist to `jwt.verify` closes the well-known "alg" confusion /
 * `alg: none` attack classes, where an attacker downgrades an RS256-signed API
 * to accept an unsigned or HMAC-forged token.
 */
export interface VerifyOptions {
  /** Allowed signing algorithms. Defaults to HS256 (the platform baseline). */
  algorithms?: Algorithm[];
  /** Expected `iss` claim, if issued by the platform IdP. */
  issuer?: string;
  /** Expected `aud` claim (the service/audience the token was minted for). */
  audience?: string;
  /** Leeway, in seconds, for exp/nbf checks to tolerate clock skew. */
  clockToleranceSec?: number;
}

/** Platform default: baseline mints short-lived HS256 tokens. */
const DEFAULT_ALGORITHMS: Algorithm[] = ['HS256'];

/**
 * Verifies a bearer JWT and extracts the platform Principal.
 * Baseline: short-lived OIDC tokens; tenant + roles are claims.
 *
 * The signing algorithm is always constrained to an explicit allowlist so a
 * forged/unsigned token cannot bypass signature verification.
 */
export function verifyToken(token: string, secret: string, options: VerifyOptions = {}): Principal {
  const decoded = jwt.verify(token, secret, {
    algorithms: options.algorithms ?? DEFAULT_ALGORITHMS,
    issuer: options.issuer,
    audience: options.audience,
    clockTolerance: options.clockToleranceSec,
  }) as Record<string, unknown>;

  const tenantId = decoded.tenant_id ?? decoded.tid;
  const sub = decoded.sub;
  const roles = decoded.roles ?? [];
  if (typeof sub !== 'string' || typeof tenantId !== 'string') {
    throw new Error('Token missing required claims: sub, tenant_id');
  }
  return {
    sub,
    tenantId,
    roles: normalizeRoles(roles),
  };
}

/**
 * Coerces the `roles` claim into a clean `string[]`. Tokens minted by
 * different IdPs may omit roles, send a single string, or include non-string
 * junk; we defensively normalise so downstream `hasRole()` checks are sound.
 */
function normalizeRoles(roles: unknown): string[] {
  if (typeof roles === 'string') return [roles];
  if (!Array.isArray(roles)) return [];
  return roles.filter((r): r is string => typeof r === 'string');
}

/** Parse an `Authorization: Bearer <jwt>` header value. */
export function parseBearer(header?: string): string {
  if (!header || !header.startsWith('Bearer ')) {
    throw new Error('Missing or malformed Authorization header');
  }
  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    throw new Error('Missing or malformed Authorization header');
  }
  return token;
}
