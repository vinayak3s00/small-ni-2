/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

/**
 * Abetworks pricing catalogue. Revenue-ready from day one: a small, explicit
 * set of plans with per-seat platform fees and metered usage (with an included
 * allowance and a per-unit overage rate). All money is in integer minor units
 * (paise) to avoid float error, consistent with the rest of the platform.
 */

export type PlanId = 'free' | 'growth' | 'scale' | 'enterprise';

/** Metered dimensions billed on top of the platform/seat fee. */
export type MeterKey = 'records' | 'messages' | 'voice_minutes' | 'ai_actions';

export interface MeterRate {
  /** Units included in the plan before overage applies. */
  included: number;
  /** Overage price per unit beyond the included allowance (minor units). */
  overageMinor: number;
}

export interface Plan {
  id: PlanId;
  name: string;
  /** Recurring platform fee per seat per month (minor units). */
  perSeatMinor: number;
  currency: string;
  meters: Record<MeterKey, MeterRate>;
  /** Uptime commitment surfaced on the invoice/contract. */
  uptime: string;
}

const inr = (rupees: number): number => Math.round(rupees * 100);

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    name: 'Free',
    perSeatMinor: 0,
    currency: 'INR',
    uptime: 'best-effort',
    meters: {
      records: { included: 500, overageMinor: 0 }, // capped, not billed
      messages: { included: 200, overageMinor: 0 },
      voice_minutes: { included: 0, overageMinor: 0 },
      ai_actions: { included: 100, overageMinor: 0 },
    },
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    perSeatMinor: inr(1499),
    currency: 'INR',
    uptime: '99.9%',
    meters: {
      records: { included: 10_000, overageMinor: inr(0.5) },
      messages: { included: 5_000, overageMinor: inr(0.3) },
      voice_minutes: { included: 500, overageMinor: inr(2) },
      ai_actions: { included: 5_000, overageMinor: inr(0.2) },
    },
  },
  scale: {
    id: 'scale',
    name: 'Scale',
    perSeatMinor: inr(3999),
    currency: 'INR',
    uptime: '99.95%',
    meters: {
      records: { included: 100_000, overageMinor: inr(0.3) },
      messages: { included: 50_000, overageMinor: inr(0.2) },
      voice_minutes: { included: 5_000, overageMinor: inr(1.5) },
      ai_actions: { included: 50_000, overageMinor: inr(0.12) },
    },
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    perSeatMinor: inr(7999),
    currency: 'INR',
    uptime: '99.95% + credits',
    meters: {
      records: { included: 1_000_000, overageMinor: inr(0.15) },
      messages: { included: 500_000, overageMinor: inr(0.1) },
      voice_minutes: { included: 25_000, overageMinor: inr(1) },
      ai_actions: { included: 500_000, overageMinor: inr(0.08) },
    },
  },
};

export function getPlan(id: PlanId): Plan {
  const plan = PLANS[id];
  if (!plan) throw new Error(`unknown plan: ${id}`);
  return plan;
}
