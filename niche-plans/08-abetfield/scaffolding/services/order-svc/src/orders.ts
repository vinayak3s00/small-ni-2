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
 *  * Placing an order allocates stock atomically and REJECTS the whole order
 *    if any line exceeds available quantity, so a rep can never sell stock that
 *    isn't there. The Postgres store enforces this at the database level so
 *    concurrent reps cannot oversell.
 *  * Idempotent by clientOrderId (offline captures may replay on sync).
 *
 * Two implementations satisfy OrderStore: InMemoryOrderStore (unit tests/dev)
 * and PgOrderStore (see pg-orders.ts).
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

/** Compute priced lines from inputs + catalog. Pure; shared by both stores. */
export function priceLines(
  catalog: Map<string, CatalogItem>,
  inputs: OrderLineInput[],
): OrderLine[] {
  return inputs.map((inp) => {
    const item = catalog.get(inp.sku);
    if (!item) throw new UnknownSkuError(inp.sku);
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
}

export function totals(lines: OrderLine[]): { subtotalMinor: number; gstMinor: number; totalMinor: number } {
  const subtotalMinor = lines.reduce((s, l) => s + l.lineSubtotalMinor, 0);
  const gstMinor = lines.reduce((s, l) => s + l.lineGstMinor, 0);
  return { subtotalMinor, gstMinor, totalMinor: subtotalMinor + gstMinor };
}

export interface OrderStore {
  setItem(item: CatalogItem, stock: number): Promise<void>;
  stockOf(sku: string): Promise<number>;
  place(
    clientOrderId: string,
    outletId: string,
    currency: string,
    inputs: OrderLineInput[],
  ): Promise<FieldOrder>;
}

/** In-memory order store (unit tests / dev). */
export class InMemoryOrderStore implements OrderStore {
  private catalog = new Map<string, CatalogItem>();
  private stock = new Map<string, number>();
  private orders = new Map<string, FieldOrder>();

  private key(sku: string): string {
    return `${getTenantId()}:${sku}`;
  }

  async setItem(item: CatalogItem, stock: number): Promise<void> {
    this.catalog.set(this.key(item.sku), item);
    this.stock.set(this.key(item.sku), stock);
  }

  async stockOf(sku: string): Promise<number> {
    return this.stock.get(this.key(sku)) ?? 0;
  }

  async place(
    clientOrderId: string,
    outletId: string,
    currency: string,
    inputs: OrderLineInput[],
  ): Promise<FieldOrder> {
    const tenantId = getTenantId();
    const existing = this.orders.get(`${tenantId}:${clientOrderId}`);
    if (existing) return existing;

    if (!inputs.length) throw new Error('order requires at least one line');

    // All-or-nothing validation before allocating anything.
    for (const inp of inputs) {
      if (inp.qty <= 0) throw new Error(`qty must be positive for ${inp.sku}`);
      const item = this.catalog.get(this.key(inp.sku));
      if (!item) throw new UnknownSkuError(inp.sku);
      const available = this.stock.get(this.key(inp.sku)) ?? 0;
      if (inp.qty > available) throw new InsufficientStockError(inp.sku, inp.qty, available);
    }

    const catalogForTenant = new Map<string, CatalogItem>();
    for (const inp of inputs) catalogForTenant.set(inp.sku, this.catalog.get(this.key(inp.sku))!);
    const lines = priceLines(catalogForTenant, inputs);

    for (const inp of inputs) {
      this.stock.set(this.key(inp.sku), (this.stock.get(this.key(inp.sku)) ?? 0) - inp.qty);
    }

    const t = totals(lines);
    const order: FieldOrder = {
      id: randomUUID(),
      tenantId,
      clientOrderId,
      outletId,
      currency,
      lines,
      ...t,
    };
    this.orders.set(`${tenantId}:${clientOrderId}`, order);
    return order;
  }
}
