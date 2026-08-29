/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
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
  MeterEmitter,
  type ReadinessCheck,
  type MeterSink,
  requireSecret,
} from '@abetworks/core';
import { InMemoryRepo, SlotTakenError, type CrmRepository, type Vertical } from './repository';

const JWT_SECRET = requireSecret('JWT_SECRET', { devDefault: 'dev-secret-change-me' });

// The onRequest hook replaces Fastify's built-in `request.log` (Pino) with a
// platform `Logger` child. Fastify owns the `log` decoration type, so we read
// and write it through this narrowly-cast accessor instead of `any`.
type RequestLog = { log: Logger };
const reqLog = (req: FastifyRequest): Logger => (req as unknown as RequestLog).log;

export interface ServerDeps {
  repo?: CrmRepository;
  /** Readiness probe for the datastore (e.g. `SELECT 1`); ok=true when healthy. */
  dbPing?: ReadinessCheck;
  /** Optional meter sink (tests inject an in-memory sink; prod uses the default log/Kafka sink). */
  meterSink?: MeterSink;
}

export function buildServer(deps: ServerDeps = {}): FastifyInstance {
  const repo = deps.repo ?? new InMemoryRepo();
  const app = Fastify({ logger: false });
  const audit = new AuditLogger(new InMemoryAuditSink());
  const log = new Logger({ service: 'core-crm' });
  const meter = new MeterEmitter({ service: 'core-crm', sink: deps.meterSink });

  // Correlate every request: bind/propagate a request id and a child logger.
  app.addHook('onRequest', async (req: FastifyRequest, reply) => {
    const requestId = requestIdFrom(req.headers['x-request-id']);
    req.requestId = requestId;
    (req as unknown as RequestLog).log = log.child({ requestId });
    reply.header('x-request-id', requestId);

    // Health/readiness endpoints are public (no auth).
    if (req.url === '/healthz' || req.url === '/readyz') return;

    try {
      req.principal = verifyToken(parseBearer(req.headers.authorization), JWT_SECRET);
    } catch (err) {
      const { statusCode, body } = toErrorResponse(AppError.unauthorized(), requestId);
      reqLog(req).warn('auth failed', { detail: (err as Error).message });
      reply.code(statusCode).send(body);
    }
  });

  // Access log for every completed response.
  app.addHook('onResponse', async (req: FastifyRequest, reply) => {
    reqLog(req)?.info('request', {
      method: req.method,
      url: req.url,
      status: reply.statusCode,
      ms: Math.round(reply.elapsedTime ?? 0),
    });
  });

  const withCtx = <T>(req: FastifyRequest, fn: () => Promise<T>): Promise<T> =>
    runWithPrincipal(req.principal!, fn);

  // Liveness: process is up.
  app.get('/healthz', async () => ({ status: 'ok' }));

  // Readiness: dependencies (DB) are reachable. 503 when degraded.
  app.get('/readyz', async (_req, reply) => {
    const report = await readiness({ db: deps.dbPing ?? (() => true) });
    return reply.code(report.status === 'ok' ? 200 : 503).send(report);
  });

  app.post<{
    Body: {
      vertical?: Vertical;
      source?: string;
      party?: { name?: string; phones?: string[]; languages?: string[] };
    };
  }>('/v1/records', async (req, reply) => {
    const body = req.body ?? {};
    if (!body.vertical || !body.party?.name || !body.source) {
      throw AppError.badRequest('vertical, party.name and source are required');
    }
    const newRecord = {
      vertical: body.vertical,
      source: body.source,
      party: {
        name: body.party.name,
        phones: body.party.phones ?? [],
        languages: body.party.languages ?? [],
      },
    };
    const row = await withCtx(req, async () => {
      const created = await repo.createRecord(newRecord);
      await audit.record('write', 'record', created.id);
      // Billable usage: one record created. eventId = record id => idempotent.
      meter.count('records', { eventId: created.id, source: 'record' });
      reqLog(req).info('record created', { recordId: created.id, vertical: created.vertical });
      return created;
    });
    return reply.code(201).send(row);
  });

  app.get<{ Querystring: { minScore?: string } }>('/v1/records', async (req) => {
    const minScore = req.query?.minScore ? Number(req.query.minScore) : undefined;
    return withCtx(req, () => repo.listRecords({ minScore }));
  });

  app.post<{ Body: { recordId?: string; resourceId?: string; slotStart?: string } }>(
    '/v1/bookings',
    async (req, reply) => {
    const { recordId, resourceId, slotStart } = req.body ?? {};
    if (!recordId || !resourceId || !slotStart) {
      throw AppError.badRequest('recordId, resourceId, slotStart are required');
    }
    const booking = await withCtx(req, async () => {
      const b = await repo.book(recordId, resourceId, slotStart);
      await audit.record('write', 'booking', b.id);
      reqLog(req).info('booking created', { bookingId: b.id, resourceId });
      return b;
    });
    return reply.code(201).send(booking);
  });

  // Central error handler: map SlotTakenError + AppError to consistent shapes.
  app.setErrorHandler((err, req, reply) => {
    const appErr = err instanceof SlotTakenError ? AppError.conflict('slot no longer available') : err;
    const { statusCode, body } = toErrorResponse(appErr, req.requestId);
    if (statusCode >= 500) reqLog(req)?.error('unhandled error', { detail: (err as Error).message });
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
