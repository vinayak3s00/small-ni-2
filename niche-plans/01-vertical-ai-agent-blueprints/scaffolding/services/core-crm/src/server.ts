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
  Logger,
  AppError,
  toErrorResponse,
  requestIdFrom,
  readiness,
  type ReadinessCheck,
} from '@abetworks/core';
import { InMemoryRepo, SlotTakenError, type CrmRepository, type Vertical } from './repository';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';

export interface ServerDeps {
  repo?: CrmRepository;
  /** Readiness probe for the datastore (e.g. `SELECT 1`); ok=true when healthy. */
  dbPing?: ReadinessCheck;
}

export function buildServer(deps: ServerDeps = {}): FastifyInstance {
  const repo = deps.repo ?? new InMemoryRepo();
  const app = Fastify({ logger: false });
  const audit = new AuditLogger(new InMemoryAuditSink());
  const log = new Logger({ service: 'core-crm' });

  // Correlate every request: bind/propagate a request id and a child logger.
  app.addHook('onRequest', async (req: any, reply) => {
    const requestId = requestIdFrom(req.headers['x-request-id']);
    req.requestId = requestId;
    req.log = log.child({ requestId });
    reply.header('x-request-id', requestId);

    // Health/readiness endpoints are public (no auth).
    if (req.url === '/healthz' || req.url === '/readyz') return;

    try {
      req.principal = verifyToken(parseBearer(req.headers.authorization), JWT_SECRET);
    } catch (err) {
      const { statusCode, body } = toErrorResponse(AppError.unauthorized(), requestId);
      req.log.warn('auth failed', { detail: (err as Error).message });
      reply.code(statusCode).send(body);
    }
  });

  // Access log for every completed response.
  app.addHook('onResponse', async (req: any, reply) => {
    req.log?.info('request', {
      method: req.method,
      url: req.url,
      status: reply.statusCode,
      ms: Math.round(reply.elapsedTime ?? 0),
    });
  });

  const withCtx = <T>(req: any, fn: () => Promise<T>): Promise<T> =>
    runWithPrincipal(req.principal, fn);

  // Liveness: process is up.
  app.get('/healthz', async () => ({ status: 'ok' }));

  // Readiness: dependencies (DB) are reachable. 503 when degraded.
  app.get('/readyz', async (_req, reply) => {
    const report = await readiness({ db: deps.dbPing ?? (() => true) });
    return reply.code(report.status === 'ok' ? 200 : 503).send(report);
  });

  app.post('/v1/records', async (req: any, reply) => {
    const body = req.body ?? {};
    if (!body.vertical || !body.party?.name || !body.source) {
      throw AppError.badRequest('vertical, party.name and source are required');
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
      req.log.info('record created', { recordId: created.id, vertical: created.vertical });
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
      throw AppError.badRequest('recordId, resourceId, slotStart are required');
    }
    const booking = await withCtx(req, async () => {
      const b = await repo.book(recordId, resourceId, slotStart);
      await audit.record('write', 'booking', b.id);
      req.log.info('booking created', { bookingId: b.id, resourceId });
      return b;
    });
    return reply.code(201).send(booking);
  });

  // Central error handler: map SlotTakenError + AppError to consistent shapes.
  app.setErrorHandler((err, req: any, reply) => {
    const appErr = err instanceof SlotTakenError ? AppError.conflict('slot no longer available') : err;
    const { statusCode, body } = toErrorResponse(appErr, req.requestId);
    if (statusCode >= 500) req.log?.error('unhandled error', { detail: (err as Error).message });
    reply.code(statusCode).send(body);
  });

  return app;
}

/**
 * Choose the repository: Postgres when DATABASE_URL is set (production),
 * in-memory otherwise (local dev / tests). Returns a dbPing readiness check
 * bound to the live pool so /readyz reflects real database health.
 */
export async function resolveDeps(): Promise<ServerDeps> {
  if (!process.env.DATABASE_URL) return { repo: new InMemoryRepo() };
  const { createPool, migrate } = await import('./db');
  const { PgRepo } = await import('./pg-repository');
  const pool = createPool();
  await migrate(pool);
  const dbPing: ReadinessCheck = async () => {
    try {
      await pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  };
  return { repo: new PgRepo(pool), dbPing };
}

// Boot when run directly.
if (require.main === module) {
  resolveDeps()
    .then((deps) => {
      const app = buildServer(deps);
      const port = Number(process.env.PORT ?? 3001);
      return app.listen({ port, host: '0.0.0.0' }).then(() => {
        new Logger({ service: 'core-crm' }).info('listening', {
          port,
          store: process.env.DATABASE_URL ? 'postgres' : 'in-memory',
        });
      });
    })
    .catch((err) => {
      new Logger({ service: 'core-crm' }).error('failed to start', { detail: err.message });
      process.exit(1);
    });
}
