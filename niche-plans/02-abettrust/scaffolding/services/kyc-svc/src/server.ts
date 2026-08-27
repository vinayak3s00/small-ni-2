/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import Fastify, { FastifyInstance } from 'fastify';
import { parseBearer, verifyToken, runWithPrincipal } from '@abetworks/core';
import { KycService, InvalidKycTransition, type KycStatus } from './kyc';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';

export function buildServer(svc = new KycService()): FastifyInstance {
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

  app.post('/v1/kyc', async (req: any, reply) =>
    runWithPrincipal(req.principal, () => {
      const { partyId, documents } = req.body ?? {};
      if (!partyId) return reply.code(400).send({ error: 'partyId required' });
      return reply.code(201).send(svc.create(partyId, documents ?? []));
    }),
  );

  app.post('/v1/kyc/:id/transition', async (req: any, reply) =>
    runWithPrincipal(req.principal, () => {
      const to = req.body?.to as KycStatus;
      try {
        return svc.transition(req.params.id, to);
      } catch (err) {
        if (err instanceof InvalidKycTransition) {
          return reply.code(409).send({ error: err.message });
        }
        return reply.code(404).send({ error: (err as Error).message });
      }
    }),
  );

  app.post('/v1/kyc/:id/disclosures', async (req: any, reply) =>
    runWithPrincipal(req.principal, () => {
      const { disclosure } = req.body ?? {};
      if (!disclosure) return reply.code(400).send({ error: 'disclosure required' });
      try {
        return svc.addDisclosure(req.params.id, disclosure);
      } catch (err) {
        return reply.code(404).send({ error: (err as Error).message });
      }
    }),
  );

  app.get('/v1/kyc/:id/suitability', async (req: any, reply) =>
    runWithPrincipal(req.principal, () => ({
      complete: svc.isSuitabilityComplete(req.params.id),
    })),
  );

  return app;
}

if (require.main === module) {
  const app = buildServer();
  const port = Number(process.env.PORT ?? 3007);
  app.listen({ port, host: '0.0.0.0' }).then(() => {
    // eslint-disable-next-line no-console
    console.log(`kyc-svc listening on :${port}`);
  });
}
