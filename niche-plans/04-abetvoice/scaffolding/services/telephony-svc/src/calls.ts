/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { randomUUID } from 'node:crypto';
import { getTenantId } from '@abetworks/core';
import { redactTranscript } from './redaction';

export type CallDirection = 'inbound' | 'outbound';
export type CallOutcome = 'completed' | 'no_answer' | 'escalated' | 'blocked';

export interface Call {
  id: string;
  tenantId: string;
  recordId: string;
  direction: CallDirection;
  toE164: string;
  language: string;
  purpose?: string;
  startedAt: string;
  outcome?: CallOutcome;
}

export interface CallSummary {
  callId: string;
  summary: string;
  intents: string[];
  citations: string[];
  escalated: boolean;
  transcriptRedacted: string;
}

/** DND / consent registry gate for outbound calls (TRAI-aligned). */
export interface DndRegistry {
  isBlocked(e164: string): boolean;
}

export class InMemoryDnd implements DndRegistry {
  constructor(private readonly blocked = new Set<string>()) {}
  block(e164: string) {
    this.blocked.add(e164);
  }
  isBlocked(e164: string): boolean {
    return this.blocked.has(e164);
  }
}

export class DndBlockedError extends Error {
  constructor(e164: string) {
    super(`outbound blocked by DND/consent: ${e164}`);
    this.name = 'DndBlockedError';
  }
}

export class CallService {
  private calls: Call[] = [];
  private summaries = new Map<string, CallSummary>();

  constructor(private readonly dnd: DndRegistry) {}

  placeOutbound(input: {
    recordId: string;
    toE164: string;
    language: string;
    purpose: string;
  }): Call {
    if (this.dnd.isBlocked(input.toE164)) {
      throw new DndBlockedError(input.toE164);
    }
    const call: Call = {
      id: randomUUID(),
      tenantId: getTenantId(),
      recordId: input.recordId,
      direction: 'outbound',
      toE164: input.toE164,
      language: input.language,
      purpose: input.purpose,
      startedAt: new Date().toISOString(),
    };
    this.calls.push(call);
    return call;
  }

  /** Complete a call: store a PII-redacted transcript + summary. */
  complete(callId: string, transcript: string, intents: string[], citations: string[]): CallSummary {
    const tenantId = getTenantId();
    const call = this.calls.find((c) => c.id === callId && c.tenantId === tenantId);
    if (!call) throw new Error('call not found');
    const escalated = citations.length === 0; // ungrounded => escalate to human
    call.outcome = escalated ? 'escalated' : 'completed';
    const { text } = redactTranscript(transcript);
    const summary: CallSummary = {
      callId,
      summary: text.slice(0, 280),
      intents,
      citations,
      escalated,
      transcriptRedacted: text,
    };
    this.summaries.set(callId, summary);
    return summary;
  }

  getSummary(callId: string): CallSummary | undefined {
    return this.summaries.get(callId);
  }
}
