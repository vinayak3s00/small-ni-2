import { getTenantId } from '@abetworks/core';

/**
 * AbetField offline-first sync. Reliability guarantees from the plan:
 *   * Idempotent replay: every mutation carries a client-generated id; replays
 *     are safe (applied-once).
 *   * Deterministic per-entity conflict resolution:
 *       - visit          -> append-only (never overwritten)
 *       - stock_position -> server-authoritative (server wins on conflict)
 *       - field_order    -> last-writer-wins by client timestamp
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
  applied: string[]; // clientMutationIds newly applied
  duplicates: string[]; // ignored (already applied)
  conflicts: { clientMutationId: string; resolution: string }[];
  newOpId: string;
}

interface StoredRow {
  id: string;
  entity: Entity;
  data: Record<string, any>;
  updatedAt: string;
}

export class SyncEngine {
  // tenant -> set of applied client mutation ids (idempotency)
  private applied = new Map<string, Set<string>>();
  // tenant -> entity:id -> row
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

  sync(mutations: Mutation[]): SyncResult {
    const tenantId = getTenantId();
    const appliedIds = this.appliedSet(tenantId);
    const store = this.rowMap(tenantId);

    const result: SyncResult = {
      applied: [],
      duplicates: [],
      conflicts: [],
      newOpId: '',
    };

    for (const m of mutations) {
      if (appliedIds.has(m.clientMutationId)) {
        result.duplicates.push(m.clientMutationId); // idempotent replay
        continue;
      }

      const key = `${m.entity}:${m.payload.id}`;
      const existing = store.get(key);
      const resolution = this.resolve(m, existing, store, key);

      appliedIds.add(m.clientMutationId);
      result.applied.push(m.clientMutationId);
      if (resolution !== 'applied') {
        result.conflicts.push({ clientMutationId: m.clientMutationId, resolution });
      }
    }

    result.newOpId = `op-${++this.opCounter}`;
    return result;
  }

  /** Returns 'applied' or a conflict-resolution label. */
  private resolve(
    m: Mutation,
    existing: StoredRow | undefined,
    store: Map<string, StoredRow>,
    key: string,
  ): string {
    const now = m.payload.updatedAt ?? new Date().toISOString();

    switch (m.entity) {
      case 'visit': {
        // Append-only: visits are immutable field records. Always store; never overwrite.
        const visitKey = `visit:${m.clientMutationId}`;
        store.set(visitKey, { id: m.payload.id, entity: 'visit', data: m.payload, updatedAt: now });
        return 'applied';
      }
      case 'stock_position': {
        // Server-authoritative: if a row already exists, the server value wins.
        if (existing) return 'server_authoritative_kept';
        store.set(key, { id: m.payload.id, entity: m.entity, data: m.payload, updatedAt: now });
        return 'applied';
      }
      case 'field_order':
      default: {
        // Last-writer-wins by client timestamp.
        if (existing && existing.updatedAt >= now) return 'lww_existing_newer';
        store.set(key, { id: m.payload.id, entity: m.entity, data: m.payload, updatedAt: now });
        return 'applied';
      }
    }
  }

  // Test/inspection helper.
  getRow(entity: Entity, id: string): StoredRow | undefined {
    return this.rowMap(getTenantId()).get(`${entity}:${id}`);
  }
}
