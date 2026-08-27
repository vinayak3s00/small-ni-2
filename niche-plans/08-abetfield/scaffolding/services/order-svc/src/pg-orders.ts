/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { Pool, type PoolClient } from 'pg';
import { withTenantScope, type QueryRunner } from '@abetworks/core';
import {
  InsufficientStockError,
  UnknownSkuError,
  priceLines,
  totals,
  type CatalogItem,
  type FieldOrder,
  type OrderLineInput,
  type OrderStore,
} from './orders';

function asRunner(client: PoolClient): QueryRunner {
  return { query: (sql, params) => client.query(sql, params as any[]) };
}

/**
 * PostgreSQL-backed order store. The critical guarantee — no overselling under
 * concurrency — is enforced by the atomic conditional UPDATE:
 *
 *   UPDATE stock_position SET qty = qty - $qty
 *   WHERE sku = $sku AND qty >= $qty RETURNING qty
 *
 * If it affects no row, stock was insufficient; the whole transaction rolls
 * back (all-or-nothing). Idempotency comes from UNIQUE(tenant, client_order_id).
 */
export class PgOrderStore implements OrderStore {
  constructor(private readonly pool: Pool) {}

  private async tx<T>(fn: (tx: QueryRunner) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      return await withTenantScope(asRunner(client), fn);
    } finally {
      client.release();
    }
  }

  async setItem(item: CatalogItem, stock: number): Promise<void> {
    await this.tx(async (tx) => {
      await tx.query(
        `INSERT INTO catalog_item (tenant_id, sku, name, price_minor, gst_rate)
         VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4)
         ON CONFLICT (tenant_id, sku) DO UPDATE SET name = EXCLUDED.name,
           price_minor = EXCLUDED.price_minor, gst_rate = EXCLUDED.gst_rate`,
        [item.sku, item.name, item.priceMinor, item.gstRate],
      );
      await tx.query(
        `INSERT INTO stock_position (tenant_id, sku, qty)
         VALUES (current_setting('app.tenant_id')::uuid, $1, $2)
         ON CONFLICT (tenant_id, sku) DO UPDATE SET qty = EXCLUDED.qty`,
        [item.sku, stock],
      );
    });
  }

  async stockOf(sku: string): Promise<number> {
    return this.tx(async (tx) => {
      const { rows } = await tx.query('SELECT qty FROM stock_position WHERE sku = $1', [sku]);
      return rows[0]?.qty ?? 0;
    });
  }

  async place(
    clientOrderId: string,
    outletId: string,
    currency: string,
    inputs: OrderLineInput[],
  ): Promise<FieldOrder> {
    if (!inputs.length) throw new Error('order requires at least one line');
    for (const inp of inputs) if (inp.qty <= 0) throw new Error(`qty must be positive for ${inp.sku}`);

    return this.tx(async (tx) => {
      // Idempotent replay: return the existing order if this client_order_id was seen.
      const prior = await tx.query(
        'SELECT id FROM field_order WHERE client_order_id = $1',
        [clientOrderId],
      );
      if (prior.rows[0]) return this.hydrate(tx, prior.rows[0].id);

      // Load catalog for the requested SKUs.
      const skus = inputs.map((i) => i.sku);
      const cat = await tx.query('SELECT sku, name, price_minor, gst_rate FROM catalog_item WHERE sku = ANY($1)', [skus]);
      const catalog = new Map<string, CatalogItem>();
      for (const r of cat.rows) {
        catalog.set(r.sku, { sku: r.sku, name: r.name, priceMinor: Number(r.price_minor), gstRate: Number(r.gst_rate) });
      }
      for (const inp of inputs) if (!catalog.has(inp.sku)) throw new UnknownSkuError(inp.sku);

      // Atomic stock allocation — conditional decrement per line.
      for (const inp of inputs) {
        const dec = await tx.query(
          `UPDATE stock_position SET qty = qty - $2
           WHERE sku = $1 AND qty >= $2 RETURNING qty`,
          [inp.sku, inp.qty],
        );
        if (!dec.rows[0]) {
          const cur = await tx.query('SELECT qty FROM stock_position WHERE sku = $1', [inp.sku]);
          throw new InsufficientStockError(inp.sku, inp.qty, cur.rows[0]?.qty ?? 0);
        }
      }

      const lines = priceLines(catalog, inputs);
      const t = totals(lines);
      const inserted = await tx.query(
        `INSERT INTO field_order (tenant_id, client_order_id, outlet_id, currency, subtotal_minor, gst_minor, total_minor)
         VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [clientOrderId, outletId, currency, t.subtotalMinor, t.gstMinor, t.totalMinor],
      );
      const orderId = inserted.rows[0].id;
      for (const l of lines) {
        await tx.query(
          `INSERT INTO field_order_line
             (tenant_id, order_id, sku, name, qty, unit_price_minor, line_subtotal_minor, gst_rate, line_gst_minor, line_total_minor)
           VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [orderId, l.sku, l.name, l.qty, l.unitPriceMinor, l.lineSubtotalMinor, l.gstRate, l.lineGstMinor, l.lineTotalMinor],
        );
      }
      return this.hydrate(tx, orderId);
    });
  }

  private async hydrate(tx: QueryRunner, orderId: string): Promise<FieldOrder> {
    const { rows } = await tx.query('SELECT * FROM field_order WHERE id = $1', [orderId]);
    const o = rows[0];
    const { rows: lines } = await tx.query(
      'SELECT * FROM field_order_line WHERE order_id = $1 ORDER BY id',
      [orderId],
    );
    return {
      id: o.id,
      tenantId: o.tenant_id,
      clientOrderId: o.client_order_id,
      outletId: o.outlet_id,
      currency: o.currency,
      subtotalMinor: Number(o.subtotal_minor),
      gstMinor: Number(o.gst_minor),
      totalMinor: Number(o.total_minor),
      lines: lines.map((l: any) => ({
        sku: l.sku,
        name: l.name,
        qty: l.qty,
        unitPriceMinor: Number(l.unit_price_minor),
        lineSubtotalMinor: Number(l.line_subtotal_minor),
        gstRate: Number(l.gst_rate),
        lineGstMinor: Number(l.line_gst_minor),
        lineTotalMinor: Number(l.line_total_minor),
      })),
    };
  }
}
