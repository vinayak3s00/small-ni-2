/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { Logger, requireSecret } from '@abetworks/core';
import { normalizeInbound, verifyChallenge, verifySignature } from './whatsapp';

const VERIFY_TOKEN = requireSecret('WA_VERIFY_TOKEN', { devDefault: 'dev-verify-token' });
const APP_SECRET = requireSecret('WA_APP_SECRET', { devDefault: 'dev-app-secret' });

export function buildServer(onMessage?: (m: unknown) => void): FastifyInstance {
  const app = Fastify({ logger: false });

  // Capture the raw body so we can validate the HMAC signature exactly.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body: string, done) => {
      try {
        _req.rawBody = body;
        done(null, body.length ? JSON.parse(body) : {});
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  app.get('/healthz', async () => ({ status: 'ok' }));

  // Meta webhook verification handshake.
  app.get('/v1/webhooks/whatsapp', async (req: FastifyRequest, reply) => {
    const query = (req.query ?? {}) as Record<string, string | undefined>;
    const challenge = verifyChallenge(
      {
        mode: query['hub.mode'],
        token: query['hub.verify_token'],
        challenge: query['hub.challenge'],
      },
      VERIFY_TOKEN,
    );
    if (challenge === null) return reply.code(403).send({ error: 'verification failed' });
    return reply.code(200).send(challenge);
  });

  // Inbound messages — signature-checked, then normalized.
  app.post('/v1/webhooks/whatsapp', async (req: FastifyRequest, reply) => {
    const sig = req.headers['x-hub-signature-256'];
    const ok = verifySignature(req.rawBody ?? '', Array.isArray(sig) ? sig[0] : sig, APP_SECRET);
    if (!ok) return reply.code(401).send({ error: 'invalid signature' });
    const messages = normalizeInbound(req.body);
    for (const m of messages) onMessage?.(m);
    return reply.code(200).send({ received: messages.length });
  });

  return app;
}

if (require.main === module) {
  const app = buildServer();
  const port = Number(process.env.PORT ?? 3012);
  app.listen({ port, host: '0.0.0.0' }).then(() => {
    new Logger({ service: 'channel-gw' }).info('listening', { port });
  });
}
