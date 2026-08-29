/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { Logger, logger } from './logger';

/**
 * Fail-fast secret resolution shared by every Abetworks service.
 *
 * In production (`process.env.NODE_ENV === 'production'`) a missing/empty secret
 * is a fatal misconfiguration: this throws a clear startup error rather than
 * silently falling back to an insecure default. In non-production, a documented
 * `devDefault` may be used, and a one-time warning is emitted per secret name so
 * the insecure default is never silently relied upon.
 */

export interface RequireSecretOptions {
  /** Insecure development-only fallback, used only when NODE_ENV !== 'production'. */
  devDefault?: string;
  /** Optional Logger override (used for tests); defaults to the shared logger. */
  logger?: Logger;
}

/** Dedupe set so the dev-default warning is emitted at most once per secret name. */
const warnedSecrets = new Set<string>();

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function missingSecretError(name: string): Error {
  return new Error(
    `Refusing to start: required secret "${name}" is not set. ` +
      `Set the ${name} environment variable (no insecure default is used in production).`,
  );
}

/**
 * Resolve a required secret from the environment.
 *
 * @param name - The environment variable name to read.
 * @param opts - Optional dev default and logger override.
 * @returns The resolved secret value.
 * @throws When the secret is unset/empty and no safe fallback is available
 *   (always in production; in non-production when no `devDefault` is given).
 */
export function requireSecret(name: string, opts?: RequireSecretOptions): string {
  const v = process.env[name];
  if (typeof v === 'string' && v.length > 0) {
    return v;
  }

  if (isProduction()) {
    throw missingSecretError(name);
  }

  const devDefault = opts?.devDefault;
  if (typeof devDefault === 'string') {
    if (!warnedSecrets.has(name)) {
      warnedSecrets.add(name);
      const log = opts?.logger ?? logger;
      log.warn('using insecure development default for secret', { secret: name });
    }
    return devDefault;
  }

  throw missingSecretError(name);
}
