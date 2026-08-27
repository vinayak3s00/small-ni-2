/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import Fastify, { FastifyInstance } from 'fastify';
import { parseBearer, verifyToken, runWithPrincipal } from '@abetworks/core';
import {
  InMemoryOrderStore,
  InsufficientStockError,
  UnknownSkuError,
  type OrderStore,
} from './orders';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';

export function buildServer(store: OrderStore = new InMemoryOrderStore()): FastifyInstance {
  const app = Fastify({ logger: false });

  app.addHook('onRequest', async (req: any, reply) => {
    if (req.url === '/healthz') return;
    try {
      req.principal = verifyToken(parseBearer(req.headers.authorization), JWT_SECRET);
    } catch (err) {
      reply.code(401).send({ error: 'unauthorized', detail: (err as Error).message });
    }
  });

  const withCtx = <T>(req: any, fn: () => Promise<T>): Promise<T> =>
    runWithPrincipal(req.principal, fn);

  app.get('/healthz', async () => ({ status: 'ok' }));

  // Seed / upsert a catalog item + its stock (admin/demo convenience).
  app.post('/v1/catalog', async (req: any, reply) => {
    const { sku, name, priceMinor, gstRate, stock } = req.body ?? {};
    if (!sku || !name || priceMinor == null) {
      return reply.code(400).send({ error: 'sku, name, priceMinor required' });
    }
    await withCtx(req, () =>
      store.setItem({ sku, name, priceMinor, gstRate: gstRate ?? 0 }, stock ?? 0),
    );
    return reply.code(204).send();
  });

  app.get('/v1/stock/:sku', async (req: any) =>
    withCtx(req, async () => ({ sku: req.params.sku, qty: await store.stockOf(req.params.sku) })),
  );

  app.post('/v1/orders', async (req: any, reply) => {
    const { clientOrderId, outletId, currency, lines } = req.body ?? {};
    if (!clientOrderId || !outletId || !currency || !Array.isArray(lines)) {
      return reply.code(400).send({ error: 'clientOrderId, outletId, currency, lines[] required' });
    }
    try {
      const order = await withCtx(req, () => store.place(clientOrderId, outletId, currency, lines));
      return reply.code(201).send(order);
    } catch (err) {
      if (err instanceof InsufficientStockError) return reply.code(409).send({ error: err.message });
      if (err instanceof UnknownSkuError) return reply.code(422).send({ error: err.message });
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  return app;
}

/** Postgres when DATABASE_URL is set (migrates on boot); in-memory otherwise. */
export async function resolveStore(): Promise<OrderStore> {
  if (!process.env.DATABASE_URL) return new InMemoryOrderStore();
  const { createPool, migrate } = await import('./db');
  const { PgOrderStore } = await import('./pg-orders');
  const pool = createPool();
  await migrate(pool);
  return new PgOrderStore(pool);
}

if (require.main === module) {
  resolveStore()
    .then((store) => {
      const app = buildServer(store);
      const port = Number(process.env.PORT ?? 3013);
      return app.listen({ port, host: '0.0.0.0' }).then(() => {
        // eslint-disable-next-line no-console
        console.log(`order-svc listening on :${port} (${process.env.DATABASE_URL ? 'postgres' : 'in-memory'})`);
      });
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('failed to start:', err.message);
      process.exit(1);
    });
}
