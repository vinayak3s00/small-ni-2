/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { getPlan, type MeterKey, type PlanId } from './pricing';
import type { UsageByMeter } from './metering';

/**
 * Invoice calculation: platform (per-seat) fee + metered overage, plus optional
 * GST, all in integer minor units. This is the money math that turns usage into
 * revenue — deterministic and fully unit-tested.
 */

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPriceMinor: number;
  amountMinor: number;
}

export interface Invoice {
  planId: PlanId;
  seats: number;
  currency: string;
  lines: InvoiceLine[];
  subtotalMinor: number;
  gstMinor: number;
  totalMinor: number;
}

export interface InvoiceInput {
  planId: PlanId;
  seats: number;
  usage: UsageByMeter;
  gstRate?: number; // e.g. 0.18; default 0 (out-of-scope customers)
}

const METER_LABELS: Record<MeterKey, string> = {
  records: 'Records',
  messages: 'Messages',
  voice_minutes: 'Voice minutes',
  ai_actions: 'AI actions',
};

export function calculateInvoice(input: InvoiceInput): Invoice {
  if (input.seats < 0) throw new Error('seats must be non-negative');
  const plan = getPlan(input.planId);
  const lines: InvoiceLine[] = [];

  // 1. Platform / seat fee.
  if (plan.perSeatMinor > 0 && input.seats > 0) {
    lines.push({
      description: `${plan.name} platform (per seat)`,
      quantity: input.seats,
      unitPriceMinor: plan.perSeatMinor,
      amountMinor: plan.perSeatMinor * input.seats,
    });
  }

  // 2. Metered overage beyond each meter's included allowance.
  (Object.keys(plan.meters) as MeterKey[]).forEach((meter) => {
    const rate = plan.meters[meter];
    const used = input.usage[meter] ?? 0;
    const overage = Math.max(0, used - rate.included);
    if (overage > 0 && rate.overageMinor > 0) {
      lines.push({
        description: `${METER_LABELS[meter]} overage (${overage} over ${rate.included} included)`,
        quantity: overage,
        unitPriceMinor: rate.overageMinor,
        amountMinor: overage * rate.overageMinor,
      });
    }
  });

  const subtotalMinor = lines.reduce((s, l) => s + l.amountMinor, 0);
  const gstRate = input.gstRate ?? 0;
  const gstMinor = Math.round(subtotalMinor * gstRate);

  return {
    planId: plan.id,
    seats: input.seats,
    currency: plan.currency,
    lines,
    subtotalMinor,
    gstMinor,
    totalMinor: subtotalMinor + gstMinor,
  };
}

/**
 * Service credit for an SLA miss (applied as a negative adjustment to the next
 * invoice). Mirrors the published SLA credit schedule.
 */
export function serviceCreditMinor(monthlyFeeMinor: number, uptime: number): number {
  let pct = 0;
  if (uptime < 0.99) pct = 0.5;
  else if (uptime < 0.999) pct = 0.25;
  else if (uptime < 0.9995) pct = 0.1;
  return Math.round(monthlyFeeMinor * pct);
}
