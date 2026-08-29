/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { parseBearer, verifyToken, runWithPrincipal, Logger, requireSecret, readiness } from '@abetworks/core';
import { CallService, InMemoryDnd, DndBlockedError, type DndRegistry } from './calls';

const JWT_SECRET = requireSecret('JWT_SECRET', { devDefault: 'dev-secret-change-me' });

export function buildServer(dnd: DndRegistry = new InMemoryDnd()): FastifyInstance {
  const app = Fastify({ logger: false });
  const calls = new CallService(dnd);

  app.addHook('onRequest', async (req: FastifyRequest, reply) => {
    if (req.url === '/healthz' || req.url === '/readyz' || req.url === '/v1/webhooks/telephony') return;
    try {
      req.principal = verifyToken(parseBearer(req.headers.authorization), JWT_SECRET);
    } catch (err) {
      reply.code(401).send({ error: 'unauthorized', detail: (err as Error).message });
    }
  });

  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/readyz', async (_req, reply) => {
    const report = await readiness({});
    return reply.code(report.status === 'ok' ? 200 : 503).send(report);
  });
  app.post('/v1/webhooks/telephony', async () => ({ status: 'received' }));

  app.post<{
    Body: { recordId?: string; toE164?: string; language?: string; purpose?: string };
  }>('/v1/calls/outbound', async (req, reply) =>
    runWithPrincipal(req.principal!, () => {
      const { recordId, toE164, language, purpose } = req.body ?? {};
      if (!recordId || !toE164 || !language || !purpose) {
        return reply
          .code(400)
          .send({ error: 'recordId, toE164, language, purpose are required' });
      }
      try {
        const call = calls.placeOutbound({ recordId, toE164, language, purpose });
        return reply.code(202).send(call);
      } catch (err) {
        if (err instanceof DndBlockedError) {
          return reply.code(403).send({ error: err.message });
        }
        throw err;
      }
    }),
  );

  app.post<{
    Params: { id: string };
    Body: { transcript?: string; intents?: string[]; citations?: string[] };
  }>('/v1/calls/:id/complete', async (req, reply) =>
    runWithPrincipal(req.principal!, () => {
      const { transcript, intents, citations } = req.body ?? {};
      try {
        const summary = calls.complete(
          req.params.id,
          transcript ?? '',
          intents ?? [],
          citations ?? [],
        );
        return reply.code(200).send(summary);
      } catch {
        return reply.code(404).send({ error: 'call not found' });
      }
    }),
  );

  app.get<{ Params: { id: string } }>('/v1/calls/:id/summary', async (req, reply) =>
    runWithPrincipal(req.principal!, () => {
      const summary = calls.getSummary(req.params.id);
      return summary
        ? reply.send(summary)
        : reply.code(404).send({ error: 'summary not found' });
    }),
  );

  return app;
}

if (require.main === module) {
  const app = buildServer();
  const port = Number(process.env.PORT ?? 3004);
  app.listen({ port, host: '0.0.0.0' }).then(() => {
    new Logger({ service: 'telephony-svc' }).info('listening', { port });
  });
}
