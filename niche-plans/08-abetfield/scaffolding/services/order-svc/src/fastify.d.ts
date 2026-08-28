/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

// Module augmentation for the custom decorations this service attaches to
// every Fastify request in its onRequest hook. Typing them here lets handlers
// use `FastifyRequest` (or route generics) instead of `any`.
import 'fastify';
import type { Principal } from '@abetworks/core';

declare module 'fastify' {
  interface FastifyRequest {
    /** Authenticated principal set by the auth step of the onRequest hook. */
    principal?: Principal;
  }
}
