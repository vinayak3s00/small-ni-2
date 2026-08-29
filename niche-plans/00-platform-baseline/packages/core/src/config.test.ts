/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { requireSecret } from './config';
import { Logger, type LogRecord } from './logger';

const VAR = 'ABETWORKS_TEST_SECRET';

let savedNodeEnv: string | undefined;
let savedVar: string | undefined;

beforeEach(() => {
  savedNodeEnv = process.env.NODE_ENV;
  savedVar = process.env[VAR];
  delete process.env[VAR];
});

afterEach(() => {
  if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = savedNodeEnv;
  if (savedVar === undefined) delete process.env[VAR];
  else process.env[VAR] = savedVar;
});

function capturingLogger(records: LogRecord[]): Logger {
  return new Logger({ minLevel: 'debug', sink: (r) => records.push(r) });
}

describe('requireSecret', () => {
  it('returns the env value when set (non-production)', () => {
    process.env.NODE_ENV = 'development';
    process.env[VAR] = 'from-env';
    expect(requireSecret(VAR, { devDefault: 'dev' })).toBe('from-env');
  });

  it('returns the env value when set (production)', () => {
    process.env.NODE_ENV = 'production';
    process.env[VAR] = 'prod-env';
    expect(requireSecret(VAR)).toBe('prod-env');
  });

  it('throws in production when the env var is missing, naming the variable', () => {
    process.env.NODE_ENV = 'production';
    expect(() => requireSecret(VAR, { devDefault: 'dev' })).toThrowError(
      new RegExp(VAR),
    );
  });

  it('throws in production when the env var is empty', () => {
    process.env.NODE_ENV = 'production';
    process.env[VAR] = '';
    expect(() => requireSecret(VAR, { devDefault: 'dev' })).toThrow();
  });

  it('returns the dev default when non-production and env var missing', () => {
    process.env.NODE_ENV = 'development';
    const records: LogRecord[] = [];
    expect(
      requireSecret(VAR, { devDefault: 'dev-default', logger: capturingLogger(records) }),
    ).toBe('dev-default');
  });

  it('throws when non-production and no dev default is provided', () => {
    process.env.NODE_ENV = 'test';
    expect(() => requireSecret(VAR)).toThrowError(new RegExp(VAR));
  });

  it('throws when NODE_ENV=staging and the env var is missing, even with a dev default', () => {
    process.env.NODE_ENV = 'staging';
    expect(() => requireSecret(VAR, { devDefault: 'dev' })).toThrowError(
      new RegExp(VAR),
    );
  });

  it('throws when NODE_ENV is mis-cased Production, even with a dev default', () => {
    process.env.NODE_ENV = 'Production';
    expect(() => requireSecret(VAR, { devDefault: 'dev' })).toThrowError(
      new RegExp(VAR),
    );
  });

  it('returns the dev default when NODE_ENV=development and env var missing', () => {
    process.env.NODE_ENV = 'development';
    const records: LogRecord[] = [];
    expect(
      requireSecret(VAR, { devDefault: 'dev-default', logger: capturingLogger(records) }),
    ).toBe('dev-default');
  });

  it('returns the dev default when NODE_ENV=test and env var missing', () => {
    process.env.NODE_ENV = 'test';
    const records: LogRecord[] = [];
    expect(
      requireSecret(VAR, { devDefault: 'dev-default', logger: capturingLogger(records) }),
    ).toBe('dev-default');
  });

  it('returns the dev default when NODE_ENV is unset and env var missing', () => {
    delete process.env.NODE_ENV;
    const records: LogRecord[] = [];
    expect(
      requireSecret(VAR, { devDefault: 'dev-default', logger: capturingLogger(records) }),
    ).toBe('dev-default');
  });

  it('emits a one-time warning when the dev default is used', () => {
    process.env.NODE_ENV = 'development';
    const records: LogRecord[] = [];
    const log = capturingLogger(records);
    // Use a unique name so the module-level dedupe set does not hide the warning.
    const uniqueVar = `${VAR}_WARN_${Date.now()}`;
    delete process.env[uniqueVar];

    requireSecret(uniqueVar, { devDefault: 'dev', logger: log });
    requireSecret(uniqueVar, { devDefault: 'dev', logger: log });

    const warnings = records.filter((r) => r.level === 'warn');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].msg).toBe('using insecure development default for secret');
    expect(warnings[0].secret).toBe(uniqueVar);

    delete process.env[uniqueVar];
  });
});
