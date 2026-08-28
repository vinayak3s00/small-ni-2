/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { tryGetPrincipal } from './tenant-context';

/**
 * Structured JSON logger shared by every Abetworks service.
 *
 * - Emits one JSON object per line (ingestible by Loki/CloudWatch/etc.).
 * - Honors a minimum level from LOG_LEVEL (default "info").
 * - Auto-correlates: when called inside a tenant context, it stamps every line
 *   with the tenant id and actor, so logs are traceable per tenant/user without
 *   the caller having to pass them. A per-logger requestId can be bound too.
 * - Never throws and never leaks secrets: only the fields you pass are logged.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface LogFields {
  [key: string]: unknown;
}

export interface LogRecord extends LogFields {
  level: LogLevel;
  time: string;
  msg: string;
  service?: string;
  requestId?: string;
  tenantId?: string;
  actor?: string;
}

/** Sink that receives fully-formed records. Defaults to stdout as JSON lines. */
export type LogSink = (record: LogRecord) => void;

export const stdoutSink: LogSink = (record) => {
  // eslint-disable-next-line no-console
  process.stdout.write(JSON.stringify(record) + '\n');
};

function minLevelFromEnv(): LogLevel {
  const v = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  return (['debug', 'info', 'warn', 'error'] as LogLevel[]).includes(v as LogLevel)
    ? (v as LogLevel)
    : 'info';
}

export interface LoggerOptions {
  service?: string;
  requestId?: string;
  minLevel?: LogLevel;
  sink?: LogSink;
  base?: LogFields;
}

export class Logger {
  private readonly service?: string;
  private readonly requestId?: string;
  private readonly minRank: number;
  private readonly sink: LogSink;
  private readonly base: LogFields;

  constructor(opts: LoggerOptions = {}) {
    this.service = opts.service ?? process.env.SERVICE_NAME;
    this.requestId = opts.requestId;
    this.minRank = LEVEL_RANK[opts.minLevel ?? minLevelFromEnv()];
    this.sink = opts.sink ?? stdoutSink;
    this.base = opts.base ?? {};
  }

  /** Derive a child logger with extra bound fields (e.g. a requestId). */
  child(fields: LogFields & { requestId?: string } = {}): Logger {
    const { requestId, ...rest } = fields;
    return new Logger({
      service: this.service,
      requestId: requestId ?? this.requestId,
      minLevel: rankToLevel(this.minRank),
      sink: this.sink,
      base: { ...this.base, ...rest },
    });
  }

  private write(level: LogLevel, msg: string, fields: LogFields = {}): void {
    if (LEVEL_RANK[level] < this.minRank) return;
    const principal = tryGetPrincipal();
    const record: LogRecord = {
      level,
      time: new Date().toISOString(),
      msg,
      ...(this.service ? { service: this.service } : {}),
      ...(this.requestId ? { requestId: this.requestId } : {}),
      ...(principal ? { tenantId: principal.tenantId, actor: principal.sub } : {}),
      ...this.base,
      ...fields,
    };
    try {
      this.sink(record);
    } catch {
      /* logging must never throw */
    }
  }

  debug(msg: string, fields?: LogFields): void {
    this.write('debug', msg, fields);
  }
  info(msg: string, fields?: LogFields): void {
    this.write('info', msg, fields);
  }
  warn(msg: string, fields?: LogFields): void {
    this.write('warn', msg, fields);
  }
  error(msg: string, fields?: LogFields): void {
    this.write('error', msg, fields);
  }
}

function rankToLevel(rank: number): LogLevel {
  return (Object.keys(LEVEL_RANK) as LogLevel[]).find((l) => LEVEL_RANK[l] === rank) ?? 'info';
}

/** A process-wide default logger; services usually derive per-request children. */
export const logger = new Logger();
