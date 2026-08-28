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

if (require.main === module) {
  process.exit(runCheck());
}
