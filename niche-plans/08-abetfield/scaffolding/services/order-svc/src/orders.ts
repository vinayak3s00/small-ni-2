/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { randomUUID } from 'node:crypto';
import { getTenantId } from '@abetworks/core';

/**
 * GST-aware field-order capture with stock allocation for AbetField.
 *
 *  * Money is handled in integer minor units (paise) to avoid float error.
 *  * Each SKU has a stock position; placing an order allocates stock atomically
 *    and REJECTS the whole order if any line exceeds available quantity, so a
 *    rep can never sell stock that isn't there.
 *  * Idempotent by clientOrderId (offline captures may replay on sync).
 */

export interface CatalogItem {
  sku: string;
  name: string;
  priceMinor: number;
  gstRate: number;
}

export interface OrderLineInput {
  sku: string;
  qty: number;
}

export interface OrderLine extends OrderLineInput {
  name: string;
  unitPriceMinor: number;
  lineSubtotalMinor: number;
  gstRate: number;
  lineGstMinor: number;
  lineTotalMinor: number;
}

export interface FieldOrder {
  id: string;
  tenantId: string;
  clientOrderId: string;
  outletId: string;
  currency: string;
  lines: OrderLine[];
  subtotalMinor: number;
  gstMinor: number;
  totalMinor: number;
}

export class InsufficientStockError extends Error {
  constructor(sku: string, requested: number, available: number) {
    super(`insufficient stock for ${sku}: requested ${requested}, available ${available}`);
    this.name = 'InsufficientStockError';
  }
}
export class UnknownSkuError extends Error {
  constructor(sku: string) {
    super(`unknown sku: ${sku}`);
    this.name = 'UnknownSkuError';
  }
}

export class OrderService {
  private catalog = new Map<string, CatalogItem>();
  private stock = new Map<string, number>(); // sku -> qty available (per tenant demo: single tenant scope in map key)
  private orders = new Map<string, FieldOrder>(); // clientOrderId -> order (idempotency)

  setItem(item: CatalogItem, stock: number): void {
    this.catalog.set(item.sku, item);
    this.stock.set(this.key(item.sku), stock);
  }

  private key(sku: string): string {
    return `${getTenantId()}:${sku}`;
  }

  stockOf(sku: string): number {
    return this.stock.get(this.key(sku)) ?? 0;
  }

  place(clientOrderId: string, outletId: string, currency: string, inputs: OrderLineInput[]): FieldOrder {
    // Idempotent replay: same clientOrderId returns the original order.
    const existing = this.orders.get(clientOrderId);
    if (existing && existing.tenantId === getTenantId()) return existing;

    if (!inputs.length) throw new Error('order requires at least one line');

    // Validate + pre-check stock before allocating anything (all-or-nothing).
    for (const inp of inputs) {
      if (inp.qty <= 0) throw new Error(`qty must be positive for ${inp.sku}`);
      if (!this.catalog.has(inp.sku)) throw new UnknownSkuError(inp.sku);
      const available = this.stockOf(inp.sku);
      if (inp.qty > available) throw new InsufficientStockError(inp.sku, inp.qty, available);
    }

    const lines: OrderLine[] = inputs.map((inp) => {
      const item = this.catalog.get(inp.sku)!;
      const lineSubtotalMinor = item.priceMinor * inp.qty;
      const lineGstMinor = Math.round(lineSubtotalMinor * item.gstRate);
      return {
        sku: item.sku,
        name: item.name,
        qty: inp.qty,
        unitPriceMinor: item.priceMinor,
        lineSubtotalMinor,
        gstRate: item.gstRate,
        lineGstMinor,
        lineTotalMinor: lineSubtotalMinor + lineGstMinor,
      };
    });

    // Commit: allocate stock now that all lines are valid.
    for (const inp of inputs) {
      this.stock.set(this.key(inp.sku), this.stockOf(inp.sku) - inp.qty);
    }

    const subtotalMinor = lines.reduce((s, l) => s + l.lineSubtotalMinor, 0);
    const gstMinor = lines.reduce((s, l) => s + l.lineGstMinor, 0);

    const order: FieldOrder = {
      id: randomUUID(),
      tenantId: getTenantId(),
      clientOrderId,
      outletId,
      currency,
      lines,
      subtotalMinor,
      gstMinor,
      totalMinor: subtotalMinor + gstMinor,
    };
    this.orders.set(clientOrderId, order);
    return order;
  }
}
