/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

/**
 * PII redaction for call transcripts (AbetVoice security profile).
 * Masks card-like numbers, Aadhaar-like 12-digit numbers, and PAN patterns
 * before a transcript is stored/searched. Conservative by design.
 */

// 16-digit card (allow spaces/dashes between groups of 4).
const CARD = /\b(?:\d[ -]?){15}\d\b/g;
// Aadhaar-like: 12 digits, often grouped 4-4-4.
const AADHAAR = /\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g;
// PAN: 5 letters, 4 digits, 1 letter.
const PAN = /\b[A-Z]{5}\d{4}[A-Z]\b/g;

export interface RedactionResult {
  text: string;
  redactions: { type: string; count: number }[];
}

export function redactTranscript(input: string): RedactionResult {
  const redactions: { type: string; count: number }[] = [];

  const apply = (text: string, re: RegExp, type: string, mask: string): string => {
    const matches = text.match(re);
    if (matches && matches.length) {
      redactions.push({ type, count: matches.length });
      return text.replace(re, mask);
    }
    return text;
  };

  // Order matters: card first (longest), then aadhaar, then pan.
  let text = apply(input, CARD, 'card', '[REDACTED_CARD]');
  text = apply(text, AADHAAR, 'aadhaar', '[REDACTED_AADHAAR]');
  text = apply(text, PAN, 'pan', '[REDACTED_PAN]');

  return { text, redactions };
}
