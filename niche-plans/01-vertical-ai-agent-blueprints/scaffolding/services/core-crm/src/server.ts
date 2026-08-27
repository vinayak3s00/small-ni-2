import Fastify, { FastifyInstance } from 'fastify';
import {
  parseBearer,
  verifyToken,
  runWithPrincipal,
  AuditLogger,
  InMemoryAuditSink,
} from '@abetworks/core';
import { InMemoryRepo, SlotTakenError, type Vertical } from './repository';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';

export function buildServer(repo = new InMemoryRepo()): FastifyInstance {
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

  const withCtx = <T>(req: any, fn: () => T): T =>
    runWithPrincipal(req.principal, fn);

  app.get('/healthz', async () => ({ status: 'ok' }));

  app.post('/v1/records', async (req: any, reply) => {
    const body = req.body ?? {};
    if (!body.vertical || !body.party?.name || !body.source) {
      return reply.code(400).send({ error: 'vertical, party.name and source are required' });
    }
    const row = await withCtx(req, async () => {
      const created = repo.createRecord({
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
        const b = repo.book(recordId, resourceId, slotStart);
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

// Boot when run directly.
if (require.main === module) {
  const app = buildServer();
  const port = Number(process.env.PORT ?? 3001);
  app.listen({ port, host: '0.0.0.0' }).then(() => {
    // eslint-disable-next-line no-console
    console.log(`core-crm listening on :${port}`);
  });
}
