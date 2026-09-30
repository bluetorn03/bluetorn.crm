/**
 * BLUETORN CRM — Team Chat Retention & Scheduled Cleanup Engine
 *
 * Server-side only. Runs batch deletion of expired messages from MySQL.
 * - Idempotent
 * - Efficient (uses indexed `expires_at`)
 * - Batch deletion safe for large message counts
 * - NEVER touches audit logs or other CRM tables
 */
import { execute, queryOne } from "./db.ts";

export interface CleanupResult {
  deletedCount: number;
  durationMs: number;
  timestamp: string;
}

/**
 * Deletes all chat messages whose `expires_at <= NOW()`.
 * Uses batch deletion with LIMIT to avoid locking the MySQL table during high load.
 */
export async function cleanupExpiredChatMessages(batchSize = 1000): Promise<CleanupResult> {
  const start = Date.now();
  let totalDeleted = 0;

  try {
    while (true) {
      // Indexed by idx_chat_msg_expires
      const result = await execute(
        "DELETE FROM chat_messages WHERE expires_at <= NOW() LIMIT ?",
        [batchSize],
      );

      const count = result.affectedRows ?? 0;
      totalDeleted += count;

      // If fewer rows than batchSize were deleted, all expired records have been cleaned up
      if (count < batchSize) {
        break;
      }
    }

    const durationMs = Date.now() - start;
    if (totalDeleted > 0) {
      console.log(
        `[Chat Retention Cleanup] Deleted ${totalDeleted} expired messages in ${durationMs}ms.`,
      );
    }

    return {
      deletedCount: totalDeleted,
      durationMs,
      timestamp: new Date().toISOString(),
    };
  } catch (err: any) {
    console.error("[Chat Retention Cleanup] Error during cleanup:", err);
    throw err;
  }
}

/**
 * Re-evaluates message expiry when a workspace retention policy is reduced.
 * When retention is reduced (e.g., 15 days -> 7 days), existing messages in that
 * workspace older than 7 days immediately become eligible for deletion.
 */
export async function applyRetentionReduction(
  workspaceId: string,
  newRetentionDays: number,
): Promise<{ updatedMessages: number; deletedExpired: number }> {
  // 1. Adjust expires_at for messages where created_at + newDays is sooner than current expires_at
  const updateRes = await execute(
    `UPDATE chat_messages 
     SET expires_at = DATE_ADD(created_at, INTERVAL ? DAY)
     WHERE workspace_id = ? 
       AND DATE_ADD(created_at, INTERVAL ? DAY) < expires_at`,
    [newRetentionDays, workspaceId, newRetentionDays],
  );

  const updatedMessages = updateRes.affectedRows ?? 0;

  // 2. Immediately delete messages that are now expired
  const deleteRes = await execute(
    "DELETE FROM chat_messages WHERE workspace_id = ? AND expires_at <= NOW()",
    [workspaceId],
  );

  const deletedExpired = deleteRes.affectedRows ?? 0;

  console.log(
    `[Retention Reduction] Workspace ${workspaceId} set to ${newRetentionDays} days. Updated ${updatedMessages} messages, deleted ${deletedExpired} now-expired messages.`,
  );

  return { updatedMessages, deletedExpired };
}
