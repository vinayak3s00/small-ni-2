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
  Logger,
  AppError,
  toErrorResponse,
  requestIdFrom,
  readiness,
  MeterEmitter,
  type AuditEvent,
  type ReadinessCheck,
  type MeterSink,
} from '@abetworks/core';
import { AuditChain, type AuditStore } from './evidence';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';

export interface ServerDeps {
  store?: AuditStore;
  /** Readiness probe for the datastore (e.g. `SELECT 1`); ok=true when healthy. */
  dbPing?: ReadinessCheck;
  /** Optional meter sink (tests inject in-memory; prod uses default log/Kafka sink). */
  meterSink?: MeterSink;
}

export function buildServer(deps: ServerDeps = {}): FastifyInstance {
  const store = deps.store ?? new AuditChain();
  const app = Fastify({ logger: false });
  const log = new Logger({ service: 'audit-evidence-svc' });
  const meter = new MeterEmitter({ service: 'audit-evidence-svc', sink: deps.meterSink });

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

  const requireCompliance = () => {
    if (!hasRole('compliance_officer')) throw AppError.forbidden('compliance_officer role required');
  };

  app.get('/healthz', async () => ({ status: 'ok' }));

  app.get('/readyz', async (_req, reply) => {
    const report = await readiness({ db: deps.dbPing ?? (() => true) });
    return reply.code(report.status === 'ok' ? 200 : 503).send(report);
  });

  // Ingest an audit event (append-only, hash-chained, durable).
  app.post('/v1/audit/events', async (req: any, reply) => {
    const body = req.body ?? {};
    const chained = await withCtx(req, async () => {
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
      const appended = await store.append(event);
      // Billable usage: one "records" unit per audit event ingested.
      meter.count('records', { source: 'audit_event' });
      return appended;
    });
    req.log.info('audit event appended', { seq: chained.seq, action: chained.action });
    return reply.code(201).send(chained);
  });

  // Query audit events — compliance role only.
  app.get('/v1/audit/events', async (req: any) =>
    withCtx(req, () => {
      requireCompliance();
      const q = req.query ?? {};
      return store.query({ from: q.from, to: q.to, action: q.action });
    }),
  );

  // Generate an auditor evidence pack — compliance role only.
  app.post('/v1/evidence/packs', async (req: any, reply) => {
    const pack = await withCtx(req, () => {
      requireCompliance();
      const { period, from, to } = req.body ?? {};
      if (!period) throw AppError.badRequest('period is required');
      return store.generatePack(period, from ?? '2000-01-01T00:00:00Z', to ?? '2100-01-01T00:00:00Z');
    });
    req.log.info('evidence pack generated', { period: pack.period, eventCount: pack.eventCount });
    return reply.code(201).send(pack);
  });

  // Integrity endpoint: verify the chain has not been tampered with.
  app.get('/v1/audit/verify', async (req: any) =>
    withCtx(req, async () => ({ intact: await store.verify() })),
  );

  // Central error handler: consistent shapes; internal details stay in logs.
  app.setErrorHandler((err, req: any, reply) => {
    const { statusCode, body } = toErrorResponse(err, req.requestId);
    if (statusCode >= 500) req.log?.error('unhandled error', { detail: (err as Error).message });
    reply.code(statusCode).send(body);
  });

  return app;
}

/** Postgres WORM store when DATABASE_URL is set (migrates on boot); in-memory otherwise. */
export async function resolveDeps(): Promise<ServerDeps> {
  if (!process.env.DATABASE_URL) return { store: new AuditChain() };
  const { createPool, migrate } = await import('./db');
  const { PgAuditStore } = await import('./pg-evidence');
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
  return { store: new PgAuditStore(pool), dbPing };
}

if (require.main === module) {
  resolveDeps()
    .then((deps) => {
      const app = buildServer(deps);
      const port = Number(process.env.PORT ?? 3002);
      return app.listen({ port, host: '0.0.0.0' }).then(() => {
        new Logger({ service: 'audit-evidence-svc' }).info('listening', {
          port,
          store: process.env.DATABASE_URL ? 'postgres' : 'in-memory',
        });
      });
    })
    .catch((err) => {
      new Logger({ service: 'audit-evidence-svc' }).error('failed to start', { detail: err.message });
      process.exit(1);
    });
}
