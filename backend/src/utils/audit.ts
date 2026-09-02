import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export function recordAudit(
  db: Database.Database,
  input: {
    userId?: string;
    action: string;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
  },
): void {
  db.prepare(
    `
    INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, before_json, after_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    randomUUID(),
    input.userId ?? null,
    input.action,
    input.entityType,
    input.entityId,
    input.before === undefined ? null : JSON.stringify(input.before),
    input.after === undefined ? null : JSON.stringify(input.after),
  );
}
