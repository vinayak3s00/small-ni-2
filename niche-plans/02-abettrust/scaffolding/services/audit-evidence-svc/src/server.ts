/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import Fastify, { FastifyInstance } from 'fastify';
import {
  parseBearer,
  verifyToken,
  runWithPrincipal,
  getPrincipal,
  hasRole,
  type AuditEvent,
} from '@abetworks/core';
import { AuditChain } from './evidence';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';

export function buildServer(chain = new AuditChain()): FastifyInstance {
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

  // Ingest an audit event (append-only, hash-chained).
  app.post('/v1/audit/events', async (req: any, reply) =>
    runWithPrincipal(req.principal, () => {
      const p = getPrincipal();
      const body = req.body ?? {};
      const event: AuditEvent = {
        tenantId: p.tenantId,
        actor: p.sub,
        action: body.action ?? 'read',
        entity: body.entity ?? 'unknown',
        entityId: body.entityId ?? 'unknown',
        fields: body.fields,
        at: new Date().toISOString(),
      };
      return reply.code(201).send(chain.append(event));
    }),
  );

  // Query audit events — compliance role only.
  app.get('/v1/audit/events', async (req: any, reply) =>
    runWithPrincipal(req.principal, () => {
      if (!hasRole('compliance_officer')) {
        return reply.code(403).send({ error: 'compliance_officer role required' });
      }
      const q = req.query ?? {};
      return chain.query({ from: q.from, to: q.to, action: q.action });
    }),
  );

  // Generate an auditor evidence pack.
  app.post('/v1/evidence/packs', async (req: any, reply) =>
    runWithPrincipal(req.principal, () => {
      if (!hasRole('compliance_officer')) {
        return reply.code(403).send({ error: 'compliance_officer role required' });
      }
      const { period, from, to } = req.body ?? {};
      if (!period) return reply.code(400).send({ error: 'period is required' });
      return reply.code(201).send(
        chain.generatePack(
          period,
          from ?? '2000-01-01T00:00:00Z',
          to ?? '2100-01-01T00:00:00Z',
        ),
      );
    }),
  );

  // Integrity endpoint: verify the chain has not been tampered with.
  app.get('/v1/audit/verify', async (req: any) =>
    runWithPrincipal(req.principal, () => ({ intact: chain.verify() })),
  );

  return app;
}

if (require.main === module) {
  const app = buildServer();
  const port = Number(process.env.PORT ?? 3002);
  app.listen({ port, host: '0.0.0.0' }).then(() => {
    // eslint-disable-next-line no-console
    console.log(`audit-evidence-svc listening on :${port}`);
  });
}
