/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

/**
 * Lightweight OpenAPI structural validation + gateway route-drift guard.
 * Deliberately dependency-light (no full JSON-schema validator): it checks the
 * invariants that actually matter for us and, crucially, that the aggregated
 * spec stays in sync with the gateway route table — the thing most likely to
 * rot as endpoints are added.
 */

export interface OpenApiDoc {
  openapi?: string;
  info?: { title?: string; version?: string };
  paths?: Record<string, Record<string, unknown>>;
  components?: { securitySchemes?: Record<string, unknown> };
}

export interface GatewayRoute {
  path: string;
  service: string;
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

export function loadYaml<T = unknown>(file: string): T {
  return parse(readFileSync(file, 'utf8')) as T;
}

/** Validate the structural invariants of an OpenAPI 3.0 document. */
export function validateOpenApi(doc: OpenApiDoc): string[] {
  const errors: string[] = [];
  if (!doc.openapi || !doc.openapi.startsWith('3.')) errors.push('openapi must be a 3.x version');
  if (!doc.info?.title) errors.push('info.title is required');
  if (!doc.info?.version) errors.push('info.version is required');
  if (!doc.paths || Object.keys(doc.paths).length === 0) errors.push('at least one path is required');

  for (const [p, item] of Object.entries(doc.paths ?? {})) {
    if (!p.startsWith('/')) errors.push(`path "${p}" must start with "/"`);
    const ops = Object.keys(item).filter((k) => HTTP_METHODS.includes(k));
    if (ops.length === 0) errors.push(`path "${p}" has no HTTP operations`);
    for (const m of ops) {
      const op = (item as Record<string, { responses?: unknown }>)[m];
      if (!op?.responses || Object.keys(op.responses as object).length === 0) {
        errors.push(`operation ${m.toUpperCase()} ${p} has no responses`);
      }
    }
  }

  if (!doc.components?.securitySchemes || Object.keys(doc.components.securitySchemes).length === 0) {
    errors.push('components.securitySchemes must define at least one scheme');
  }
  return errors;
}

/** Extract the gateway route prefixes from the abet-gateway values file. */
export function gatewayPrefixes(values: { routes?: GatewayRoute[] }): string[] {
  return (values.routes ?? []).map((r) => r.path);
}

/**
 * Drift guard: every gateway route prefix must be covered by at least one path
 * in the spec (a spec path either equals the prefix or is a sub-path of it,
 * e.g. prefix /v1/attribution covers /v1/attribution/events and /{recordId}).
 * Returns the prefixes that are NOT documented.
 */
export function undocumentedPrefixes(specPaths: string[], prefixes: string[]): string[] {
  return prefixes.filter(
    (prefix) => !specPaths.some((sp) => sp === prefix || sp.startsWith(prefix + '/')),
  );
}
