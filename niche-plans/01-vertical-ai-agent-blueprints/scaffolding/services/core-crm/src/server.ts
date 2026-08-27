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
  AuditLogger,
  InMemoryAuditSink,
} from '@abetworks/core';
import { InMemoryRepo, SlotTakenError, type CrmRepository, type Vertical } from './repository';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';

export function buildServer(repo: CrmRepository = new InMemoryRepo()): FastifyInstance {
  const app = Fastify({ logger: false });
  const audit = new AuditLogger(new InMemoryAuditSink());

  // Auth + tenant-context hook: every request runs inside runWithPrincipal.
  app.addHook('onRequest', async (req, reply) => {
    if (req.url === '/healthz') return;
    try {
      const token = parseBearer(req.headers.authorization);
      const principal = verifyToken(token, JWT_SECRET);
      (req as any).principal = principal;
    } catch (err) {
      reply.code(401).send({ error: 'unauthorized', detail: (err as Error).message });
    }
  });

  const withCtx = <T>(req: any, fn: () => Promise<T>): Promise<T> =>
    runWithPrincipal(req.principal, fn);

  app.get('/healthz', async () => ({ status: 'ok' }));

  app.post('/v1/records', async (req: any, reply) => {
    const body = req.body ?? {};
    if (!body.vertical || !body.party?.name || !body.source) {
      return reply.code(400).send({ error: 'vertical, party.name and source are required' });
    }
    const row = await withCtx(req, async () => {
      const created = await repo.createRecord({
        vertical: body.vertical as Vertical,
        source: body.source,
        party: {
          name: body.party.name,
          phones: body.party.phones ?? [],
          languages: body.party.languages ?? [],
        },
      });
      await audit.record('write', 'record', created.id);
      return created;
    });
    return reply.code(201).send(row);
  });

  app.get('/v1/records', async (req: any) => {
    const minScore = req.query?.minScore ? Number(req.query.minScore) : undefined;
    return withCtx(req, () => repo.listRecords({ minScore }));
  });

  app.post('/v1/bookings', async (req: any, reply) => {
    const { recordId, resourceId, slotStart } = req.body ?? {};
    if (!recordId || !resourceId || !slotStart) {
      return reply.code(400).send({ error: 'recordId, resourceId, slotStart are required' });
    }
    try {
      const booking = await withCtx(req, async () => {
        const b = await repo.book(recordId, resourceId, slotStart);
        await audit.record('write', 'booking', b.id);
        return b;
      });
      return reply.code(201).send(booking);
    } catch (err) {
      if (err instanceof SlotTakenError) {
        return reply.code(409).send({ error: 'slot no longer available' });
      }
      throw err;
    }
  });

  return app;
}

/**
 * Choose the repository: Postgres when DATABASE_URL is set (production),
 * in-memory otherwise (local dev / tests). Kept in a lazy factory so the
 * `pg` module is only loaded when actually needed.
 */
export async function resolveRepo(): Promise<CrmRepository> {
  if (!process.env.DATABASE_URL) return new InMemoryRepo();
  const { createPool, migrate } = await import('./db');
  const { PgRepo } = await import('./pg-repository');
  const pool = createPool();
  await migrate(pool);
  return new PgRepo(pool);
}

// Boot when run directly.
if (require.main === module) {
  resolveRepo()
    .then((repo) => {
      const app = buildServer(repo);
      const port = Number(process.env.PORT ?? 3001);
      return app.listen({ port, host: '0.0.0.0' }).then(() => {
        // eslint-disable-next-line no-console
        console.log(
          `core-crm listening on :${port} (${process.env.DATABASE_URL ? 'postgres' : 'in-memory'})`,
        );
      });
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('failed to start:', err.message);
      process.exit(1);
    });
}
