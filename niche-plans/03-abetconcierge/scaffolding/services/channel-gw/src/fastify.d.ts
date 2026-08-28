/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

// Module augmentation for the custom decorations this service attaches to
// every Fastify request. Typing them here lets handlers use `FastifyRequest`
// instead of `any` while keeping full type-safety on the platform decorations.
import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /** Raw request body captured by the JSON content-type parser (HMAC check). */
    rawBody?: string;
  }
}
