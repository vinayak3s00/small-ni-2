/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { randomUUID } from 'node:crypto';

/**
 * Shared HTTP building blocks so every Abetworks service returns errors in one
 * shape, exposes health/readiness the same way, and correlates requests.
 * Framework-agnostic: these are plain functions/classes the service wires in.
 */

/** A domain error that maps cleanly to an HTTP status + stable machine code. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(400, 'bad_request', message, details);
  }
  static unauthorized(message = 'unauthorized'): AppError {
    return new AppError(401, 'unauthorized', message);
  }
  static forbidden(message = 'forbidden'): AppError {
    return new AppError(403, 'forbidden', message);
  }
  static notFound(message = 'not found'): AppError {
    return new AppError(404, 'not_found', message);
  }
  static conflict(message: string, details?: unknown): AppError {
    return new AppError(409, 'conflict', message, details);
  }
  static unprocessable(message: string, details?: unknown): AppError {
    return new AppError(422, 'unprocessable', message, details);
  }
}

export interface ErrorBody {
  error: { code: string; message: string; details?: unknown; requestId?: string };
}

/**
 * Convert any thrown value into a { statusCode, body } pair with a stable
 * shape. Unknown errors become a 500 with a generic message so internal
 * details never leak to clients (they belong in logs, not responses).
 */
export function toErrorResponse(
  err: unknown,
  requestId?: string,
): { statusCode: number; body: ErrorBody } {
  if (err instanceof AppError) {
    return {
      statusCode: err.statusCode,
      body: {
        error: { code: err.code, message: err.message, details: err.details, requestId },
      },
    };
  }
  return {
    statusCode: 500,
    body: { error: { code: 'internal', message: 'internal server error', requestId } },
  };
}

/** Extract an inbound request id or mint a fresh one for correlation. */
export function requestIdFrom(headerValue?: string | string[]): string {
  const v = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  return v && v.trim() ? v.trim() : randomUUID();
}

export type ReadinessCheck = () => Promise<boolean> | boolean;

export interface HealthReport {
  status: 'ok' | 'degraded';
  checks: Record<string, 'ok' | 'fail'>;
}

/**
 * Run readiness checks (e.g. a DB ping) and produce a report. `status` is "ok"
 * only when every check passes — the contract a load balancer / k8s readiness
 * probe consumes to decide whether to route traffic.
 */
export async function readiness(checks: Record<string, ReadinessCheck>): Promise<HealthReport> {
  const result: Record<string, 'ok' | 'fail'> = {};
  for (const [name, check] of Object.entries(checks)) {
    try {
      result[name] = (await check()) ? 'ok' : 'fail';
    } catch {
      result[name] = 'fail';
    }
  }
  const allOk = Object.values(result).every((v) => v === 'ok');
  return { status: allOk ? 'ok' : 'degraded', checks: result };
}
