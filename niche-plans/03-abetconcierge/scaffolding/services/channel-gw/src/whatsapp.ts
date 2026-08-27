/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * WhatsApp Cloud API gateway primitives for AbetConcierge.
 *
 *  * verifyChallenge  — the GET webhook-verification handshake Meta performs
 *    once when a webhook is registered (hub.mode=subscribe + verify token).
 *  * verifySignature  — validates the X-Hub-Signature-256 HMAC on every inbound
 *    POST so we only process genuinely Meta-originated payloads.
 *  * normalizeInbound — flattens Meta's nested webhook envelope into the flat
 *    inbound-message shape the rest of the platform consumes.
 */

export function verifyChallenge(
  params: { mode?: string; token?: string; challenge?: string },
  verifyToken: string,
): string | null {
  if (params.mode === 'subscribe' && params.token === verifyToken) {
    return params.challenge ?? '';
  }
  return null;
}

/** Constant-time comparison of the sha256 HMAC over the raw request body. */
export function verifySignature(rawBody: string, header: string | undefined, appSecret: string): boolean {
  if (!header || !header.startsWith('sha256=')) return false;
  const expected = 'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface NormalizedMessage {
  channel: 'whatsapp';
  from: string;
  messageId: string;
  text: string;
  timestamp: string;
}

/** Extract inbound text messages from a WhatsApp webhook envelope. */
export function normalizeInbound(payload: any): NormalizedMessage[] {
  const out: NormalizedMessage[] = [];
  const entries = payload?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value ?? {};
      for (const msg of value?.messages ?? []) {
        if (msg?.type !== 'text') continue; // ignore non-text for this gateway
        out.push({
          channel: 'whatsapp',
          from: String(msg.from ?? ''),
          messageId: String(msg.id ?? ''),
          text: String(msg.text?.body ?? ''),
          timestamp: String(msg.timestamp ?? ''),
        });
      }
    }
  }
  return out;
}
