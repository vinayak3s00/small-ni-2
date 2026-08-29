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
  readiness,
  MeterEmitter,
  Logger,
  type ReadinessCheck,
  type MeterSink,
  requireSecret,
} from '@abetworks/core';
import { SyncEngine, type Mutation, type SyncStore } from './sync';

const JWT_SECRET = requireSecret('JWT_SECRET', { devDefault: 'dev-secret-change-me' });

export interface ServerOptions {
  /** Readiness probe for the datastore (e.g. `SELECT 1`); ok=true when healthy. */
  dbPing?: ReadinessCheck;
  /** Optional meter sink (tests inject in-memory; prod uses default log/Kafka sink). */
  meterSink?: MeterSink;
}

export function buildServer(store: SyncStore = new SyncEngine(), opts: ServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const meter = new MeterEmitter({ service: 'sync-gateway', sink: opts.meterSink });

  app.addHook('onRequest', async (req: FastifyRequest, reply) => {
    if (req.url === '/healthz' || req.url === '/readyz') return;
    try {
      req.principal = verifyToken(parseBearer(req.headers.authorization), JWT_SECRET);
    } catch (err) {
      reply.code(401).send({ error: 'unauthorized', detail: (err as Error).message });
    }
  });

  const withCtx = <T>(req: FastifyRequest, fn: () => Promise<T>): Promise<T> =>
    runWithPrincipal(req.principal!, fn);

  app.get('/healthz', async () => ({ status: 'ok' }));

  app.get('/readyz', async (_req, reply) => {
    const report = await readiness({ db: opts.dbPing ?? (() => true) });
    return reply.code(report.status === 'ok' ? 200 : 503).send(report);
  });

  // Push offline-captured mutations (idempotent) and receive an op cursor.
  app.post<{ Body: { mutations?: Mutation[] } }>('/v1/sync', async (req, reply) => {
    const mutations: Mutation[] = req.body?.mutations ?? [];
    if (!Array.isArray(mutations)) {
      return reply.code(400).send({ error: 'mutations[] required' });
    }
    const result = await withCtx(req, () => store.sync(mutations));
    // Billable usage: one "records" unit per newly-applied mutation (duplicates
    // don't re-bill). eventId = clientMutationId keeps it idempotent downstream.
    await withCtx(req, async () => {
      for (const cmid of result.applied) meter.count('records', { eventId: cmid, source: 'sync' });
    });
    return reply.code(200).send(result);
  });

  // Geo-verified check-in convenience endpoint (creates a visit mutation).
  app.post<{
    Body: { outletId?: string; geo?: { lat: number; lng: number }; clientMutationId?: string };
  }>('/v1/visits/check-in', async (req, reply) => {
    const { outletId, geo, clientMutationId } = req.body ?? {};
    if (!outletId || !geo?.lat || !geo?.lng || !clientMutationId) {
      return reply.code(400).send({ error: 'outletId, geo{lat,lng}, clientMutationId required' });
    }
    const result = await withCtx(req, () =>
      store.sync([
        {
          clientMutationId,
          entity: 'visit',
          op: 'create',
          payload: { id: outletId, geo, checkInAt: new Date().toISOString() },
        },
      ]),
    );
    return reply.code(201).send(result);
  });

  return app;
}

/**
 * Postgres when DATABASE_URL is set (migrates on boot); in-memory otherwise.
 * Returns a dbPing readiness check bound to the live pool so /readyz reflects
 * real database health; omitted for the in-memory store (defaults to always-ok).
 */
export async function resolveStore(): Promise<{ store: SyncStore; dbPing?: ReadinessCheck }> {
  if (!process.env.DATABASE_URL) return { store: new SyncEngine() };
  const { createPool, migrate } = await import('./db');
  const { PgSyncStore } = await import('./pg-sync');
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
  return { store: new PgSyncStore(pool), dbPing };
}

if (require.main === module) {
  resolveStore()
    .then(({ store, dbPing }) => {
      const app = buildServer(store, { dbPing });
      const port = Number(process.env.PORT ?? 3008);
      return app.listen({ port, host: '0.0.0.0' }).then(() => {
        new Logger({ service: 'sync-gateway' }).info('listening', {
          port,
          store: process.env.DATABASE_URL ? 'postgres' : 'in-memory',
        });
      });
    })
    .catch((err) => {
      new Logger({ service: 'sync-gateway' }).error('failed to start', { detail: err.message });
      process.exit(1);
    });
}
