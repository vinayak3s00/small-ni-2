/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import Fastify, { FastifyInstance } from 'fastify';
import { parseBearer, verifyToken, runWithPrincipal, getPrincipal } from '@abetworks/core';
import { PartnerRegistry, WorkspaceExistsError } from './partner';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';

/** For AbetPartner the principal's tenantId is the partner (agency) id. */
export function buildServer(reg = new PartnerRegistry()): FastifyInstance {
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

  app.post('/v1/workspaces', async (req: any, reply) =>
    runWithPrincipal(req.principal, () => {
      const partnerId = getPrincipal().tenantId;
      const { clientName } = req.body ?? {};
      if (!clientName) return reply.code(400).send({ error: 'clientName is required' });
      try {
        return reply.code(201).send(reg.provision(partnerId, clientName));
      } catch (err) {
        if (err instanceof WorkspaceExistsError) {
          return reply.code(409).send({ error: err.message });
        }
        throw err;
      }
    }),
  );

  app.get('/v1/workspaces', async (req: any) =>
    runWithPrincipal(req.principal, () => reg.listWorkspaces(getPrincipal().tenantId)),
  );

  app.post('/v1/workspaces/:id/grant', async (req: any, reply) =>
    runWithPrincipal(req.principal, () => {
      const { scopes } = req.body ?? {};
      reg.grant(getPrincipal().tenantId, req.params.id, scopes ?? []);
      return reply.code(204).send();
    }),
  );

  app.get('/v1/billing/rollup', async (req: any) =>
    runWithPrincipal(req.principal, () => {
      const wholesale = Number(req.query?.wholesale ?? 5);
      const retail = Number(req.query?.retail ?? 12);
      return reg.billingRollup(getPrincipal().tenantId, wholesale, retail);
    }),
  );

  return app;
}

if (require.main === module) {
  const app = buildServer();
  const port = Number(process.env.PORT ?? 3006);
  app.listen({ port, host: '0.0.0.0' }).then(() => {
    // eslint-disable-next-line no-console
    console.log(`partner-admin-svc listening on :${port}`);
  });
}
