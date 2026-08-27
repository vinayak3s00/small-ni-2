/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { normalizeInbound, verifyChallenge, verifySignature } from './whatsapp';

const SECRET = 'dev-app-secret';
const sign = (body: string) =>
  'sha256=' + createHmac('sha256', SECRET).update(body).digest('hex');

describe('verifyChallenge', () => {
  it('echoes the challenge when mode + token match', () => {
    expect(
      verifyChallenge({ mode: 'subscribe', token: 'tok', challenge: '12345' }, 'tok'),
    ).toBe('12345');
  });
  it('rejects a wrong token', () => {
    expect(verifyChallenge({ mode: 'subscribe', token: 'bad', challenge: 'x' }, 'tok')).toBeNull();
  });
});

describe('verifySignature', () => {
  const body = JSON.stringify({ hello: 'world' });
  it('accepts a correctly signed body', () => {
    expect(verifySignature(body, sign(body), SECRET)).toBe(true);
  });
  it('rejects a tampered body', () => {
    expect(verifySignature(body + 'x', sign(body), SECRET)).toBe(false);
  });
  it('rejects a missing / malformed header', () => {
    expect(verifySignature(body, undefined, SECRET)).toBe(false);
    expect(verifySignature(body, 'md5=abc', SECRET)).toBe(false);
  });
});

describe('normalizeInbound', () => {
  it('flattens text messages from the WhatsApp envelope', () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { type: 'text', from: '919800012345', id: 'wamid.1', timestamp: '1700000000', text: { body: 'Hi' } },
                  { type: 'image', from: '919800012345', id: 'wamid.2' },
                ],
              },
            },
          ],
        },
      ],
    };
    const msgs = normalizeInbound(payload);
    expect(msgs).toHaveLength(1); // image ignored
    expect(msgs[0]).toMatchObject({ from: '919800012345', text: 'Hi', channel: 'whatsapp' });
  });

  it('returns empty for an empty payload', () => {
    expect(normalizeInbound({})).toEqual([]);
  });
});
