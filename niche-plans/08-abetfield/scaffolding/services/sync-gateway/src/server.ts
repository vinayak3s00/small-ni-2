import Fastify, { FastifyInstance } from 'fastify';
import { parseBearer, verifyToken, runWithPrincipal } from '@abetworks/core';
import { SyncEngine, type Mutation } from './sync';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';

export function buildServer(engine = new SyncEngine()): FastifyInstance {
  const app = Fastify({ logger: false });

  app.addHook('onRequest', async (req: any, reply) => {
    if (req.url === '/healthz') return;
    try {
      req.principal = verifyToken(parseBearer(req.headers.authorization), JWT_SECRET);
    } catch (err) {
      reply.code(401).send({ error: 'unauthorized', detail: (err as Error).message });
    }
  });

  app.get('/healthz', async () => ({ status: 'ok' }));

  // Push offline-captured mutations (idempotent) and receive an op cursor.
  app.post('/v1/sync', async (req: any, reply) =>
    runWithPrincipal(req.principal, () => {
      const mutations: Mutation[] = req.body?.mutations ?? [];
      if (!Array.isArray(mutations)) {
        return reply.code(400).send({ error: 'mutations[] required' });
      }
      return reply.code(200).send(engine.sync(mutations));
    }),
  );

  // Geo-verified check-in convenience endpoint (creates a visit mutation).
  app.post('/v1/visits/check-in', async (req: any, reply) =>
    runWithPrincipal(req.principal, () => {
      const { outletId, geo, clientMutationId } = req.body ?? {};
      if (!outletId || !geo?.lat || !geo?.lng || !clientMutationId) {
        return reply.code(400).send({ error: 'outletId, geo{lat,lng}, clientMutationId required' });
      }
      const result = engine.sync([
        {
          clientMutationId,
          entity: 'visit',
          op: 'create',
          payload: { id: outletId, geo, checkInAt: new Date().toISOString() },
        },
      ]);
      return reply.code(201).send(result);
    }),
  );

  return app;
}

if (require.main === module) {
  const app = buildServer();
  const port = Number(process.env.PORT ?? 3008);
  app.listen({ port, host: '0.0.0.0' }).then(() => {
    // eslint-disable-next-line no-console
    console.log(`sync-gateway listening on :${port}`);
  });
}
