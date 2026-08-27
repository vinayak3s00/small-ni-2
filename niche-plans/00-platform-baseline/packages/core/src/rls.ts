import { getTenantId } from './tenant-context';

/**
 * Minimal query-runner contract (any pg-compatible client satisfies this).
 */
export interface QueryRunner {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

/**
 * Runs a callback inside a transaction where PostgreSQL Row-Level Security is
 * scoped to the current tenant. Every RLS policy in the baseline reads
 * `current_setting('app.tenant_id')`, so we set it per transaction.
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
    const result = await fn(runner);
    await runner.query('COMMIT');
    return result;
  } catch (err) {
    await runner.query('ROLLBACK');
    throw err;
  }
}
