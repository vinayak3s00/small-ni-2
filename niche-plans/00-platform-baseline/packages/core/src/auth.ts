/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import jwt from 'jsonwebtoken';
import type { Principal } from './types';

/**
 * Verifies a bearer JWT and extracts the platform Principal.
 * Baseline: short-lived OIDC tokens; tenant + roles are claims.
 */
export function verifyToken(token: string, secret: string): Principal {
  const decoded = jwt.verify(token, secret) as Record<string, unknown>;
  const tenantId = decoded.tenant_id ?? decoded.tid;
  const sub = decoded.sub;
  const roles = decoded.roles ?? [];
  if (typeof sub !== 'string' || typeof tenantId !== 'string') {
    throw new Error('Token missing required claims: sub, tenant_id');
  }
  return {
    sub,
    tenantId,
    roles: Array.isArray(roles) ? (roles as string[]) : [],
  };
}

/** Parse an `Authorization: Bearer <jwt>` header value. */
export function parseBearer(header?: string): string {
  if (!header || !header.startsWith('Bearer ')) {
    throw new Error('Missing or malformed Authorization header');
  }
  return header.slice('Bearer '.length).trim();
}
