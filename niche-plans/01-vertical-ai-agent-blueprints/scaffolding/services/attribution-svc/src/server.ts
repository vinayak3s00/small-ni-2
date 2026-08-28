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
  type MeterSink,
} from '@abetworks/core';
import {
  InMemoryAttributionStore,
  type AttributionModel,
  type AttributionStore,
} from './attribution';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';

export interface ServerOptions {
  /** Optional meter sink (tests inject in-memory; prod uses default log/Kafka sink). */
  meterSink?: MeterSink;
}

export function buildServer(
  store: AttributionStore = new InMemoryAttributionStore(),
  opts: ServerOptions = {},
): FastifyInstance {
  const app = Fastify({ logger: false });
  const meter = new MeterEmitter({ service: 'attribution-svc', sink: opts.meterSink });

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

  app.post('/v1/attribution/events', async (req: any, reply) => {
    const { recordId, source, campaign, partnerCode, occurredAt } = req.body ?? {};
    if (!recordId || !source) {
      return reply.code(400).send({ error: 'recordId and source are required' });
    }
    const event = await withCtx(req, async () => {
      const recorded = await store.record({ recordId, source, campaign, partnerCode, occurredAt });
      // Billable usage: one "records" unit per attribution touch. eventId = the
      // event's own id, so at-least-once delivery downstream dedupes cleanly.
      meter.count('records', { eventId: recorded.id, source: 'attribution' });
      return recorded;
    });
    return reply.code(201).send(event);
  });

  app.get('/v1/attribution/:recordId', async (req: any) =>
    withCtx(req, async () => {
      const model = (req.query?.model as AttributionModel) ?? 'last_touch';
      return {
        touches: await store.touches(req.params.recordId),
        shares: await store.attribute(req.params.recordId, model),
      };
    }),
  );

  return app;
}

/** Postgres when DATABASE_URL is set (migrates on boot); in-memory otherwise. */
export async function resolveStore(): Promise<AttributionStore> {
  if (!process.env.DATABASE_URL) return new InMemoryAttributionStore();
  const { createPool, migrate } = await import('./db');
  const { PgAttributionStore } = await import('./pg-attribution');
  const pool = createPool();
  await migrate(pool);
  return new PgAttributionStore(pool);
}

if (require.main === module) {
  resolveStore()
    .then((store) => {
      const app = buildServer(store);
      const port = Number(process.env.PORT ?? 3011);
      return app.listen({ port, host: '0.0.0.0' }).then(() => {
        // eslint-disable-next-line no-console
        console.log(`attribution-svc listening on :${port} (${process.env.DATABASE_URL ? 'postgres' : 'in-memory'})`);
      });
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('failed to start:', err.message);
      process.exit(1);
    });
}
