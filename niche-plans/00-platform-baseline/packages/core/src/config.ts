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
 * The insecure `devDefault` is permitted (fail-open) ONLY in explicitly
 * recognized local development/test environments: when `NODE_ENV` is exactly
 * `'development'` or `'test'`, or when `NODE_ENV` is unset/empty. In EVERY other
 * environment (e.g. `'production'`, `'staging'`, `'prod'`, a mis-cased
 * `'Production'`, or any unrecognized value) a missing/empty secret is a fatal
 * misconfiguration: this throws a clear startup error rather than silently
 * falling back to an insecure default (fail-closed / allowlist).
 *
 * When the dev default is used, a one-time warning is emitted per secret name so
 * the insecure default is never silently relied upon.
 */

export interface RequireSecretOptions {
  /** Insecure development-only fallback, used only in recognized dev/test environments. */
  devDefault?: string;
  /** Optional Logger override (used for tests); defaults to the shared logger. */
  logger?: Logger;
}

/** Dedupe set so the dev-default warning is emitted at most once per secret name. */
const warnedSecrets = new Set<string>();

/**
 * Whether an insecure `devDefault` may be used for a missing secret.
 *
 * Fail-closed allowlist: only local development/test environments qualify.
 * `NODE_ENV` must be exactly `'development'` or `'test'`, or be unset/empty
 * (preserving local dev ergonomics). Any other non-empty value is treated as
 * "secrets required" and a missing secret throws.
 */
function devDefaultAllowed(): boolean {
  const env = process.env.NODE_ENV;
  return env === undefined || env === '' || env === 'development' || env === 'test';
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
 *   (in any environment that is not a recognized local dev/test environment;
 *   also when no `devDefault` is given in a dev/test environment).
 */
export function requireSecret(name: string, opts?: RequireSecretOptions): string {
  const v = process.env[name];
  if (typeof v === 'string' && v.length > 0) {
    return v;
  }

  if (!devDefaultAllowed()) {
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
