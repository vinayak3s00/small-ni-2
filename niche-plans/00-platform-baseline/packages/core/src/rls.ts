/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { getTenantId } from './tenant-context';

/**
 * Minimal query-runner contract (any pg-compatible client satisfies this).
 */
export interface QueryRunner {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

/**
 * The non-superuser role RLS is enforced against. PostgreSQL SUPERUSERS and a
 * table's OWNER can bypass RLS, so every tenant-scoped transaction switches to
 * this restricted role via `SET LOCAL ROLE`. Override with APP_RLS_ROLE.
 */
export const APP_RLS_ROLE = process.env.APP_RLS_ROLE ?? 'app_rls';

/**
 * Runs a callback inside a transaction where PostgreSQL Row-Level Security is
 * scoped to the current tenant. Every RLS policy in the baseline reads
 * `current_setting('app.tenant_id')`, so we set it per transaction. We also
 * `SET LOCAL ROLE` to a non-superuser role so RLS is actually enforced even
 * when the pool connects as a privileged user (e.g. `postgres` in CI/dev).
 *
 * Example RLS policy (see docs/data-model):
 *   CREATE POLICY tenant_isolation ON record
 *     USING (tenant_id = current_setting('app.tenant_id')::uuid);
 */
export async function withTenantScope<T>(
  runner: QueryRunner,
  fn: (tx: QueryRunner) => Promise<T>,
): Promise<T> {
  const tenantId = getTenantId();
  await runner.query('BEGIN');
  try {
    // set_config(..., is_local=true) => scoped to this transaction only.
    await runner.query('SELECT set_config($1, $2, true)', ['app.tenant_id', tenantId]);
    // Drop superuser/owner privileges for the duration of the tx so RLS applies.
    // Quoted identifier is safe: APP_RLS_ROLE is an operator-controlled constant.
    await runner.query(`SET LOCAL ROLE "${APP_RLS_ROLE}"`);
    const result = await fn(runner);
    await runner.query('COMMIT');
    return result;
  } catch (err) {
    await runner.query('ROLLBACK');
    throw err;
  }
}
