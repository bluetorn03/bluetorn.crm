/**
 * BLUETORN CRM — Master Audit Logging Engine
 *
 * Provides structured, append-only, secure audit logging across all CRM modules.
 * - Multi-tenant workspace scoped
 * - Strict credential and secret sanitization (zero password/token leakage)
 * - Captures actor, action, entity, status, change summary, and before/after diffs
 * - Fast and non-blocking
 */
import { execute, uuid } from "./db.ts";

export type AuditActionCategory =
  | "auth"
  | "team"
  | "lead"
  | "customer"
  | "property"
  | "finance"
  | "settings"
  | "chat";

export interface LogAuditEventInput {
  workspaceId?: string | null;
  actorId?: string | null;
  actorLabel?: string | null;
  action: string;
  status?: "success" | "failure" | "warning";
  entityType?: string | null;
  entityId?: string | null;
  summary?: string;
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
  changes?: Record<string, { from: any; to: any }> | null;
  metadata?: Record<string, any> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

const REDACTED_KEYS = new Set([
  "password",
  "password_hash",
  "passwordhash",
  "token",
  "access_token",
  "session_token",
  "secret",
  "session_secret",
  "api_key",
  "apikey",
  "credentials",
  "private_key",
  "jwt",
]);

/**
 * Recursively sanitizes objects to ensure zero secrets or passwords are recorded in audit logs.
 */
export function sanitizeAuditData<T>(val: T): T {
  if (val == null) return val;
  if (typeof val !== "object") return val;

  if (Array.isArray(val)) {
    return val.map((item) => sanitizeAuditData(item)) as unknown as T;
  }

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(val)) {
    const lowerKey = key.toLowerCase();
    if (REDACTED_KEYS.has(lowerKey) || lowerKey.includes("password") || lowerKey.includes("secret")) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeAuditData(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized as T;
}

/**
 * Computes meaningful differences between before and after object states.
 */
export function computeFieldDiff(
  before: Record<string, any> | null | undefined,
  after: Record<string, any> | null | undefined,
): Record<string, { from: any; to: any }> | null {
  if (!before || !after) return null;
  const diffs: Record<string, { from: any; to: any }> = {};

  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of allKeys) {
    if (key === "updated_at" || key === "created_at") continue;
    const b = before[key];
    const a = after[key];
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      diffs[key] = { from: b, to: a };
    }
  }

  return Object.keys(diffs).length > 0 ? diffs : null;
}

/**
 * Records an immutable audit log entry in MySQL.
 */
export async function recordAuditEvent(input: LogAuditEventInput): Promise<string> {
  const id = uuid();
  const status = input.status || "success";

  // Build metadata JSON payload safely
  const meta: Record<string, any> = {
    summary: input.summary || input.action,
    ...(input.metadata ? sanitizeAuditData(input.metadata) : {}),
  };

  if (input.before) {
    meta["before"] = sanitizeAuditData(input.before);
  }
  if (input.after) {
    meta["after"] = sanitizeAuditData(input.after);
  }
  if (input.changes) {
    meta["changes"] = sanitizeAuditData(input.changes);
  } else if (input.before && input.after) {
    const autoDiff = computeFieldDiff(input.before, input.after);
    if (autoDiff) {
      meta["changes"] = sanitizeAuditData(autoDiff);
    }
  }

  const metaJson = JSON.stringify(meta);

  try {
    await execute(
      `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, status, entity_type, entity_id, metadata, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.workspaceId ?? null,
        input.actorId ?? null,
        input.actorLabel ?? null,
        input.action,
        status,
        input.entityType ?? null,
        input.entityId ?? null,
        metaJson,
        input.ipAddress ?? null,
        input.userAgent ?? null,
      ],
    );
  } catch (err: any) {
    console.warn("[AuditLogger] Failed to write audit log entry:", err.message);
  }

  return id;
}
