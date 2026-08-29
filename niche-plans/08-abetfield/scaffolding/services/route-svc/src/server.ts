/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { parseBearer, verifyToken, runWithPrincipal, getPrincipal, Logger, requireSecret, readiness } from '@abetworks/core';
import { RouteService, GeoCheckInError } from './routes';
import type { GeoPoint } from './geo';

const JWT_SECRET = requireSecret('JWT_SECRET', { devDefault: 'dev-secret-change-me' });

export function buildServer(svc = new RouteService()): FastifyInstance {
  const app = Fastify({ logger: false });

  app.addHook('onRequest', async (req: FastifyRequest, reply) => {
    if (req.url === '/healthz' || req.url === '/readyz') return;
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

  app.post<{ Body: { name?: string; location?: GeoPoint } }>('/v1/outlets', async (req, reply) =>
    runWithPrincipal(req.principal!, () => {
      const { name, location } = req.body ?? {};
      if (!name || !location?.lat || !location?.lng) {
        return reply.code(400).send({ error: 'name and location{lat,lng} required' });
      }
      return reply.code(201).send(svc.registerOutlet(name, location));
    }),
  );

  app.post<{ Body: { repId?: string; date?: string; outletIds?: string[] } }>(
    '/v1/beat-plans',
    async (req, reply) =>
      runWithPrincipal(req.principal!, () => {
        const { repId, date, outletIds } = req.body ?? {};
        if (!repId || !date || !Array.isArray(outletIds)) {
          return reply.code(400).send({ error: 'repId, date, outletIds[] required' });
        }
        return reply.code(201).send(svc.planBeat(repId, date, outletIds));
      }),
  );

  app.get<{ Querystring: { date?: string } }>('/v1/beat-plans/today', async (req, reply) =>
    runWithPrincipal(req.principal!, () => {
      const repId = getPrincipal().sub;
      const date = String(req.query?.date ?? new Date().toISOString().slice(0, 10));
      const plan = svc.beatFor(repId, date);
      return plan ? plan : reply.code(404).send({ error: 'no beat plan for date' });
    }),
  );

  app.post<{ Body: { outletId?: string; geo?: GeoPoint } }>('/v1/visits/check-in', async (req, reply) =>
    runWithPrincipal(req.principal!, () => {
      const { outletId, geo } = req.body ?? {};
      if (!outletId || !geo?.lat || !geo?.lng) {
        return reply.code(400).send({ error: 'outletId, geo{lat,lng} required' });
      }
      try {
        const result = svc.checkIn(outletId, geo);
        return reply.code(result.verified ? 201 : 403).send(result);
      } catch (err) {
        if (err instanceof GeoCheckInError) {
          return reply.code(404).send({ error: err.message });
        }
        throw err;
      }
    }),
  );

  return app;
}

if (require.main === module) {
  const app = buildServer();
  const port = Number(process.env.PORT ?? 3009);
  app.listen({ port, host: '0.0.0.0' }).then(() => {
    new Logger({ service: 'route-svc' }).info('listening', { port });
  });
}
