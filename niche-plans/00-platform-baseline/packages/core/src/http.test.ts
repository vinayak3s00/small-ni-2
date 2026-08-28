/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { describe, it, expect } from 'vitest';
import { AppError, toErrorResponse, requestIdFrom, readiness } from './http';

describe('AppError + toErrorResponse', () => {
  it('maps AppError to its status + stable code shape', () => {
    const { statusCode, body } = toErrorResponse(AppError.conflict('slot taken', { sku: 'A' }), 'req-1');
    expect(statusCode).toBe(409);
    expect(body.error).toMatchObject({ code: 'conflict', message: 'slot taken', requestId: 'req-1' });
    expect(body.error.details).toEqual({ sku: 'A' });
  });

  it('has convenience constructors with correct statuses', () => {
    expect(AppError.badRequest('x').statusCode).toBe(400);
    expect(AppError.unauthorized().statusCode).toBe(401);
    expect(AppError.forbidden().statusCode).toBe(403);
    expect(AppError.notFound().statusCode).toBe(404);
    expect(AppError.unprocessable('x').statusCode).toBe(422);
  });

  it('hides internal details for unknown errors (no leak)', () => {
    const { statusCode, body } = toErrorResponse(new Error('secret db dsn leaked'), 'req-2');
    expect(statusCode).toBe(500);
    expect(body.error.code).toBe('internal');
    expect(body.error.message).toBe('internal server error');
    expect(JSON.stringify(body)).not.toContain('secret db dsn');
  });
});

describe('requestIdFrom', () => {
  it('uses an inbound id when present', () => {
    expect(requestIdFrom('abc-123')).toBe('abc-123');
    expect(requestIdFrom(['h1', 'h2'])).toBe('h1');
  });
  it('mints a uuid when missing/blank', () => {
    expect(requestIdFrom()).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestIdFrom('  ')).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('readiness', () => {
  it('reports ok when all checks pass', async () => {
    const r = await readiness({ db: () => true, cache: async () => true });
    expect(r.status).toBe('ok');
    expect(r.checks).toEqual({ db: 'ok', cache: 'ok' });
  });

  it('reports degraded when any check fails or throws', async () => {
    const r = await readiness({
      db: () => true,
      cache: () => false,
      queue: () => { throw new Error('down'); },
    });
    expect(r.status).toBe('degraded');
    expect(r.checks).toMatchObject({ db: 'ok', cache: 'fail', queue: 'fail' });
  });
});
