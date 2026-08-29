/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { parseBearer, verifyToken, runWithPrincipal, Logger, requireSecret, readiness } from '@abetworks/core';
import { ReportingService, AccessDeniedError, type Branding, type WorkspaceGrant } from './reporting';

const JWT_SECRET = requireSecret('JWT_SECRET', { devDefault: 'dev-secret-change-me' });

// Demo branding + grants (per-partner in production, loaded from partner-admin-svc).
const DEMO_BRANDING: Branding = {
  brandName: 'GrowthPartners',
  primaryColor: '#0A66C2',
  logoUrl: 'https://cdn.growthpartners.example/logo.png',
};
const DEMO_GRANTS: WorkspaceGrant[] = [{ workspaceId: 'ws-1', scopes: ['reports:read'] }];

export function buildServer(
  svc = new ReportingService(DEMO_BRANDING, DEMO_GRANTS),
): FastifyInstance {
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

  app.post<{ Body: { workspaceId?: string; title?: string; metrics?: Record<string, number> } }>(
    '/v1/reports',
    async (req, reply) =>
      runWithPrincipal(req.principal!, () => {
        const { workspaceId, title, metrics } = req.body ?? {};
      if (!workspaceId || !title) {
        return reply.code(400).send({ error: 'workspaceId and title required' });
      }
      try {
        return reply.code(201).send(svc.generate({ workspaceId, title, metrics: metrics ?? {} }));
      } catch (err) {
        if (err instanceof AccessDeniedError) {
          return reply.code(403).send({ error: err.message });
        }
        throw err;
      }
    }),
  );

  return app;
}

if (require.main === module) {
  const app = buildServer();
  const port = Number(process.env.PORT ?? 3010);
  app.listen({ port, host: '0.0.0.0' }).then(() => {
    new Logger({ service: 'reporting-svc' }).info('listening', { port });
  });
}
