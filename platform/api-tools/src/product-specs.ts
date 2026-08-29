/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadYaml, validateOpenApi, type OpenApiDoc } from './validate';

/**
 * Per-product OpenAPI drift guard.
 *
 * The 8 per-product specs (niche-plans/NN-<name>/api/openapi.yaml) declare their
 * paths RELATIVE to a single `servers[].url` that ends in `/v1` (e.g. spec path
 * `/records` == real route `/v1/records`). The real routes live in the niche's
 * services: Fastify TS (`src/server.ts`, `app.get/post/...('/v1/...')` with
 * `:param`) and FastAPI Python (`src/app.py`, `@app.get/post/...("/v1/...")`
 * with `{snake_case}`). This module derives the real routes by reading those
 * source files, resolves each spec's full `/v1/...` paths, and compares the two
 * sets with PARAM-NAME-INSENSITIVE matching (each `{...}` segment is normalized
 * to a `{}` placeholder so Fastify `{recordId}`, spec `{id}`, and Python
 * `{party_id}` at the same positional segment are treated as equivalent).
 *
 * Policy decision: BOTH directions of drift are HARD ERRORS, mirroring the
 * strictness of the aggregated drift guard in validate.ts:
 *   - routesMissingFromSpec: a real route with no documenting spec path.
 *   - stalePathsInSpec:       a spec path with no backing real route.
 * Treating stale paths as errors (not warnings) prevents specs from silently
 * rotting as services evolve.
 *
 * All comparison logic here is pure and exported (no console, no process.exit);
 * the CLI entry (check.ts) owns console output and the exit code.
 */

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

export interface Route {
  method: string;
  path: string;
}

/** A per-product spec plus the service source files that back its niche. */
export interface ProductSpecManifest {
  /** Niche id, e.g. '01-vertical-ai-agent-blueprints'. */
  niche: string;
  /** Repo-relative path to the per-product OpenAPI spec. */
  specPath: string;
  /** Repo-relative paths to Fastify TS `server.ts` service files. */
  tsServices: string[];
  /** Repo-relative paths to FastAPI Python `app.py` service files. */
  pyServices: string[];
}

/**
 * The 8 per-product specs and the service source files backing each niche.
 * Kept in sync with .agents/tasks/task-per-product-openapi-drift/route-inventory.md.
 */
export const PRODUCT_SPECS: ProductSpecManifest[] = [
  {
    niche: '01-vertical-ai-agent-blueprints',
    specPath: 'niche-plans/01-vertical-ai-agent-blueprints/api/openapi.yaml',
    tsServices: [
      'niche-plans/01-vertical-ai-agent-blueprints/scaffolding/services/core-crm/src/server.ts',
      'niche-plans/01-vertical-ai-agent-blueprints/scaffolding/services/attribution-svc/src/server.ts',
    ],
    pyServices: [
      'niche-plans/01-vertical-ai-agent-blueprints/scaffolding/services/agent-orchestrator/src/app.py',
      'niche-plans/01-vertical-ai-agent-blueprints/scaffolding/services/scoring-svc/src/app.py',
    ],
  },
  {
    niche: '02-abettrust',
    specPath: 'niche-plans/02-abettrust/api/openapi.yaml',
    tsServices: [
      'niche-plans/02-abettrust/scaffolding/services/audit-evidence-svc/src/server.ts',
      'niche-plans/02-abettrust/scaffolding/services/kyc-svc/src/server.ts',
    ],
    pyServices: ['niche-plans/02-abettrust/scaffolding/services/policy-engine/src/app.py'],
  },
  {
    niche: '03-abetconcierge',
    specPath: 'niche-plans/03-abetconcierge/api/openapi.yaml',
    tsServices: [
      'niche-plans/03-abetconcierge/scaffolding/services/channel-gw/src/server.ts',
      'niche-plans/03-abetconcierge/scaffolding/services/quoting-svc/src/server.ts',
    ],
    pyServices: ['niche-plans/03-abetconcierge/scaffolding/services/concierge-agent/src/app.py'],
  },
  {
    niche: '04-abetvoice',
    specPath: 'niche-plans/04-abetvoice/api/openapi.yaml',
    tsServices: ['niche-plans/04-abetvoice/scaffolding/services/telephony-svc/src/server.ts'],
    pyServices: ['niche-plans/04-abetvoice/scaffolding/services/voice-orchestrator/src/app.py'],
  },
  {
    niche: '05-abetmigrate',
    specPath: 'niche-plans/05-abetmigrate/api/openapi.yaml',
    tsServices: [],
    pyServices: [
      'niche-plans/05-abetmigrate/scaffolding/services/mapping-engine/src/app.py',
      'niche-plans/05-abetmigrate/scaffolding/services/reconciliation-svc/src/app.py',
      'niche-plans/05-abetmigrate/scaffolding/services/source-connectors/src/app.py',
    ],
  },
  {
    niche: '06-abetpartner',
    specPath: 'niche-plans/06-abetpartner/api/openapi.yaml',
    tsServices: [
      'niche-plans/06-abetpartner/scaffolding/services/partner-admin-svc/src/server.ts',
      'niche-plans/06-abetpartner/scaffolding/services/reporting-svc/src/server.ts',
    ],
    pyServices: [],
  },
  {
    niche: '07-abetretain',
    specPath: 'niche-plans/07-abetretain/api/openapi.yaml',
    tsServices: [],
    pyServices: [
      'niche-plans/07-abetretain/scaffolding/services/journey-engine/src/app.py',
      'niche-plans/07-abetretain/scaffolding/services/retention-svc/src/app.py',
      'niche-plans/07-abetretain/scaffolding/services/support-agent/src/app.py',
    ],
  },
  {
    niche: '08-abetfield',
    specPath: 'niche-plans/08-abetfield/api/openapi.yaml',
    tsServices: [
      'niche-plans/08-abetfield/scaffolding/services/order-svc/src/server.ts',
      'niche-plans/08-abetfield/scaffolding/services/route-svc/src/server.ts',
      'niche-plans/08-abetfield/scaffolding/services/sync-gateway/src/server.ts',
    ],
    pyServices: [],
  },
];

/** Liveness/readiness probes are never part of a product API surface. */
const EXCLUDED_PATHS = new Set(['/healthz', '/readyz']);

/** Convert a Fastify colon param (`:recordId`) to OpenAPI form (`{recordId}`). */
function fastifyToOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

/**
 * Extract routes from a Fastify `server.ts` source string. Matches
 * `app.get('/v1/...')`, `app.post<{...}>('/v1/...')`, etc. The optional generic
 * type argument (`<{ ... }>`) between the method name and `(` is tolerated.
 * Fastify `:param` segments are normalized to OpenAPI `{param}` form. Only
 * `/v1/...` routes are kept; `/healthz` and `/readyz` are excluded.
 */
export function extractRoutes(serverTsSource: string): Route[] {
  const routes: Route[] = [];
  const re =
    /\bapp\.(get|post|put|patch|delete)\s*(?:<[\s\S]*?>)?\s*\(\s*(['"`])([^'"`]+)\2/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(serverTsSource)) !== null) {
    const method = m[1].toLowerCase();
    const rawPath = m[3];
    if (EXCLUDED_PATHS.has(rawPath)) continue;
    if (!rawPath.startsWith('/v1/') && rawPath !== '/v1') continue;
    routes.push({ method, path: fastifyToOpenApiPath(rawPath) });
  }
  return dedupeRoutes(routes);
}

/**
 * Extract routes from a FastAPI `app.py` source string. Matches
 * `@app.get("/v1/...")`, `@app.post("/v1/...")`, etc. FastAPI already uses
 * `{param}` form so paths pass through unchanged. `/healthz` and `/readyz` are
 * excluded; only `/v1/...` routes are kept.
 */
export function extractPyRoutes(appPySource: string): Route[] {
  const routes: Route[] = [];
  const re = /@app\.(get|post|put|patch|delete)\s*\(\s*(['"])([^'"]+)\2/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(appPySource)) !== null) {
    const method = m[1].toLowerCase();
    const rawPath = m[3];
    if (EXCLUDED_PATHS.has(rawPath)) continue;
    if (!rawPath.startsWith('/v1/') && rawPath !== '/v1') continue;
    routes.push({ method, path: rawPath });
  }
  return dedupeRoutes(routes);
}

function dedupeRoutes(routes: Route[]): Route[] {
  const seen = new Set<string>();
  const out: Route[] = [];
  for (const r of routes) {
    const key = `${r.method} ${r.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/**
 * Resolve the pathname of a spec's first `servers[].url` (the `/v1` base). A
 * missing/absent server or unparsable URL yields '' (base treated as empty).
 */
export function serverBasePath(doc: OpenApiDoc): string {
  const url = (doc as { servers?: { url?: string }[] }).servers?.[0]?.url;
  if (!url) return '';
  try {
    const { pathname } = new URL(url);
    // Normalize a trailing slash away so join is clean: '/v1/' -> '/v1'.
    return pathname === '/' ? '' : pathname.replace(/\/$/, '');
  } catch {
    // Not an absolute URL; treat the raw value as a path base if it looks like one.
    return url.startsWith('/') ? url.replace(/\/$/, '') : '';
  }
}

/**
 * Combine the spec's server base path (e.g. `/v1`) with each relative path key
 * to produce absolute routes comparable to the real service routes. Returns one
 * {method, path} per operation. A missing server base is treated as ''.
 */
export function resolveSpecFullPaths(doc: OpenApiDoc): Route[] {
  const base = serverBasePath(doc);
  const routes: Route[] = [];
  for (const [relPath, item] of Object.entries(doc.paths ?? {})) {
    const fullPath = `${base}${relPath}`;
    for (const method of Object.keys(item)) {
      if ((HTTP_METHODS as readonly string[]).includes(method.toLowerCase())) {
        routes.push({ method: method.toLowerCase(), path: fullPath });
      }
    }
  }
  return dedupeRoutes(routes);
}

/**
 * Normalize a path for param-name-INSENSITIVE comparison: every `{...}` segment
 * becomes the placeholder token `{}` so `/v1/kyc/{id}` and `/v1/kyc/{party_id}`
 * compare equal, while literal segments must match exactly.
 */
export function normalizePath(path: string): string {
  return path
    .split('/')
    .map((seg) => (seg.startsWith('{') && seg.endsWith('}') ? '{}' : seg))
    .join('/');
}

/** A route key that ignores param names but respects method + structure. */
function routeKey(r: Route): string {
  return `${r.method} ${normalizePath(r.path)}`;
}

export interface CoverageResult {
  /** Real routes with no documenting spec path (param-name-insensitive). */
  routesMissingFromSpec: Route[];
  /** Spec paths with no backing real route (param-name-insensitive). */
  stalePathsInSpec: Route[];
}

/**
 * Compare real service routes against resolved spec routes with
 * param-name-insensitive matching. Returns the two drift lists (both are hard
 * errors per the policy documented above).
 */
export function compareCoverage(realRoutes: Route[], specRoutes: Route[]): CoverageResult {
  const specKeys = new Set(specRoutes.map(routeKey));
  const realKeys = new Set(realRoutes.map(routeKey));

  const routesMissingFromSpec = realRoutes.filter((r) => !specKeys.has(routeKey(r)));
  const stalePathsInSpec = specRoutes.filter((r) => !realKeys.has(routeKey(r)));

  return { routesMissingFromSpec, stalePathsInSpec };
}

export interface NicheReport {
  niche: string;
  specPath: string;
  /** Structural OpenAPI errors from validateOpenApi (empty when clean). */
  structural: string[];
  /** Real routes derived from the niche's service source files. */
  realRoutes: Route[];
  /** Spec-declared routes resolved to absolute `/v1/...` form. */
  specRoutes: Route[];
  coverage: CoverageResult;
}

/** True when a report has any structural error or any drift in either direction. */
export function hasDrift(report: NicheReport): boolean {
  return (
    report.structural.length > 0 ||
    report.coverage.routesMissingFromSpec.length > 0 ||
    report.coverage.stalePathsInSpec.length > 0
  );
}

/** Real routes derived from a niche's service source, plus any read failures. */
export interface RealRouteResult {
  routes: Route[];
  /** Structured errors for manifest paths that could not be read (e.g. ENOENT). */
  errors: string[];
}

/** Read one service source file, returning its text or a structured error. */
function readServiceFile(rel: string, repoRoot: string): { source?: string; error?: string } {
  try {
    return { source: readFileSync(join(repoRoot, rel), 'utf8') };
  } catch {
    // A moved/renamed manifest path (ENOENT) must become a clean drift error,
    // not an unhandled crash — but it must still fail the check.
    return { error: `manifest service file missing: ${rel}` };
  }
}

/**
 * Read + extract the real routes backing a niche from its service source files.
 * A manifest path that cannot be read is surfaced as a structured error (rather
 * than throwing) so the CLI can report it through the normal drift channel.
 */
export function collectRealRoutes(manifest: ProductSpecManifest, repoRoot: string): RealRouteResult {
  const routes: Route[] = [];
  const errors: string[] = [];
  for (const rel of manifest.tsServices) {
    const { source, error } = readServiceFile(rel, repoRoot);
    if (error) errors.push(error);
    else routes.push(...extractRoutes(source ?? ''));
  }
  for (const rel of manifest.pyServices) {
    const { source, error } = readServiceFile(rel, repoRoot);
    if (error) errors.push(error);
    else routes.push(...extractPyRoutes(source ?? ''));
  }
  return { routes: dedupeRoutes(routes), errors };
}

/**
 * Build the full drift report for one niche: load + structurally validate its
 * spec, derive real routes from its services, and compare coverage.
 */
export function checkNiche(manifest: ProductSpecManifest, repoRoot: string): NicheReport {
  const doc = loadYaml<OpenApiDoc>(join(repoRoot, manifest.specPath));
  const specRoutes = resolveSpecFullPaths(doc);
  const { routes: realRoutes, errors: readErrors } = collectRealRoutes(manifest, repoRoot);
  // Fold missing-file errors into the structural list so hasDrift() trips and
  // the CLI surfaces them via its normal "DRIFT: ..." output instead of crashing.
  const structural = [...validateOpenApi(doc), ...readErrors];
  const coverage = compareCoverage(realRoutes, specRoutes);
  return {
    niche: manifest.niche,
    specPath: manifest.specPath,
    structural,
    realRoutes,
    specRoutes,
    coverage,
  };
}

/** Build drift reports for all 8 per-product specs. */
export function checkAllProducts(repoRoot: string): NicheReport[] {
  return PRODUCT_SPECS.map((m) => checkNiche(m, repoRoot));
}
