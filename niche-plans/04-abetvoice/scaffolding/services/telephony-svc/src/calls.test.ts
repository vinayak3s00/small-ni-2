import { describe, it, expect } from 'vitest';
import { runWithPrincipal } from '@abetworks/core';
import { CallService, InMemoryDnd, DndBlockedError } from './calls';
import { redactTranscript } from './redaction';

const principal = { sub: 'agent-1', tenantId: 't1', roles: ['support'] };
const ctx = <T>(fn: () => T) => runWithPrincipal(principal, fn);

describe('CallService outbound + DND', () => {
  it('places an outbound call when not on DND', () => {
    const svc = new CallService(new InMemoryDnd());
    const call = ctx(() =>
      svc.placeOutbound({ recordId: 'r1', toE164: '+919800000000', language: 'hi', purpose: 'speed_to_lead' }),
    );
    expect(call.direction).toBe('outbound');
    expect(call.tenantId).toBe('t1');
  });

  it('blocks outbound to a DND number', () => {
    const dnd = new InMemoryDnd();
    dnd.block('+919811111111');
    const svc = new CallService(dnd);
    expect(() =>
      ctx(() =>
        svc.placeOutbound({ recordId: 'r1', toE164: '+919811111111', language: 'hi', purpose: 'reminder' }),
      ),
    ).toThrow(DndBlockedError);
  });

  it('escalates when the completion has no citations (ungrounded)', () => {
    const svc = new CallService(new InMemoryDnd());
    const call = ctx(() =>
      svc.placeOutbound({ recordId: 'r1', toE164: '+919800000000', language: 'en', purpose: 'followup' }),
    );
    const summary = ctx(() => svc.complete(call.id, 'Discussed pricing.', ['pricing'], []));
    expect(summary.escalated).toBe(true);
  });
});

describe('redactTranscript', () => {
  it('masks card, aadhaar and pan', () => {
    const { text, redactions } = redactTranscript(
      'card 4111 1111 1111 1111 aadhaar 1234 5678 9012 pan ABCDE1234F',
    );
    expect(text).toContain('[REDACTED_CARD]');
    expect(text).toContain('[REDACTED_AADHAAR]');
    expect(text).toContain('[REDACTED_PAN]');
    expect(redactions.length).toBeGreaterThanOrEqual(3);
  });

  it('leaves clean text untouched', () => {
    const { text, redactions } = redactTranscript('Please call me tomorrow at noon.');
    expect(text).toBe('Please call me tomorrow at noon.');
    expect(redactions).toHaveLength(0);
  });
});
