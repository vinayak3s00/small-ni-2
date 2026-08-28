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
  MeterEmitter,
  type MeterSink,
} from '@abetworks/core';
import { InMemoryPartnerStore, WorkspaceExistsError, type PartnerStore } from './partner';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';

export interface ServerOptions {
  /** Optional meter sink (tests inject in-memory; prod uses default log/Kafka sink). */
  meterSink?: MeterSink;
}

/** For AbetPartner the principal's tenantId is the partner (agency) id. */
export function buildServer(store: PartnerStore = new InMemoryPartnerStore(), opts: ServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const meter = new MeterEmitter({ service: 'partner-admin-svc', sink: opts.meterSink });

  app.addHook('onRequest', async (req: any, reply) => {
    if (req.url === '/healthz') return;
    try {
      req.principal = verifyToken(parseBearer(req.headers.authorization), JWT_SECRET);
    } catch (err) {
      reply.code(401).send({ error: 'unauthorized', detail: (err as Error).message });
    }
  });

  const withCtx = <T>(req: any, fn: (partnerId: string) => Promise<T>): Promise<T> =>
    runWithPrincipal(req.principal, () => fn(getPrincipal().tenantId));

  app.get('/healthz', async () => ({ status: 'ok' }));

  app.post('/v1/workspaces', async (req: any, reply) => {
    const { clientName } = req.body ?? {};
    if (!clientName) return reply.code(400).send({ error: 'clientName is required' });
    try {
      const ws = await withCtx(req, async (pid) => {
        const provisioned = await store.provision(pid, clientName);
        // Billable usage: one "records" unit per client workspace provisioned.
        meter.count('records', { eventId: provisioned.id, source: 'workspace' });
        return provisioned;
      });
      return reply.code(201).send(ws);
    } catch (err) {
      if (err instanceof WorkspaceExistsError) return reply.code(409).send({ error: err.message });
      throw err;
    }
  });

  app.get('/v1/workspaces', async (req: any) => withCtx(req, (pid) => store.listWorkspaces(pid)));

  app.post('/v1/workspaces/:id/grant', async (req: any, reply) => {
    const { scopes } = req.body ?? {};
    await withCtx(req, (pid) => store.grant(pid, req.params.id, scopes ?? []));
    return reply.code(204).send();
  });

  app.post('/v1/workspaces/:id/usage', async (req: any, reply) => {
    const units = Number(req.body?.units ?? 0);
    await withCtx(req, (pid) => store.recordUsage(pid, req.params.id, units));
    return reply.code(204).send();
  });

  app.get('/v1/billing/rollup', async (req: any) =>
    withCtx(req, (pid) =>
      store.billingRollup(pid, Number(req.query?.wholesale ?? 5), Number(req.query?.retail ?? 12)),
    ),
  );

  return app;
}

/** Postgres when DATABASE_URL is set (migrates on boot); in-memory otherwise. */
export async function resolveStore(): Promise<PartnerStore> {
  if (!process.env.DATABASE_URL) return new InMemoryPartnerStore();
  const { createPool, migrate } = await import('./db');
  const { PgPartnerStore } = await import('./pg-partner');
  const pool = createPool();
  await migrate(pool);
  return new PgPartnerStore(pool);
}

if (require.main === module) {
  resolveStore()
    .then((store) => {
      const app = buildServer(store);
      const port = Number(process.env.PORT ?? 3006);
      return app.listen({ port, host: '0.0.0.0' }).then(() => {
        // eslint-disable-next-line no-console
        console.log(`partner-admin-svc listening on :${port} (${process.env.DATABASE_URL ? 'postgres' : 'in-memory'})`);
      });
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('failed to start:', err.message);
      process.exit(1);
    });
}
