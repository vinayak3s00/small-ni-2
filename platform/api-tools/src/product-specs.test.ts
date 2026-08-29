/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { validateOpenApi, loadYaml, type OpenApiDoc } from './validate';
import {
  extractRoutes,
  extractPyRoutes,
  resolveSpecFullPaths,
  serverBasePath,
  normalizePath,
  compareCoverage,
  checkNiche,
  checkAllProducts,
  PRODUCT_SPECS,
  type Route,
} from './product-specs';

const REPO = join(__dirname, '..', '..', '..');

describe('extractRoutes (Fastify TS)', () => {
  const src = `
    app.get('/healthz', async () => ({ status: 'ok' }));
    app.post('/v1/records', async (req, reply) => reply.code(201).send({}));
    app.get<{ Querystring: { stage?: string } }>('/v1/records', async () => []);
    app.get<{ Params: { recordId: string } }>(
      '/v1/attribution/:recordId',
      async (req) => ({}),
    );
    app.delete('/v1/records/:id', async () => ({}));
  `;

  it('extracts /v1 routes and excludes /healthz', () => {
    const routes = extractRoutes(src);
    expect(routes).toContainEqual({ method: 'post', path: '/v1/records' });
    expect(routes).toContainEqual({ method: 'get', path: '/v1/records' });
    expect(routes.some((r) => r.path === '/healthz')).toBe(false);
  });

  it("normalizes Fastify ':param' to OpenAPI '{param}'", () => {
    const routes = extractRoutes(src);
    expect(routes).toContainEqual({ method: 'get', path: '/v1/attribution/{recordId}' });
    expect(routes).toContainEqual({ method: 'delete', path: '/v1/records/{id}' });
  });
});

describe('extractPyRoutes (FastAPI Python)', () => {
  const src = `
    @app.get("/healthz")
    def healthz(): return {"status": "ok"}

    @app.post("/v1/calls/{call_id}/start")
    def start(call_id: str): ...

    @app.post("/v1/events")
    def event(): ...
  `;

  it('extracts @app routes and excludes /healthz', () => {
    const routes = extractPyRoutes(src);
    expect(routes).toContainEqual({ method: 'post', path: '/v1/calls/{call_id}/start' });
    expect(routes).toContainEqual({ method: 'post', path: '/v1/events' });
    expect(routes.some((r) => r.path === '/healthz')).toBe(false);
  });

  it('keeps snake_case params verbatim (normalization happens at compare time)', () => {
    const routes = extractPyRoutes(src);
    expect(routes.find((r) => r.path.includes('start'))?.path).toBe('/v1/calls/{call_id}/start');
  });
});

describe('serverBasePath / resolveSpecFullPaths', () => {
  const doc: OpenApiDoc = {
    openapi: '3.0.3',
    info: { title: 'X', version: '1.0.0' },
    paths: {
      '/records': { post: { responses: { '201': {} } }, get: { responses: { '200': {} } } },
      '/records/{id}/score': { get: { responses: { '200': {} } } },
    },
    components: { securitySchemes: { bearerAuth: {} } },
  };
  const withServer = { ...doc, servers: [{ url: 'https://verticals.abetworks.in/v1' }] };

  it('reads the /v1 base from the first server URL', () => {
    expect(serverBasePath(withServer as OpenApiDoc)).toBe('/v1');
  });

  it('treats a missing server as an empty base', () => {
    expect(serverBasePath(doc)).toBe('');
  });

  it('prefixes the /v1 base onto each relative spec path', () => {
    const routes = resolveSpecFullPaths(withServer as OpenApiDoc);
    expect(routes).toContainEqual({ method: 'post', path: '/v1/records' });
    expect(routes).toContainEqual({ method: 'get', path: '/v1/records' });
    expect(routes).toContainEqual({ method: 'get', path: '/v1/records/{id}/score' });
  });
});

describe('normalizePath (param-name-insensitive)', () => {
  it('treats {id} / {recordId} / {party_id} at the same position as equal', () => {
    expect(normalizePath('/v1/kyc/{id}')).toBe(normalizePath('/v1/kyc/{recordId}'));
    expect(normalizePath('/v1/retention/{partyId}/score')).toBe(
      normalizePath('/v1/retention/{party_id}/score'),
    );
  });

  it('does not collapse literal segments', () => {
    expect(normalizePath('/v1/kyc/{id}')).not.toBe(normalizePath('/v1/kyc/verify'));
  });
});

describe('compareCoverage', () => {
  it('detects a known missing route and a known stale spec path', () => {
    const realRoutes: Route[] = [
      { method: 'post', path: '/v1/records' },
      { method: 'get', path: '/v1/attribution/{recordId}' },
    ];
    const specRoutes: Route[] = [
      { method: 'post', path: '/v1/records' },
      { method: 'get', path: '/v1/records/{id}/score' },
    ];

    const { routesMissingFromSpec, stalePathsInSpec } = compareCoverage(realRoutes, specRoutes);

    // The attribution GET route is implemented but not documented.
    expect(routesMissingFromSpec).toEqual([
      { method: 'get', path: '/v1/attribution/{recordId}' },
    ]);
    // The score GET path is documented but has no backing route.
    expect(stalePathsInSpec).toEqual([{ method: 'get', path: '/v1/records/{id}/score' }]);
  });

  it('matches param-name-mismatched routes (spec {id} == real {recordId})', () => {
    const realRoutes: Route[] = [{ method: 'get', path: '/v1/attribution/{recordId}' }];
    const specRoutes: Route[] = [{ method: 'get', path: '/v1/attribution/{id}' }];
    const result = compareCoverage(realRoutes, specRoutes);
    expect(result.routesMissingFromSpec).toEqual([]);
    expect(result.stalePathsInSpec).toEqual([]);
  });
});

describe('all 8 real per-product specs are structurally valid', () => {
  for (const manifest of PRODUCT_SPECS) {
    it(`${manifest.niche} spec passes validateOpenApi`, () => {
      const doc = loadYaml<OpenApiDoc>(join(REPO, manifest.specPath));
      expect(validateOpenApi(doc)).toEqual([]);
    });
  }
});

describe('real-spec coverage integration (all 8 specs drift-free after FEAT-003)', () => {
  it('checkNiche returns coverage arrays for every niche', () => {
    for (const manifest of PRODUCT_SPECS) {
      const report = checkNiche(manifest, REPO);
      expect(Array.isArray(report.realRoutes)).toBe(true);
      expect(Array.isArray(report.specRoutes)).toBe(true);
      expect(Array.isArray(report.coverage.routesMissingFromSpec)).toBe(true);
      expect(Array.isArray(report.coverage.stalePathsInSpec)).toBe(true);
      // Real routes are derived from actual service source, so each niche has some.
      expect(report.realRoutes.length).toBeGreaterThan(0);
    }
  });

  it('every niche documents its real routes with zero drift in either direction', () => {
    for (const manifest of PRODUCT_SPECS) {
      const report = checkNiche(manifest, REPO);
      expect(report.coverage.routesMissingFromSpec).toEqual([]);
      expect(report.coverage.stalePathsInSpec).toEqual([]);
    }
  });

  it('checkAllProducts covers all 8 niches with zero total drift', () => {
    const reports = checkAllProducts(REPO);
    expect(reports).toHaveLength(8);
    // FEAT-003 reconciled every per-product spec against its services, so the
    // total drift across all 8 niches must now be exactly zero.
    const totalDrift = reports.reduce(
      (n, r) =>
        n + r.coverage.routesMissingFromSpec.length + r.coverage.stalePathsInSpec.length,
      0,
    );
    expect(totalDrift).toBe(0);
  });
});

/** Recursively collect every file path under `dir` whose name equals `leaf`. */
function walkForLeaf(dir: string, leaf: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    // Skip dependency + build dirs so the walk stays within source trees.
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walkForLeaf(full, leaf));
    } else if (entry === leaf) {
      out.push(full);
    }
  }
  return out;
}

describe('manifest completeness (fails loudly on forgotten wiring)', () => {
  // Every service source file under niche-plans/**/scaffolding/services/**/src
  // that registers at least one /v1 route MUST be referenced by some
  // PRODUCT_SPECS entry. This closes the "manifest fails open" gap: a new or
  // relocated service is caught here instead of being silently uncompared.
  const servicesRoot = join(REPO, 'niche-plans');
  const referenced = new Set<string>();
  for (const m of PRODUCT_SPECS) {
    for (const rel of [...m.tsServices, ...m.pyServices]) referenced.add(rel);
  }

  const tsFiles = walkForLeaf(servicesRoot, 'server.ts').filter((f) =>
    f.includes(join('scaffolding', 'services')),
  );
  const pyFiles = walkForLeaf(servicesRoot, 'app.py').filter((f) =>
    f.includes(join('scaffolding', 'services')),
  );

  for (const file of tsFiles) {
    const rel = relative(REPO, file);
    it(`TS service ${rel} with /v1 routes is in the manifest`, () => {
      const routes = extractRoutes(readFileSync(file, 'utf8'));
      if (routes.length === 0) return; // No /v1 surface -> manifest entry not required.
      expect(referenced.has(rel)).toBe(true);
    });
  }

  for (const file of pyFiles) {
    const rel = relative(REPO, file);
    it(`Python service ${rel} with /v1 routes is in the manifest`, () => {
      const routes = extractPyRoutes(readFileSync(file, 'utf8'));
      if (routes.length === 0) return; // No /v1 surface -> manifest entry not required.
      expect(referenced.has(rel)).toBe(true);
    });
  }
});

describe('checkNiche surfaces a missing manifest service file as structured drift', () => {
  it('yields a non-empty structural error (and does not throw) for a bogus path', () => {
    const bogus = {
      niche: 'bogus-niche',
      specPath: PRODUCT_SPECS[0].specPath,
      tsServices: ['niche-plans/does-not-exist/scaffolding/services/ghost/src/server.ts'],
      pyServices: [],
    };
    let report: ReturnType<typeof checkNiche> | undefined;
    expect(() => {
      report = checkNiche(bogus, REPO);
    }).not.toThrow();
    expect(report!.structural.length).toBeGreaterThan(0);
    expect(report!.structural.some((e) => e.startsWith('manifest service file missing:'))).toBe(
      true,
    );
  });
});
