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
  MeterEmitter,
  Logger,
  type MeterSink,
} from '@abetworks/core';
import { SyncEngine, type Mutation, type SyncStore } from './sync';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';

export interface ServerOptions {
  /** Optional meter sink (tests inject in-memory; prod uses default log/Kafka sink). */
  meterSink?: MeterSink;
}

export function buildServer(store: SyncStore = new SyncEngine(), opts: ServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const meter = new MeterEmitter({ service: 'sync-gateway', sink: opts.meterSink });

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

  // Push offline-captured mutations (idempotent) and receive an op cursor.
  app.post('/v1/sync', async (req: any, reply) => {
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
  app.post('/v1/visits/check-in', async (req: any, reply) => {
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

/** Postgres when DATABASE_URL is set (migrates on boot); in-memory otherwise. */
export async function resolveStore(): Promise<SyncStore> {
  if (!process.env.DATABASE_URL) return new SyncEngine();
  const { createPool, migrate } = await import('./db');
  const { PgSyncStore } = await import('./pg-sync');
  const pool = createPool();
  await migrate(pool);
  return new PgSyncStore(pool);
}

if (require.main === module) {
  resolveStore()
    .then((store) => {
      const app = buildServer(store);
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
