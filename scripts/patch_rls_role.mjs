// Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
// Abetworks Proprietary and Confidential.
//
// One-off patcher: inject ensureRlsRole() + its invocation into each service's
// db.ts so RLS is enforced against a non-superuser role. Idempotent.
import { readFileSync, writeFileSync } from 'node:fs';

const files = [
  'niche-plans/01-vertical-ai-agent-blueprints/scaffolding/services/attribution-svc/src/db.ts',
  'niche-plans/02-abettrust/scaffolding/services/kyc-svc/src/db.ts',
  'niche-plans/02-abettrust/scaffolding/services/audit-evidence-svc/src/db.ts',
  'niche-plans/06-abetpartner/scaffolding/services/partner-admin-svc/src/db.ts',
  'niche-plans/08-abetfield/scaffolding/services/order-svc/src/db.ts',
  'niche-plans/08-abetfield/scaffolding/services/sync-gateway/src/db.ts',
];

const helper = `/**
 * Ensure the non-superuser RLS role exists and can use the schema. RLS is only
 * enforced against non-superuser, non-owner roles, so withTenantScope() runs
 * every tenant transaction as this role. Idempotent + safe to call each boot.
 */
export async function ensureRlsRole(pool: Pool, role = process.env.APP_RLS_ROLE ?? 'app_rls'): Promise<void> {
  await pool.query(\`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '\${role}') THEN
      CREATE ROLE "\${role}" NOLOGIN;
    END IF;
  END $$;\`);
  await pool.query(\`GRANT USAGE ON SCHEMA public TO "\${role}"\`);
  await pool.query(\`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "\${role}"\`);
  await pool.query(\`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "\${role}"\`);
  await pool.query(\`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "\${role}"\`);
  await pool.query(\`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO "\${role}"\`);
}

export async function migrate(`;

for (const f of files) {
  let src = readFileSync(f, 'utf8');
  if (src.includes('ensureRlsRole')) {
    console.log(`skip (already patched): ${f}`);
    continue;
  }
  src = src.replace('export async function migrate(', helper);
  // Insert the call right before `  return applied;`
  src = src.replace('\n  return applied;\n}', '\n  // Grant the RLS role after tables exist so it can read/write them.\n  await ensureRlsRole(pool);\n  return applied;\n}');
  writeFileSync(f, src);
  console.log(`patched: ${f}`);
}
