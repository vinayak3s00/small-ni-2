/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { join } from 'node:path';
import {
  gatewayPrefixes,
  loadYaml,
  undocumentedPrefixes,
  validateOpenApi,
  type OpenApiDoc,
  type GatewayRoute,
} from './validate';
import { checkAllProducts, hasDrift, type NicheReport } from './product-specs';

/**
 * CLI: validate the aggregated gateway OpenAPI spec and assert it covers every
 * gateway route. Exits non-zero (fails CI) on any structural error or drift.
 * Resolves paths relative to the repo root by default.
 */
export function runCheck(repoRoot = process.cwd()): number {
  const specFile = join(repoRoot, 'platform/api/openapi.yaml');
  const valuesFile = join(repoRoot, 'platform/helm/abet-gateway/values.yaml');

  const doc = loadYaml<OpenApiDoc>(specFile);
  const values = loadYaml<{ routes?: GatewayRoute[] }>(valuesFile);

  const structural = validateOpenApi(doc);
  const specPaths = Object.keys(doc.paths ?? {});
  const missing = undocumentedPrefixes(specPaths, gatewayPrefixes(values));

  if (structural.length === 0 && missing.length === 0) {
    // eslint-disable-next-line no-console
    console.log(`OK: OpenAPI valid (${specPaths.length} paths) and covers all gateway routes.`);
    return 0;
  }
  for (const e of structural) console.error(`spec error: ${e}`);
  for (const m of missing) console.error(`gateway route not documented in spec: ${m}`);
  return 1;
}

/**
 * CLI: validate all 8 per-product specs structurally AND assert each covers the
 * real routes its niche's services implement (param-name-insensitive). Prints a
 * per-niche OK/errors summary and returns non-zero on any structural error or
 * drift (missing route or stale spec path). Resolves paths relative to repoRoot.
 */
export function runProductCheck(repoRoot = process.cwd()): number {
  const reports = checkAllProducts(repoRoot);
  let failed = 0;

  for (const report of reports) {
    if (!hasDrift(report)) {
      // eslint-disable-next-line no-console
      console.log(
        `OK: ${report.niche}: ${report.specRoutes.length} spec paths cover ${report.realRoutes.length} real routes.`,
      );
      continue;
    }
    failed += 1;
    printNicheDrift(report);
  }

  if (failed === 0) {
    // eslint-disable-next-line no-console
    console.log(`OK: all ${reports.length} per-product specs valid and drift-free.`);
    return 0;
  }
  console.error(`FAIL: ${failed}/${reports.length} per-product spec(s) have structural errors or drift.`);
  return 1;
}

function printNicheDrift(report: NicheReport): void {
  console.error(`DRIFT: ${report.niche} (${report.specPath})`);
  for (const e of report.structural) console.error(`  spec error: ${e}`);
  for (const r of report.coverage.routesMissingFromSpec) {
    console.error(`  real route not documented in spec: ${r.method.toUpperCase()} ${r.path}`);
  }
  for (const r of report.coverage.stalePathsInSpec) {
    console.error(`  stale spec path (no backing route): ${r.method.toUpperCase()} ${r.path}`);
  }
}

if (require.main === module) {
  const aggregated = runCheck();
  const products = runProductCheck();
  process.exit(aggregated === 0 && products === 0 ? 0 : 1);
}
