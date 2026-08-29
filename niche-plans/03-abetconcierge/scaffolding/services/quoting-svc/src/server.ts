/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { parseBearer, verifyToken, runWithPrincipal, getPrincipal, Logger, requireSecret } from '@abetworks/core';
import { buildQuote, UnknownSkuError, type CatalogItem, type QuoteLineInput } from './quoting';
import { InMemoryOptInStore, guardOutbound } from './optin';

const JWT_SECRET = requireSecret('JWT_SECRET', { devDefault: 'dev-secret-change-me' });

// Demo catalog (per-tenant in production). Prices in minor units (paise).
const DEMO_CATALOG = new Map<string, CatalogItem>([
  ['SKU-KURTA', { sku: 'SKU-KURTA', name: 'Cotton Kurta', priceMinor: 120000, gstRate: 0.05 }],
  ['SKU-PHONE', { sku: 'SKU-PHONE', name: 'Smartphone', priceMinor: 1500000, gstRate: 0.18 }],
]);

export function buildServer(
  catalog = DEMO_CATALOG,
  optIn = new InMemoryOptInStore(),
): FastifyInstance {
  const app = Fastify({ logger: false });

  app.addHook('onRequest', async (req: FastifyRequest, reply) => {
    if (req.url === '/healthz' || req.url === '/v1/webhooks/whatsapp') return;
    try {
      req.principal = verifyToken(parseBearer(req.headers.authorization), JWT_SECRET);
    } catch (err) {
      reply.code(401).send({ error: 'unauthorized', detail: (err as Error).message });
    }
  });

  app.get('/healthz', async () => ({ status: 'ok' }));

  // WhatsApp verification handshake / inbound (public webhook).
  app.post('/v1/webhooks/whatsapp', async () => ({ status: 'received' }));

  app.post<{ Body: { currency?: string; items?: QuoteLineInput[] } }>('/v1/quotes', async (req, reply) =>
    runWithPrincipal(req.principal!, () => {
      const { currency, items } = req.body ?? {};
      if (!currency || !Array.isArray(items)) {
        return reply.code(400).send({ error: 'currency and items[] are required' });
      }
      try {
        const quote = buildQuote(catalog, currency, items);
        return reply.code(201).send(quote);
      } catch (err) {
        if (err instanceof UnknownSkuError) {
          return reply.code(422).send({ error: err.message });
        }
        return reply.code(400).send({ error: (err as Error).message });
      }
    }),
  );

  // Outbound send guard: opt-in + template quality.
  app.post<{ Body: { partyId?: string; templateBody?: string } }>('/v1/outbound/guard', async (req, reply) =>
    runWithPrincipal(req.principal!, () => {
      const p = getPrincipal();
      const { partyId, templateBody } = req.body ?? {};
      if (!partyId || !templateBody) {
        return reply.code(400).send({ error: 'partyId and templateBody are required' });
      }
      const result = guardOutbound(optIn, p.tenantId, partyId, templateBody);
      return reply.code(result.allowed ? 200 : 403).send(result);
    }),
  );

  return app;
}

if (require.main === module) {
  const app = buildServer();
  const port = Number(process.env.PORT ?? 3003);
  app.listen({ port, host: '0.0.0.0' }).then(() => {
    new Logger({ service: 'quoting-svc' }).info('listening', { port });
  });
}
