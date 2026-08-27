/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import Fastify, { FastifyInstance } from 'fastify';
import { parseBearer, verifyToken, runWithPrincipal } from '@abetworks/core';
import { OrderService, InsufficientStockError, UnknownSkuError } from './orders';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';

export function buildServer(svc?: OrderService): FastifyInstance {
  const app = Fastify({ logger: false });
  const orders = svc ?? new OrderService();

  app.addHook('onRequest', async (req: any, reply) => {
    if (req.url === '/healthz') return;
    try {
      req.principal = verifyToken(parseBearer(req.headers.authorization), JWT_SECRET);
    } catch (err) {
      reply.code(401).send({ error: 'unauthorized', detail: (err as Error).message });
    }
  });

  app.get('/healthz', async () => ({ status: 'ok' }));

  app.post('/v1/orders', async (req: any, reply) =>
    runWithPrincipal(req.principal, () => {
      const { clientOrderId, outletId, currency, lines } = req.body ?? {};
      if (!clientOrderId || !outletId || !currency || !Array.isArray(lines)) {
        return reply
          .code(400)
          .send({ error: 'clientOrderId, outletId, currency, lines[] required' });
      }
      try {
        return reply.code(201).send(orders.place(clientOrderId, outletId, currency, lines));
      } catch (err) {
        if (err instanceof InsufficientStockError) {
          return reply.code(409).send({ error: err.message });
        }
        if (err instanceof UnknownSkuError) {
          return reply.code(422).send({ error: err.message });
        }
        return reply.code(400).send({ error: (err as Error).message });
      }
    }),
  );

  return app;
}

if (require.main === module) {
  const app = buildServer();
  const port = Number(process.env.PORT ?? 3013);
  app.listen({ port, host: '0.0.0.0' }).then(() => {
    // eslint-disable-next-line no-console
    console.log(`order-svc listening on :${port}`);
  });
}
