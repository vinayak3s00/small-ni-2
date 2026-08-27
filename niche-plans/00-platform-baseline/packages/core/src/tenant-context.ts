import { AsyncLocalStorage } from 'node:async_hooks';
import type { Principal } from './types';

/**
 * Propagates the authenticated principal (and therefore tenant_id) through the
 * async call chain so every service/query runs under the correct tenant scope.
 * This is the foundation of the platform's multi-tenant isolation.
 */
const storage = new AsyncLocalStorage<Principal>();

export function runWithPrincipal<T>(principal: Principal, fn: () => T): T {
  return storage.run(principal, fn);
}

export function getPrincipal(): Principal {
  const p = storage.getStore();
  if (!p) {
    throw new Error('No tenant context: getPrincipal() called outside runWithPrincipal()');
  }
  return p;
}

export function getTenantId(): string {
  return getPrincipal().tenantId;
}

export function hasRole(role: string): boolean {
  return getPrincipal().roles.includes(role);
}
