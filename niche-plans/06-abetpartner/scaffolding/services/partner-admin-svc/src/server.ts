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
  getPrincipal,
  readiness,
  MeterEmitter,
  Logger,
  type ReadinessCheck,
  type MeterSink,
  requireSecret,
} from '@abetworks/core';
import { InMemoryPartnerStore, WorkspaceExistsError, type PartnerStore } from './partner';

const JWT_SECRET = requireSecret('JWT_SECRET', { devDefault: 'dev-secret-change-me' });

export interface ServerOptions {
  /** Readiness probe for the datastore (e.g. `SELECT 1`); ok=true when healthy. */
  dbPing?: ReadinessCheck;
  /** Optional meter sink (tests inject in-memory; prod uses default log/Kafka sink). */
  meterSink?: MeterSink;
}

/** For AbetPartner the principal's tenantId is the partner (agency) id. */
export function buildServer(store: PartnerStore = new InMemoryPartnerStore(), opts: ServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const meter = new MeterEmitter({ service: 'partner-admin-svc', sink: opts.meterSink });

  app.addHook('onRequest', async (req: FastifyRequest, reply) => {
    if (req.url === '/healthz' || req.url === '/readyz') return;
    try {
      req.principal = verifyToken(parseBearer(req.headers.authorization), JWT_SECRET);
    } catch (err) {
      reply.code(401).send({ error: 'unauthorized', detail: (err as Error).message });
    }
  });

  const withCtx = <T>(req: FastifyRequest, fn: (partnerId: string) => Promise<T>): Promise<T> =>
    runWithPrincipal(req.principal!, () => fn(getPrincipal().tenantId));

  app.get('/healthz', async () => ({ status: 'ok' }));

  app.get('/readyz', async (_req, reply) => {
    const report = await readiness({ db: opts.dbPing ?? (() => true) });
    return reply.code(report.status === 'ok' ? 200 : 503).send(report);
  });

  app.post<{ Body: { clientName?: string } }>('/v1/workspaces', async (req, reply) => {
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

  app.get('/v1/workspaces', async (req) => withCtx(req, (pid) => store.listWorkspaces(pid)));

  app.post<{ Params: { id: string }; Body: { scopes?: string[] } }>('/v1/workspaces/:id/grant', async (req, reply) => {
    const { scopes } = req.body ?? {};
    await withCtx(req, (pid) => store.grant(pid, req.params.id, scopes ?? []));
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string }; Body: { units?: number } }>('/v1/workspaces/:id/usage', async (req, reply) => {
    const units = Number(req.body?.units ?? 0);
    await withCtx(req, (pid) => store.recordUsage(pid, req.params.id, units));
    return reply.code(204).send();
  });

  app.get<{ Querystring: { wholesale?: number; retail?: number } }>('/v1/billing/rollup', async (req) =>
    withCtx(req, (pid) =>
      store.billingRollup(pid, Number(req.query?.wholesale ?? 5), Number(req.query?.retail ?? 12)),
    ),
  );

  return app;
}

/**
 * Postgres when DATABASE_URL is set (migrates on boot); in-memory otherwise.
 * Returns a dbPing readiness check bound to the live pool so /readyz reflects
 * real database health; omitted for the in-memory store (defaults to always-ok).
 */
export async function resolveStore(): Promise<{ store: PartnerStore; dbPing?: ReadinessCheck }> {
  if (!process.env.DATABASE_URL) return { store: new InMemoryPartnerStore() };
  const { createPool, migrate } = await import('./db');
  const { PgPartnerStore } = await import('./pg-partner');
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
  return { store: new PgPartnerStore(pool), dbPing };
}

if (require.main === module) {
  resolveStore()
    .then(({ store, dbPing }) => {
      const app = buildServer(store, { dbPing });
      const port = Number(process.env.PORT ?? 3006);
      return app.listen({ port, host: '0.0.0.0' }).then(() => {
        new Logger({ service: 'partner-admin-svc' }).info('listening', {
          port,
          store: process.env.DATABASE_URL ? 'postgres' : 'in-memory',
        });
      });
    })
    .catch((err) => {
      new Logger({ service: 'partner-admin-svc' }).error('failed to start', { detail: err.message });
      process.exit(1);
    });
}
