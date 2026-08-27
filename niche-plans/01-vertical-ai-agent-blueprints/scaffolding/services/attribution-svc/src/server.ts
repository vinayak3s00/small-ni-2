/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import Fastify, { FastifyInstance } from 'fastify';
import { parseBearer, verifyToken, runWithPrincipal } from '@abetworks/core';
import { AttributionLedger, type AttributionModel } from './attribution';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';

export function buildServer(ledger = new AttributionLedger()): FastifyInstance {
  const app = Fastify({ logger: false });

  app.addHook('onRequest', async (req: any, reply) => {
    if (req.url === '/healthz') return;
    try {
      req.principal = verifyToken(parseBearer(req.headers.authorization), JWT_SECRET);
    } catch (err) {
      reply.code(401).send({ error: 'unauthorized', detail: (err as Error).message });
    }
  });

  app.get('/healthz', async () => ({ status: 'ok' }));

  app.post('/v1/attribution/events', async (req: any, reply) =>
    runWithPrincipal(req.principal, () => {
      const { recordId, source, campaign, partnerCode, occurredAt } = req.body ?? {};
      if (!recordId || !source) {
        return reply.code(400).send({ error: 'recordId and source are required' });
      }
      return reply
        .code(201)
        .send(ledger.record({ recordId, source, campaign, partnerCode, occurredAt }));
    }),
  );

  app.get('/v1/attribution/:recordId', async (req: any) =>
    runWithPrincipal(req.principal, () => {
      const model = (req.query?.model as AttributionModel) ?? 'last_touch';
      return {
        touches: ledger.touches(req.params.recordId),
        shares: ledger.attribute(req.params.recordId, model),
      };
    }),
  );

  return app;
}

if (require.main === module) {
  const app = buildServer();
  const port = Number(process.env.PORT ?? 3011);
  app.listen({ port, host: '0.0.0.0' }).then(() => {
    // eslint-disable-next-line no-console
    console.log(`attribution-svc listening on :${port}`);
  });
}
