/**
 * BLUETORN CRM — Centralized Retention & Maintenance Cleanup Engine
 *
 * Server-side only. Safely and idempotently enforces retention policies:
 * 1. Team Chat messages (expires_at <= UTC_TIMESTAMP(), max 15 days default)
 * 2. Workspace Audit logs (older than workspace audit_retention_days, default 180 days)
 * 3. Read notifications (older than 30 days)
 * 4. Unread notifications (older than 90 days)
 * 5. Safe orphaned uploaded media
 *
 * SAFETY INVARIANTS:
 * - NEVER automatically deletes active business records (leads, customers, properties, invoices, payments)
 * - NEVER deletes files currently referenced by active database records
 * - Uses bounded batches (LIMIT 1000) to prevent MySQL table locks
 * - Observable execution metrics with duration and deletion counts
 */
import fs from "fs";
import path from "path";
import { execute, query, queryOne } from "./db.ts";

export interface CentralizedCleanupSummary {
  chatMessagesDeleted: number;
  auditLogsPurged: number;
  readNotificationsPurged: number;
  unreadNotificationsPurged: number;
  orphanedFilesCleaned: number;
  durationMs: number;
  timestamp: string;
}

export interface WorkspaceStorageBreakdown {
  workspaceId: string;
  propertyCount: number;
  propertyMediaCount: number;
  customerCount: number;
  leadCount: number;
  invoiceCount: number;
  paymentCount: number;
  chatMessageCount: number;
  auditLogCount: number;
  notificationCount: number;
  estimatedStorageBytes: number;
  estimatedStorageFormatted: string;
}

/**
 * Runs the master centralized retention and cleanup service.
 */
export async function runCentralizedCleanup(options: {
  workspaceId?: string;
  batchSize?: number;
} = {}): Promise<CentralizedCleanupSummary> {
  const startTime = Date.now();
  const batchSize = Math.min(options.batchSize ?? 1000, 5000);

  let chatMessagesDeleted = 0;
  let auditLogsPurged = 0;
  let readNotificationsPurged = 0;
  let unreadNotificationsPurged = 0;
  let orphanedFilesCleaned = 0;

  try {
    // ------------------------------------------------------------------------
    // 1. CHAT MESSAGES: Bounded batch deletion of expired messages
    // ------------------------------------------------------------------------
    while (true) {
      const chatCondition = options.workspaceId
        ? "WHERE workspace_id = ? AND expires_at <= UTC_TIMESTAMP()"
        : "WHERE expires_at <= UTC_TIMESTAMP()";
      const params = options.workspaceId ? [options.workspaceId, batchSize] : [batchSize];

      const res = await execute(
        `DELETE FROM chat_messages ${chatCondition} LIMIT ?`,
        params,
      );
      const count = res.affectedRows ?? 0;
      chatMessagesDeleted += count;
      if (count < batchSize) break;
    }

    // ------------------------------------------------------------------------
    // 2. AUDIT LOGS: Purge expired audit logs based on workspace retention policy
    // Default: 180 days (options: 90, 180, 365, 730)
    // ------------------------------------------------------------------------
    const workspacesToProcess = options.workspaceId
      ? await query<{ id: string; audit_retention_days: number | null }>(
          "SELECT id, audit_retention_days FROM workspaces WHERE id = ?",
          [options.workspaceId],
        )
      : await query<{ id: string; audit_retention_days: number | null }>(
          "SELECT id, audit_retention_days FROM workspaces",
        );

    for (const ws of workspacesToProcess) {
      const retentionDays = Number(ws.audit_retention_days) || 180;
      while (true) {
        const res = await execute(
          `DELETE FROM audit_logs
           WHERE workspace_id = ? AND created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
           LIMIT ?`,
          [ws.id, retentionDays, batchSize],
        );
        const count = res.affectedRows ?? 0;
        auditLogsPurged += count;
        if (count < batchSize) break;
      }
    }

    // Platform-level audit logs without workspace_id (retain 180 days)
    if (!options.workspaceId) {
      while (true) {
        const res = await execute(
          `DELETE FROM audit_logs
           WHERE workspace_id IS NULL AND created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 180 DAY)
           LIMIT ?`,
          [batchSize],
        );
        const count = res.affectedRows ?? 0;
        auditLogsPurged += count;
        if (count < batchSize) break;
      }
    }

    // ------------------------------------------------------------------------
    // 3. NOTIFICATIONS: Read notifications (max 30 days) & Unread (max 90 days)
    // ------------------------------------------------------------------------
    const wsNotificationCondition = options.workspaceId ? "workspace_id = ? AND " : "";
    const wsNotificationParam = options.workspaceId ? [options.workspaceId] : [];

    // 3a. Read notifications older than 30 days
    while (true) {
      const res = await execute(
        `DELETE FROM notifications
         WHERE ${wsNotificationCondition}is_read = 1 AND created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)
         LIMIT ?`,
        [...wsNotificationParam, batchSize],
      );
      const count = res.affectedRows ?? 0;
      readNotificationsPurged += count;
      if (count < batchSize) break;
    }

    // 3b. Unread notifications older than 90 days
    while (true) {
      const res = await execute(
        `DELETE FROM notifications
         WHERE ${wsNotificationCondition}created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 90 DAY)
         LIMIT ?`,
        [...wsNotificationParam, batchSize],
      );
      const count = res.affectedRows ?? 0;
      unreadNotificationsPurged += count;
      if (count < batchSize) break;
    }

    // ------------------------------------------------------------------------
    // 4. SAFE ORPHANED MEDIA: Verify active database references before cleanup
    // ------------------------------------------------------------------------
    try {
      const uploadsDir = path.resolve(process.cwd(), "public", "uploads");
      if (fs.existsSync(uploadsDir)) {
        const files = fs.readdirSync(uploadsDir);
        // Only run orphan check if files exist and not in workspace-specific mode
        if (files.length > 0 && !options.workspaceId) {
          // Query active media URLs from database
          const [propImages, profileAvatars, wsLogos, promoImages] = await Promise.all([
            query<{ image_url: string }>("SELECT image_url FROM properties WHERE image_url IS NOT NULL"),
            query<{ avatar_url: string }>("SELECT avatar_url FROM profiles WHERE avatar_url IS NOT NULL"),
            query<{ logo_url: string }>("SELECT logo_url FROM workspaces WHERE logo_url IS NOT NULL"),
            query<{ image_url: string }>("SELECT image_url FROM promo_media WHERE image_url IS NOT NULL"),
          ]);

          const activeReferences = new Set<string>();
          for (const row of [...propImages, ...profileAvatars, ...wsLogos, ...promoImages]) {
            const url = (row as any).image_url || (row as any).avatar_url || (row as any).logo_url;
            if (url) {
              const basename = path.basename(url);
              activeReferences.add(basename);
            }
          }

          const now = Date.now();
          const ONE_DAY_MS = 24 * 60 * 60 * 1000;

          for (const file of files) {
            // Never delete files uploaded within the last 24 hours (temporary upload grace period)
            const filePath = path.join(uploadsDir, file);
            const stat = fs.statSync(filePath);
            if (now - stat.mtimeMs < ONE_DAY_MS) continue;

            if (!activeReferences.has(file)) {
              try {
                fs.unlinkSync(filePath);
                orphanedFilesCleaned++;
              } catch {}
            }
          }
        }
      }
    } catch (mediaErr) {
      console.warn("[CentralizedCleanup] Orphan media check skipped:", mediaErr);
    }

    const durationMs = Date.now() - startTime;
    console.log(
      `[CentralizedCleanup] Completed in ${durationMs}ms: ` +
        `${chatMessagesDeleted} chat msgs, ${auditLogsPurged} audit logs, ` +
        `${readNotificationsPurged} read notifs, ${unreadNotificationsPurged} unread notifs, ` +
        `${orphanedFilesCleaned} orphaned files.`,
    );

    return {
      chatMessagesDeleted,
      auditLogsPurged,
      readNotificationsPurged,
      unreadNotificationsPurged,
      orphanedFilesCleaned,
      durationMs,
      timestamp: new Date().toISOString(),
    };
  } catch (err: any) {
    console.error("[CentralizedCleanup] Error during retention cleanup:", err);
    throw err;
  }
}

/**
 * Calculates current workspace storage usage and resource breakdown.
 */
export async function getWorkspaceStorageUsage(
  workspaceId: string,
): Promise<WorkspaceStorageBreakdown> {
  const [
    propRow,
    custRow,
    leadRow,
    invRow,
    payRow,
    chatRow,
    auditRow,
    notifRow,
  ] = await Promise.all([
    queryOne<{ count: number; media_count: number }>(
      "SELECT COUNT(*) as count, SUM(CASE WHEN image_url IS NOT NULL AND image_url != '' THEN 1 ELSE 0 END) as media_count FROM properties WHERE workspace_id = ?",
      [workspaceId],
    ),
    queryOne<{ count: number }>("SELECT COUNT(*) as count FROM customers WHERE workspace_id = ?", [workspaceId]),
    queryOne<{ count: number }>("SELECT COUNT(*) as count FROM leads WHERE workspace_id = ?", [workspaceId]),
    queryOne<{ count: number }>("SELECT COUNT(*) as count FROM invoices WHERE workspace_id = ?", [workspaceId]),
    queryOne<{ count: number }>("SELECT COUNT(*) as count FROM payments WHERE workspace_id = ?", [workspaceId]),
    queryOne<{ count: number }>("SELECT COUNT(*) as count FROM chat_messages WHERE workspace_id = ?", [workspaceId]),
    queryOne<{ count: number }>("SELECT COUNT(*) as count FROM audit_logs WHERE workspace_id = ?", [workspaceId]),
    queryOne<{ count: number }>("SELECT COUNT(*) as count FROM notifications WHERE workspace_id = ?", [workspaceId]),
  ]);

  const propertyCount = Number(propRow?.count || 0);
  const propertyMediaCount = Number(propRow?.media_count || 0);
  const customerCount = Number(custRow?.count || 0);
  const leadCount = Number(leadRow?.count || 0);
  const invoiceCount = Number(invRow?.count || 0);
  const paymentCount = Number(payRow?.count || 0);
  const chatMessageCount = Number(chatRow?.count || 0);
  const auditLogCount = Number(auditRow?.count || 0);
  const notificationCount = Number(notifRow?.count || 0);

  // Estimate storage: ~250KB per media asset, ~2KB per structured business record
  const mediaBytes = propertyMediaCount * 250 * 1024;
  const dbBytes =
    (propertyCount + customerCount + leadCount + invoiceCount + paymentCount + chatMessageCount + auditLogCount + notificationCount) *
    2048;
  const totalBytes = mediaBytes + dbBytes;

  const formatted =
    totalBytes > 1024 * 1024 * 1024
      ? `${(totalBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
      : totalBytes > 1024 * 1024
        ? `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.round(totalBytes / 1024)} KB`;

  return {
    workspaceId,
    propertyCount,
    propertyMediaCount,
    customerCount,
    leadCount,
    invoiceCount,
    paymentCount,
    chatMessageCount,
    auditLogCount,
    notificationCount,
    estimatedStorageBytes: totalBytes,
    estimatedStorageFormatted: formatted,
  };
}
