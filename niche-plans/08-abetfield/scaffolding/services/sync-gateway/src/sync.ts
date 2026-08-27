/*
 * Copyright (c) 2026 Abetworks (abetworks.in). All rights reserved.
 * Abetworks Proprietary and Confidential. Unauthorized copying, distribution,
 * or use of this file, via any medium, is strictly prohibited.
 * See the LICENSE file at the repository root. Contact: legal@abetworks.in
 */

import { getTenantId } from '@abetworks/core';

/**
 * AbetField offline-first sync. Reliability guarantees from the plan:
 *   * Idempotent replay: every mutation carries a client-generated id; replays
 *     are safe (applied-once) — durable across restarts in the Postgres store.
 *   * Deterministic per-entity conflict resolution:
 *       - visit          -> append-only (never overwritten)
 *       - stock_position -> server-authoritative (server wins on conflict)
 *       - field_order    -> last-writer-wins by client timestamp
 *
 * Two implementations satisfy SyncStore: an in-memory engine (tests/dev) and a
 * PostgreSQL-backed engine (see pg-sync.ts) with a durable, append-only op-log.
 */

export type Entity = 'visit' | 'field_order' | 'stock_position';
export type Op = 'create' | 'update';

export interface Mutation {
  clientMutationId: string;
  entity: Entity;
  op: Op;
  payload: Record<string, any>; // must contain `id` and (for LWW) `updatedAt`
}

export interface SyncResult {
  applied: string[];
  duplicates: string[];
  conflicts: { clientMutationId: string; resolution: string }[];
  newOpId: string;
}

export interface StoredRow {
  id: string;
  entity: Entity;
  data: Record<string, any>;
  updatedAt: string;
}

export interface SyncStore {
  sync(mutations: Mutation[]): Promise<SyncResult>;
  getRow(entity: Entity, id: string): Promise<StoredRow | undefined>;
}

/** The key a mutation writes to. Visits are append-only, keyed by mutation id. */
export function rowKeyFor(m: Mutation): string {
  return m.entity === 'visit' ? m.clientMutationId : String(m.payload.id);
}

export interface Decision {
  write: boolean;
  resolution: string; // 'applied' or a conflict label
}

/**
 * Pure per-entity conflict decision given the current stored row (if any) and
 * the incoming mutation's effective timestamp. Shared by both stores.
 */
export function decide(m: Mutation, existing: StoredRow | undefined, now: string): Decision {
  switch (m.entity) {
    case 'visit':
      // Append-only: always write (unique key = clientMutationId).
      return { write: true, resolution: 'applied' };
    case 'stock_position':
      // Server-authoritative: keep the server's row if one exists.
      return existing
        ? { write: false, resolution: 'server_authoritative_kept' }
        : { write: true, resolution: 'applied' };
    case 'field_order':
    default:
      // Last-writer-wins by client timestamp.
      return existing && existing.updatedAt >= now
        ? { write: false, resolution: 'lww_existing_newer' }
        : { write: true, resolution: 'applied' };
  }
}

/** In-memory offline-sync engine (unit tests / dev). */
export class SyncEngine implements SyncStore {
  private applied = new Map<string, Set<string>>();
  private rows = new Map<string, Map<string, StoredRow>>();
  private opCounter = 0;

  private appliedSet(tenantId: string): Set<string> {
    if (!this.applied.has(tenantId)) this.applied.set(tenantId, new Set());
    return this.applied.get(tenantId)!;
  }
  private rowMap(tenantId: string): Map<string, StoredRow> {
    if (!this.rows.has(tenantId)) this.rows.set(tenantId, new Map());
    return this.rows.get(tenantId)!;
  }

  async sync(mutations: Mutation[]): Promise<SyncResult> {
    const tenantId = getTenantId();
    const appliedIds = this.appliedSet(tenantId);
    const store = this.rowMap(tenantId);
    const result: SyncResult = { applied: [], duplicates: [], conflicts: [], newOpId: '' };

    for (const m of mutations) {
      if (appliedIds.has(m.clientMutationId)) {
        result.duplicates.push(m.clientMutationId);
        continue;
      }
      const now = m.payload.updatedAt ?? new Date().toISOString();
      const key = `${m.entity}:${rowKeyFor(m)}`;
      const decision = decide(m, store.get(key), now);
      if (decision.write) {
        store.set(key, { id: String(m.payload.id), entity: m.entity, data: m.payload, updatedAt: now });
      }
      appliedIds.add(m.clientMutationId);
      result.applied.push(m.clientMutationId);
      if (decision.resolution !== 'applied') {
        result.conflicts.push({ clientMutationId: m.clientMutationId, resolution: decision.resolution });
      }
    }
    result.newOpId = `op-${++this.opCounter}`;
    return result;
  }

  async getRow(entity: Entity, id: string): Promise<StoredRow | undefined> {
    return this.rowMap(getTenantId()).get(`${entity}:${id}`);
  }
}
