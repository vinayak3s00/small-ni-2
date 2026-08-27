/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';

/** Create a pool from DATABASE_URL (throws if unset). */
export function createPool(url = process.env.DATABASE_URL): Pool {
  if (!url) throw new Error('DATABASE_URL is not set');
  return new Pool({ connectionString: url, max: 10 });
}

const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

/**
 * Apply all pending SQL migrations in lexical order, tracked in
 * schema_migrations. Idempotent: already-applied files are skipped.
 */
export async function migrate(pool: Pool, dir = MIGRATIONS_DIR): Promise<string[]> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       filename text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );

  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied: string[] = [];
  for (const file of files) {
    const { rows } = await pool.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [file]);
    if (rows.length > 0) continue;

    const sql = readFileSync(join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      applied.push(file);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
  return applied;
}

// CLI entrypoint: `npm run migrate`
if (require.main === module) {
  const pool = createPool();
  migrate(pool)
    .then((applied) => {
      // eslint-disable-next-line no-console
      console.log(applied.length ? `applied: ${applied.join(', ')}` : 'no pending migrations');
      return pool.end();
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('migration failed:', err.message);
      process.exit(1);
    });
}
