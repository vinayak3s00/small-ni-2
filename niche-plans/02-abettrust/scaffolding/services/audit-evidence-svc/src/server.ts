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
import { AuditChain, type AuditStore } from './evidence';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';

export function buildServer(store: AuditStore = new AuditChain()): FastifyInstance {
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

  // Ingest an audit event (append-only, hash-chained, durable).
  app.post('/v1/audit/events', async (req: any, reply) => {
    const body = req.body ?? {};
    const chained = await withCtx(req, () => {
      const p = getPrincipal();
      const event: AuditEvent = {
        tenantId: p.tenantId,
        actor: p.sub,
        action: body.action ?? 'read',
        entity: body.entity ?? 'unknown',
        entityId: body.entityId ?? 'unknown',
        fields: body.fields,
        at: new Date().toISOString(),
      };
      return store.append(event);
    });
    return reply.code(201).send(chained);
  });

  // Query audit events — compliance role only.
  app.get('/v1/audit/events', async (req: any, reply) =>
    withCtx(req, async () => {
      if (!hasRole('compliance_officer')) {
        return reply.code(403).send({ error: 'compliance_officer role required' });
      }
      const q = req.query ?? {};
      return store.query({ from: q.from, to: q.to, action: q.action });
    }),
  );

  // Generate an auditor evidence pack — compliance role only.
  app.post('/v1/evidence/packs', async (req: any, reply) =>
    withCtx(req, async () => {
      if (!hasRole('compliance_officer')) {
        return reply.code(403).send({ error: 'compliance_officer role required' });
      }
      const { period, from, to } = req.body ?? {};
      if (!period) return reply.code(400).send({ error: 'period is required' });
      const pack = await store.generatePack(
        period,
        from ?? '2000-01-01T00:00:00Z',
        to ?? '2100-01-01T00:00:00Z',
      );
      return reply.code(201).send(pack);
    }),
  );

  // Integrity endpoint: verify the chain has not been tampered with.
  app.get('/v1/audit/verify', async (req: any) =>
    withCtx(req, async () => ({ intact: await store.verify() })),
  );

  return app;
}

/** Postgres WORM store when DATABASE_URL is set (migrates on boot); in-memory otherwise. */
export async function resolveStore(): Promise<AuditStore> {
  if (!process.env.DATABASE_URL) return new AuditChain();
  const { createPool, migrate } = await import('./db');
  const { PgAuditStore } = await import('./pg-evidence');
  const pool = createPool();
  await migrate(pool);
  return new PgAuditStore(pool);
}

if (require.main === module) {
  resolveStore()
    .then((store) => {
      const app = buildServer(store);
      const port = Number(process.env.PORT ?? 3002);
      return app.listen({ port, host: '0.0.0.0' }).then(() => {
        // eslint-disable-next-line no-console
        console.log(`audit-evidence-svc listening on :${port} (${process.env.DATABASE_URL ? 'postgres' : 'in-memory'})`);
      });
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('failed to start:', err.message);
      process.exit(1);
    });
}
