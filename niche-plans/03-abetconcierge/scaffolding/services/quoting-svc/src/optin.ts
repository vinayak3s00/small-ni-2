/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

/**
 * WhatsApp opt-in + template-quality guard. Baseline compliance: enforce
 * explicit opt-in before any templated/outbound message, and protect the
 * business's WhatsApp quality rating by rejecting obviously spammy templates.
 */

export interface OptInStore {
  isOptedIn(tenantId: string, partyId: string): boolean;
}

export class InMemoryOptInStore implements OptInStore {
  private grants = new Set<string>();
  private key(t: string, p: string) {
    return `${t}:${p}`;
  }
  grant(tenantId: string, partyId: string) {
    this.grants.add(this.key(tenantId, partyId));
  }
  revoke(tenantId: string, partyId: string) {
    this.grants.delete(this.key(tenantId, partyId));
  }
  isOptedIn(tenantId: string, partyId: string): boolean {
    return this.grants.has(this.key(tenantId, partyId));
  }
}

export interface SendGuardResult {
  allowed: boolean;
  reason?: string;
}

const SPAM_MARKERS = ['CLICK NOW', 'FREE!!!', 'WINNER', 'GUARANTEED CASH'];

export function guardOutbound(
  store: OptInStore,
  tenantId: string,
  partyId: string,
  templateBody: string,
): SendGuardResult {
  if (!store.isOptedIn(tenantId, partyId)) {
    return { allowed: false, reason: 'recipient has not opted in' };
  }
  const upper = templateBody.toUpperCase();
  if (SPAM_MARKERS.some((m) => upper.includes(m))) {
    return { allowed: false, reason: 'template violates quality guidelines' };
  }
  return { allowed: true };
}
