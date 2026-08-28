/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import Fastify, { FastifyInstance } from 'fastify';
import { parseBearer, verifyToken, runWithPrincipal, Logger } from '@abetworks/core';
import { ReportingService, AccessDeniedError, type Branding, type WorkspaceGrant } from './reporting';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';

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

  app.addHook('onRequest', async (req: any, reply) => {
    if (req.url === '/healthz') return;
    try {
      req.principal = verifyToken(parseBearer(req.headers.authorization), JWT_SECRET);
    } catch (err) {
      reply.code(401).send({ error: 'unauthorized', detail: (err as Error).message });
    }
  });

  app.get('/healthz', async () => ({ status: 'ok' }));

  app.post('/v1/reports', async (req: any, reply) =>
    runWithPrincipal(req.principal, () => {
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
