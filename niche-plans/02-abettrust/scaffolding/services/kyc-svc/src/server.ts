/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import Fastify, { FastifyInstance } from 'fastify';
import { parseBearer, verifyToken, runWithPrincipal } from '@abetworks/core';
import {
  InMemoryKycStore,
  InvalidKycTransition,
  KycNotFound,
  type KycStatus,
  type KycStore,
} from './kyc';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';

export function buildServer(store: KycStore = new InMemoryKycStore()): FastifyInstance {
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

  app.post('/v1/kyc', async (req: any, reply) => {
    const { partyId, documents } = req.body ?? {};
    if (!partyId) return reply.code(400).send({ error: 'partyId required' });
    const rec = await withCtx(req, () => store.create(partyId, documents ?? []));
    return reply.code(201).send(rec);
  });

  app.post('/v1/kyc/:id/transition', async (req: any, reply) => {
    const to = req.body?.to as KycStatus;
    try {
      return await withCtx(req, () => store.transition(req.params.id, to));
    } catch (err) {
      if (err instanceof InvalidKycTransition) return reply.code(409).send({ error: err.message });
      if (err instanceof KycNotFound) return reply.code(404).send({ error: err.message });
      throw err;
    }
  });

  app.post('/v1/kyc/:id/disclosures', async (req: any, reply) => {
    const { disclosure } = req.body ?? {};
    if (!disclosure) return reply.code(400).send({ error: 'disclosure required' });
    try {
      return await withCtx(req, () => store.addDisclosure(req.params.id, disclosure));
    } catch (err) {
      if (err instanceof KycNotFound) return reply.code(404).send({ error: err.message });
      throw err;
    }
  });

  app.get('/v1/kyc/:id/suitability', async (req: any) =>
    withCtx(req, async () => ({ complete: await store.isSuitabilityComplete(req.params.id) })),
  );

  app.get('/v1/kyc/:id', async (req: any, reply) => {
    const rec = await withCtx(req, () => store.get(req.params.id));
    return rec ? rec : reply.code(404).send({ error: 'not found' });
  });

  return app;
}

/** Postgres when DATABASE_URL is set (migrates on boot); in-memory otherwise. */
export async function resolveStore(): Promise<KycStore> {
  if (!process.env.DATABASE_URL) return new InMemoryKycStore();
  const { createPool, migrate } = await import('./db');
  const { PgKycStore } = await import('./pg-kyc');
  const pool = createPool();
  await migrate(pool);
  return new PgKycStore(pool);
}

if (require.main === module) {
  resolveStore()
    .then((store) => {
      const app = buildServer(store);
      const port = Number(process.env.PORT ?? 3007);
      return app.listen({ port, host: '0.0.0.0' }).then(() => {
        // eslint-disable-next-line no-console
        console.log(`kyc-svc listening on :${port} (${process.env.DATABASE_URL ? 'postgres' : 'in-memory'})`);
      });
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('failed to start:', err.message);
      process.exit(1);
    });
}
