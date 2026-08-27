import type { AuditAction, AuditEvent } from './types';
import { getPrincipal } from './tenant-context';

export interface AuditSink {
  write(event: AuditEvent): Promise<void>;
}

/**
 * Append-only audit logger. Baseline requires that reads, writes, and exports
 * are all logged; the sink mirrors to WORM (S3 Object Lock) downstream.
 */
export class AuditLogger {
  constructor(private readonly sink: AuditSink) {}

  async record(
    action: AuditAction,
    entity: string,
    entityId: string,
    fields?: string[],
  ): Promise<void> {
    const principal = getPrincipal();
    const event: AuditEvent = {
      tenantId: principal.tenantId,
      actor: principal.sub,
      action,
      entity,
      entityId,
      fields,
      at: new Date().toISOString(),
    };
    await this.sink.write(event);
  }
}

/** In-memory sink for local dev/tests; production uses Kafka -> Postgres + S3 WORM. */
export class InMemoryAuditSink implements AuditSink {
  public readonly events: AuditEvent[] = [];
  async write(event: AuditEvent): Promise<void> {
    this.events.push(event);
  }
}
