/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import {
  validateOpenApi,
  undocumentedPrefixes,
  gatewayPrefixes,
  loadYaml,
  type OpenApiDoc,
  type GatewayRoute,
} from './validate';

const REPO = join(__dirname, '..', '..', '..');

describe('validateOpenApi', () => {
  const good: OpenApiDoc = {
    openapi: '3.0.3',
    info: { title: 'X', version: '1.0.0' },
    paths: { '/a': { get: { responses: { '200': {} } } } },
    components: { securitySchemes: { bearerAuth: {} } },
  };

  it('passes a well-formed doc', () => {
    expect(validateOpenApi(good)).toEqual([]);
  });

  it('flags a non-3.x version', () => {
    expect(validateOpenApi({ ...good, openapi: '2.0' })).toContain('openapi must be a 3.x version');
  });

  it('flags a path with no operations', () => {
    const doc = { ...good, paths: { '/a': {} } };
    expect(validateOpenApi(doc).some((e) => e.includes('no HTTP operations'))).toBe(true);
  });

  it('flags an operation with no responses', () => {
    const doc = { ...good, paths: { '/a': { get: {} } } };
    expect(validateOpenApi(doc).some((e) => e.includes('has no responses'))).toBe(true);
  });

  it('requires a security scheme', () => {
    const doc = { ...good, components: {} };
    expect(validateOpenApi(doc).some((e) => e.includes('securitySchemes'))).toBe(true);
  });
});

describe('undocumentedPrefixes (drift guard)', () => {
  it('treats sub-paths as covering a prefix', () => {
    const specPaths = ['/v1/attribution/events', '/v1/attribution/{recordId}', '/v1/kyc'];
    const prefixes = ['/v1/attribution', '/v1/kyc'];
    expect(undocumentedPrefixes(specPaths, prefixes)).toEqual([]);
  });

  it('reports an uncovered prefix', () => {
    expect(undocumentedPrefixes(['/v1/kyc'], ['/v1/kyc', '/v1/orders'])).toEqual(['/v1/orders']);
  });
});

describe('repo spec is valid and covers every gateway route', () => {
  it('the shipped openapi.yaml is structurally valid', () => {
    const doc = loadYaml<OpenApiDoc>(join(REPO, 'platform/api/openapi.yaml'));
    expect(validateOpenApi(doc)).toEqual([]);
  });

  it('every gateway route prefix is documented in the spec', () => {
    const doc = loadYaml<OpenApiDoc>(join(REPO, 'platform/api/openapi.yaml'));
    const values = loadYaml<{ routes?: GatewayRoute[] }>(
      join(REPO, 'platform/helm/abet-gateway/values.yaml'),
    );
    const missing = undocumentedPrefixes(Object.keys(doc.paths ?? {}), gatewayPrefixes(values));
    expect(missing).toEqual([]);
  });
});
