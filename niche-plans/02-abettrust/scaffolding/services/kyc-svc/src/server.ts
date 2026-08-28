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
  Logger,
  AppError,
  toErrorResponse,
  requestIdFrom,
  readiness,
  MeterEmitter,
  type ReadinessCheck,
  type MeterSink,
} from '@abetworks/core';
import {
  InMemoryKycStore,
  InvalidKycTransition,
  KycNotFound,
  type KycStatus,
  type KycStore,
} from './kyc';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';

export interface ServerDeps {
  store?: KycStore;
  /** Readiness probe for the datastore (e.g. `SELECT 1`); ok=true when healthy. */
  dbPing?: ReadinessCheck;
  /** Optional meter sink (tests inject in-memory; prod uses default log/Kafka sink). */
  meterSink?: MeterSink;
}

export function buildServer(deps: ServerDeps = {}): FastifyInstance {
  const store = deps.store ?? new InMemoryKycStore();
  const app = Fastify({ logger: false });
  const log = new Logger({ service: 'kyc-svc' });
  const meter = new MeterEmitter({ service: 'kyc-svc', sink: deps.meterSink });

  // Correlate every request: bind/propagate a request id + child logger.
  app.addHook('onRequest', async (req: any, reply) => {
    const requestId = requestIdFrom(req.headers['x-request-id']);
    req.requestId = requestId;
    req.log = log.child({ requestId });
    reply.header('x-request-id', requestId);

    if (req.url === '/healthz' || req.url === '/readyz') return;

    try {
      req.principal = verifyToken(parseBearer(req.headers.authorization), JWT_SECRET);
    } catch (err) {
      const { statusCode, body } = toErrorResponse(AppError.unauthorized(), requestId);
      req.log.warn('auth failed', { detail: (err as Error).message });
      reply.code(statusCode).send(body);
    }
  });

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

  app.get('/healthz', async () => ({ status: 'ok' }));

  app.get('/readyz', async (_req, reply) => {
    const report = await readiness({ db: deps.dbPing ?? (() => true) });
    return reply.code(report.status === 'ok' ? 200 : 503).send(report);
  });

  app.post('/v1/kyc', async (req: any, reply) => {
    const { partyId, documents } = req.body ?? {};
    if (!partyId) throw AppError.badRequest('partyId required');
    const rec = await withCtx(req, async () => {
      const created = await store.create(partyId, documents ?? []);
      // Billable usage: a KYC workflow is an AI/compliance action. eventId = kyc id.
      meter.count('ai_actions', { eventId: created.id, source: 'kyc' });
      return created;
    });
    req.log.info('kyc created', { kycId: rec.id, partyId });
    return reply.code(201).send(rec);
  });

  app.post('/v1/kyc/:id/transition', async (req: any) => {
    const to = req.body?.to as KycStatus;
    const rec = await withCtx(req, () => store.transition(req.params.id, to));
    req.log.info('kyc transition', { kycId: req.params.id, to });
    return rec;
  });

  app.post('/v1/kyc/:id/disclosures', async (req: any) => {
    const { disclosure } = req.body ?? {};
    if (!disclosure) throw AppError.badRequest('disclosure required');
    const rec = await withCtx(req, () => store.addDisclosure(req.params.id, disclosure));
    req.log.info('kyc disclosure added', { kycId: req.params.id });
    return rec;
  });

  app.get('/v1/kyc/:id/suitability', async (req: any) =>
    withCtx(req, async () => ({ complete: await store.isSuitabilityComplete(req.params.id) })),
  );

  app.get('/v1/kyc/:id', async (req: any) => {
    const rec = await withCtx(req, () => store.get(req.params.id));
    if (!rec) throw AppError.notFound();
    return rec;
  });

  // Central error handler: map domain errors to consistent AppError shapes.
  app.setErrorHandler((err, req: any, reply) => {
    let appErr: unknown = err;
    if (err instanceof InvalidKycTransition) appErr = AppError.conflict(err.message);
    else if (err instanceof KycNotFound) appErr = AppError.notFound(err.message);
    const { statusCode, body } = toErrorResponse(appErr, req.requestId);
    if (statusCode >= 500) req.log?.error('unhandled error', { detail: (err as Error).message });
    reply.code(statusCode).send(body);
  });

  return app;
}

/** Postgres when DATABASE_URL is set (migrates on boot); in-memory otherwise. */
export async function resolveDeps(): Promise<ServerDeps> {
  if (!process.env.DATABASE_URL) return { store: new InMemoryKycStore() };
  const { createPool, migrate } = await import('./db');
  const { PgKycStore } = await import('./pg-kyc');
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
  return { store: new PgKycStore(pool), dbPing };
}

if (require.main === module) {
  resolveDeps()
    .then((deps) => {
      const app = buildServer(deps);
      const port = Number(process.env.PORT ?? 3007);
      return app.listen({ port, host: '0.0.0.0' }).then(() => {
        new Logger({ service: 'kyc-svc' }).info('listening', {
          port,
          store: process.env.DATABASE_URL ? 'postgres' : 'in-memory',
        });
      });
    })
    .catch((err) => {
      new Logger({ service: 'kyc-svc' }).error('failed to start', { detail: err.message });
      process.exit(1);
    });
}
