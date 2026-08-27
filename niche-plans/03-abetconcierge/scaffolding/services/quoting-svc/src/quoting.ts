/**
 * GST-aware, multi-currency quoting for AbetConcierge ("built for how India sells").
 * All money is handled in integer minor units (paise / cents) to avoid float error.
 */

export interface CatalogItem {
  sku: string;
  name: string;
  priceMinor: number; // unit price in minor units
  gstRate: number; // e.g. 0.18 for 18% GST
}

export interface QuoteLineInput {
  sku: string;
  qty: number;
}

export interface QuoteLine {
  sku: string;
  name: string;
  qty: number;
  unitPriceMinor: number;
  lineSubtotalMinor: number;
  gstRate: number;
  lineGstMinor: number;
  lineTotalMinor: number;
}

export interface Quote {
  currency: string;
  lines: QuoteLine[];
  subtotalMinor: number;
  gstMinor: number;
  totalMinor: number;
}

export class UnknownSkuError extends Error {
  constructor(sku: string) {
    super(`unknown sku: ${sku}`);
    this.name = 'UnknownSkuError';
  }
}

/** Banker's-safe rounding for money: round half away from zero on minor units. */
function roundMinor(value: number): number {
  return Math.round(value);
}

export function buildQuote(
  catalog: Map<string, CatalogItem>,
  currency: string,
  inputs: QuoteLineInput[],
): Quote {
  if (!inputs.length) throw new Error('quote requires at least one line');

  const lines: QuoteLine[] = inputs.map((input) => {
    if (input.qty <= 0) throw new Error(`qty must be positive for sku ${input.sku}`);
    const item = catalog.get(input.sku);
    if (!item) throw new UnknownSkuError(input.sku);

    const lineSubtotalMinor = item.priceMinor * input.qty;
    const lineGstMinor = roundMinor(lineSubtotalMinor * item.gstRate);
    return {
      sku: item.sku,
      name: item.name,
      qty: input.qty,
      unitPriceMinor: item.priceMinor,
      lineSubtotalMinor,
      gstRate: item.gstRate,
      lineGstMinor,
      lineTotalMinor: lineSubtotalMinor + lineGstMinor,
    };
  });

  const subtotalMinor = lines.reduce((s, l) => s + l.lineSubtotalMinor, 0);
  const gstMinor = lines.reduce((s, l) => s + l.lineGstMinor, 0);

  return {
    currency,
    lines,
    subtotalMinor,
    gstMinor,
    totalMinor: subtotalMinor + gstMinor,
  };
}
