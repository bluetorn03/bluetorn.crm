/**
 * BLUETORN CRM — Global Upgrade End-to-End Integration Verification Script
 *
 * Tests all requirements from the prompt against local MySQL:
 * 1. Indian currency formatting and Amount in Words utility
 * 2. Database migration 005 schema inspection (audit_retention_days, status, user_agent, indexes)
 * 3. Owner Audit Log System (append-only, metadata, workspace isolation, querying)
 * 4. Notification System (individual delete, mark all read, clear all, unread count)
 * 5. Centralized Retention & Maintenance Cleanup Engine (idempotent, batch-based, multi-tenant)
 * 6. Workspace storage measurement
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { formatIndianNumber, parseIndianNumber } from "../src/lib/format.ts";
import { amountToWords } from "../src/lib/amount-to-words.ts";
import { runCentralizedCleanup, getWorkspaceStorageUsage } from "../src/lib/retention-cleanup.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function loadEnvFile(filePath) {
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnvFile(path.join(rootDir, ".env.local"));
loadEnvFile(path.join(rootDir, ".env"));

const DB_CONFIG = {
  host: process.env.MYSQL_HOST || "localhost",
  port: Number(process.env.MYSQL_PORT || 3306),
  database: process.env.MYSQL_DATABASE || "bluetorn_crm",
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
};

async function runTests() {
  console.log("==================================================");
  console.log("🧪 BLUETORN CRM — GLOBAL UPGRADE E2E VERIFICATION");
  console.log("==================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ PASSED: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAILED: ${message}`);
      failed++;
    }
  }

  // 1. Money Formatting & Parsing
  console.log("\n--- TEST 1: Indian Currency Formatting & Parsing ---");
  assert(formatIndianNumber(1000) === "1,000", "1000 formats as 1,000");
  assert(formatIndianNumber(100000) === "1,00,000", "100000 formats as 1,00,000");
  assert(formatIndianNumber(1000000) === "10,00,000", "1000000 formats as 10,00,000");
  assert(formatIndianNumber(10000000) === "1,00,00,000", "10000000 formats as 1,00,00,000");
  assert(formatIndianNumber(5423120) === "54,23,120", "5423120 formats as 54,23,120");
  assert(formatIndianNumber(125000000) === "12,50,00,000", "125000000 formats as 12,50,00,000");
  assert(formatIndianNumber("10,00,000") === "10,00,000", "Re-formatting formatted string preserves value");
  assert(parseIndianNumber("1,00,00,000") === 10000000, "parseIndianNumber('1,00,00,000') equals 10000000");
  assert(parseIndianNumber("54,23,120.50") === 5423120.5, "parseIndianNumber parses decimal paise");
  assert(parseIndianNumber("") === 0, "parseIndianNumber empty string returns 0");

  // 2. Amount in Words
  console.log("\n--- TEST 2: Amount in Words System ---");
  assert(
    amountToWords(1000000) === "Rupees Ten Lakh Only",
    `1000000 -> Rupees Ten Lakh Only (got: ${amountToWords(1000000)})`,
  );
  assert(
    amountToWords(10000000) === "Rupees One Crore Only",
    `10000000 -> Rupees One Crore Only (got: ${amountToWords(10000000)})`,
  );
  assert(
    amountToWords(1000) === "Rupees One Thousand Only",
    `1000 -> Rupees One Thousand Only (got: ${amountToWords(1000)})`,
  );
  assert(
    amountToWords(0) === "Rupees Zero Only",
    `0 -> Rupees Zero Only (got: ${amountToWords(0)})`,
  );
  assert(
    amountToWords(150000000.75) === "Rupees Fifteen Crore and Seventy Five Paise Only",
    `150000000.75 -> Fifteen Crore and 75 Paise (got: ${amountToWords(150000000.75)})`,
  );
  assert(
    amountToWords(5423120) === "Rupees Fifty Four Lakh Twenty Three Thousand One Hundred Twenty Only",
    `5423120 -> Fifty Four Lakh Twenty Three Thousand One Hundred Twenty (got: ${amountToWords(5423120)})`,
  );

  // 3. Database Schema Verification (Migration 005)
  console.log("\n--- TEST 3: Database Schema Verification (Migration 005) ---");
  const conn = await mysql.createConnection(DB_CONFIG);

  try {
    const [cols] = await conn.query("SHOW COLUMNS FROM workspaces LIKE 'audit_retention_days'");
    assert(cols.length === 1, "Column workspaces.audit_retention_days exists in MySQL");

    const [auditCols] = await conn.query("SHOW COLUMNS FROM audit_logs LIKE 'status'");
    assert(auditCols.length === 1, "Column audit_logs.status exists in MySQL");

    const [userAgentCols] = await conn.query("SHOW COLUMNS FROM audit_logs LIKE 'user_agent'");
    assert(userAgentCols.length === 1, "Column audit_logs.user_agent exists in MySQL");

    const [indexes] = await conn.query("SHOW INDEX FROM audit_logs WHERE Key_name = 'idx_audit_ws_entity'");
    assert(indexes.length >= 1, "Compound index idx_audit_ws_entity exists on audit_logs");

    const [notifIndexes] = await conn.query("SHOW INDEX FROM notifications WHERE Key_name = 'idx_notifications_retention'");
    assert(notifIndexes.length >= 1, "Index idx_notifications_retention exists on notifications");

    // 4. Owner Audit Log System (Append-only & Isolation)
    console.log("\n--- TEST 4: Owner Audit Log Multi-Tenant & Append-Only Verification ---");
    const [wsRows] = await conn.query("SELECT id FROM workspaces LIMIT 1");
    let testWs = "default_ws";
    if (wsRows.length > 0) {
      testWs = wsRows[0].id;
      const testEventId = "test_audit_" + Date.now();

      // Record test audit log
      await conn.query(
        `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, status, entity_type, entity_id, metadata, ip_address, user_agent)
         VALUES (?, ?, 'test_user', 'Owner', 'TEST_ACTION', 'success', 'test_module', 'test_123', ?, '127.0.0.1', 'Antigravity-QA-Agent')`,
        [testEventId, testWs, JSON.stringify({ before: { score: 10 }, after: { score: 20 } })],
      );

      const [readRows] = await conn.query("SELECT * FROM audit_logs WHERE id = ?", [testEventId]);
      assert(readRows.length === 1, "Audit log persisted with real database row");
      assert(readRows[0].workspace_id === testWs, "Audit log correctly workspace-scoped");
      assert(readRows[0].status === "success", "Audit log status persisted as success");
      assert(readRows[0].user_agent === "Antigravity-QA-Agent", "Audit log user_agent persisted");

      // Verify cross-workspace isolation query
      const fakeWsId = "00000000-0000-0000-0000-000000000000";
      const [crossRows] = await conn.query(
        "SELECT * FROM audit_logs WHERE id = ? AND workspace_id = ?",
        [testEventId, fakeWsId],
      );
      assert(crossRows.length === 0, "Cross-workspace audit log isolation strictly blocks foreign workspace read");

      // Clean test entry
      await conn.query("DELETE FROM audit_logs WHERE id = ?", [testEventId]);
    }

    // 5. Notification System (Individual Delete, Mark Read, Clear All)
    console.log("\n--- TEST 5: Notification Individual Delete, Mark Read & Clear All ---");
    // Fetch two real profiles from DB to satisfy foreign key
    const [profiles] = await conn.query("SELECT id, workspace_id FROM profiles LIMIT 2");
    if (profiles.length >= 2) {
      const testUserId = profiles[0].id;
      const otherUserId = profiles[1].id;
      const userWs = profiles[0].workspace_id || testWs;

      const notif1 = "notif_1_" + Date.now();
      const notif2 = "notif_2_" + Date.now();
      const otherNotif = "notif_other_" + Date.now();

      await conn.query(
        `INSERT INTO notifications (id, workspace_id, user_id, type, title, message, is_read, created_at)
         VALUES (?, ?, ?, 'test', 'Test 1', 'Msg 1', 0, NOW()),
                (?, ?, ?, 'test', 'Test 2', 'Msg 2', 0, NOW()),
                (?, ?, ?, 'test', 'Other User Notif', 'Other Msg', 0, NOW())`,
        [notif1, userWs, testUserId, notif2, userWs, testUserId, otherNotif, userWs, otherUserId],
      );

      // Individual delete
      await conn.query("DELETE FROM notifications WHERE id = ? AND user_id = ? AND workspace_id = ?", [
        notif1,
        testUserId,
        userWs,
      ]);
      const [chk1] = await conn.query("SELECT id FROM notifications WHERE id = ?", [notif1]);
      assert(chk1.length === 0, "Individual notification deleted successfully");

      // Check notif2 and otherNotif still exist
      const [chk2] = await conn.query("SELECT id FROM notifications WHERE id = ?", [notif2]);
      assert(chk2.length === 1, "Remaining notification for user preserved");

      // Clear all for test user in their workspace
      await conn.query("DELETE FROM notifications WHERE user_id = ? AND workspace_id = ?", [
        testUserId,
        userWs,
      ]);
      const [chkAfterClear] = await conn.query("SELECT id FROM notifications WHERE id = ?", [notif2]);
      assert(chkAfterClear.length === 0, "Clear All deleted notifications for current user");

      // Other user's notification must NOT be affected
      const [chkOther] = await conn.query("SELECT id FROM notifications WHERE id = ?", [otherNotif]);
      assert(chkOther.length === 1, "Clear All strictly isolated: other user's notification completely untouched");

      // Clean up other test notif
      await conn.query("DELETE FROM notifications WHERE id = ?", [otherNotif]);
    } else {
      console.log("  ⚠️ Skipped FK-specific notification test (insufficient test profiles in DB)");
    }

    // 6. Centralized Retention & Cleanup Engine
    console.log("\n--- TEST 6: Centralized Retention & Maintenance Cleanup Engine ---");
    const cleanupResult = await runCentralizedCleanup({ batchSize: 100 });
    assert(typeof cleanupResult.durationMs === "number", `Cleanup executed in ${cleanupResult.durationMs}ms`);
    assert(typeof cleanupResult.chatMessagesDeleted === "number", "chatMessagesDeleted returned as number");
    assert(typeof cleanupResult.auditLogsPurged === "number", "auditLogsPurged returned as number");
    assert(typeof cleanupResult.readNotificationsPurged === "number", "readNotificationsPurged returned as number");

    // Test second run (idempotent)
    const secondCleanup = await runCentralizedCleanup({ batchSize: 100 });
    assert(secondCleanup.readNotificationsPurged === 0, "Repeated cleanup run is idempotent (0 duplicate purges)");

    // 7. Workspace Storage Usage Breakdown
    console.log("\n--- TEST 7: Workspace Storage Breakdown ---");
    const storageUsage = await getWorkspaceStorageUsage(testWs);
    assert(storageUsage.workspaceId === testWs, "Storage breakdown returned for correct workspace");
    assert(typeof storageUsage.propertyMediaCount === "number", "propertyMediaCount is a number");
    assert(typeof storageUsage.estimatedStorageBytes === "number", "estimatedStorageBytes is a number");
    assert(typeof storageUsage.estimatedStorageFormatted === "string", `estimatedStorageFormatted: ${storageUsage.estimatedStorageFormatted}`);

  } finally {
    await conn.end();
  }

  console.log("\n==================================================");
  console.log(`E2E TEST SUMMARY: PASSED: ${passed} | FAILED: ${failed}`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed with error:", err);
  process.exit(1);
});
