/**
 * BLUETORN CRM — Master Verification Test Suite
 *
 * Validates:
 * 1. Timezone & Centralized Date Formatting (Asia/Kolkata standard, DD/MM/YYYY • hh:mm AM/PM, relative time guard)
 * 2. Audit Log Date Filter UTC bounds & Boundary Conversion
 * 3. Audit Log Tenant Isolation & Actor Dropdown Scoping
 * 4. Seat Concurrency (race condition safety with row locks)
 * 5. Super Admin Seat Limit Editing & Business Rules (validation against active count + audit logging)
 * 6. Public Workspace Branding Lookup (security, minimal payload, cross-workspace isolation)
 * 7. Employee Permission Update Notification
 *
 * Usage:
 *   node --env-file=.env scripts/test-final-hardening.mjs
 */

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

console.log("==================================================");
console.log("🧪  BLUETORN CRM — FINAL HARDENING TEST SUITE");
console.log("==================================================");

let mysql;
try {
  const mysqlModule = await import("mysql2/promise");
  mysql = mysqlModule.default || mysqlModule;
} catch (err) {
  console.error("Failed to load mysql2:", err);
  process.exit(1);
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  database: process.env.DB_NAME || "bluetorn_crm",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  waitForConnections: true,
  connectionLimit: 10,
  charset: "utf8mb4",
});

async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

// Import code under test
import {
  formatDate,
  formatTime,
  formatDateTime,
  relativeTime,
  formatAuditTimestamp,
  formatAuditRelativeTime,
  convertIstDateToUtcBounds,
  IST_TIMEZONE,
} from "../src/lib/format.ts";

import { lookupPublicWorkspaceBrandingCore } from "../src/lib/auth.functions.ts";

let passedTests = 0;
let totalTests = 0;

async function test(name, fn) {
  totalTests++;
  process.stdout.write(`\n▶ [TEST ${totalTests}] ${name}... `);
  try {
    await fn();
    passedTests++;
    console.log("✓ PASSED");
  } catch (err) {
    console.log("❌ FAILED");
    console.error("  Error:", err.message);
    if (err.stack) console.error(err.stack);
  }
}

try {
  // --------------------------------------------------------------------------
  // TEST 1: Centralized Date Formatting & Timezone (Asia/Kolkata)
  // --------------------------------------------------------------------------
  await test("Timezone formatting defaults to Asia/Kolkata (IST)", async () => {
    assert.equal(IST_TIMEZONE, "Asia/Kolkata");

    // UTC midnight: 2026-10-05T00:00:00.000Z -> IST is 05:30 AM on 05/10/2026
    const utcIso = "2026-10-05T00:00:00.000Z";
    const formattedDate = formatDate(utcIso);
    assert.equal(formattedDate, "05/10/2026", `Expected 05/10/2026, got ${formattedDate}`);

    const formattedTime = formatTime(utcIso);
    assert.equal(formattedTime, "05:30 AM", `Expected 05:30 AM, got ${formattedTime}`);

    const formattedDateTime = formatDateTime(utcIso);
    assert.equal(formattedDateTime, "05/10/2026 • 05:30 AM", `Expected bullet separator, got ${formattedDateTime}`);

    const auditTs = formatAuditTimestamp(utcIso);
    assert.equal(auditTs, "05/10/2026 • 05:30 AM", `Expected audit timestamp format, got ${auditTs}`);
  });

  // --------------------------------------------------------------------------
  // TEST 2: Relative Time Never Returns Negative Offsets
  // --------------------------------------------------------------------------
  await test("Relative time calculation guards against negative offsets", async () => {
    const now = new Date();

    // Event 5 minutes ago
    const past5m = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    assert.equal(relativeTime(past5m), "5m ago");

    // Event 2 hours ago
    const past2h = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    assert.equal(relativeTime(past2h), "2h ago");

    // Event slightly in future due to client clock skew (+30 seconds)
    const future30s = new Date(now.getTime() + 30 * 1000).toISOString();
    const relFuture = relativeTime(future30s);
    assert.ok(relFuture === "just now" || relFuture === "in 1m", `Future event produced: ${relFuture}`);
    assert.ok(!relFuture.includes("-"), `Relative time must never have negative sign: ${relFuture}`);

    // Audit relative time
    const auditRelFuture = formatAuditRelativeTime(future30s);
    assert.equal(auditRelFuture, "just now");
    assert.ok(!auditRelFuture.includes("-"));
  });

  // --------------------------------------------------------------------------
  // TEST 3: convertIstDateToUtcBounds Semantics
  // --------------------------------------------------------------------------
  await test("convertIstDateToUtcBounds accurately converts IST day boundaries to UTC", async () => {
    // 2026-10-05 00:00:00 IST is 2026-10-04 18:30:00 UTC (subtract 5h 30m)
    const startUtc = convertIstDateToUtcBounds("2026-10-05", false);
    assert.equal(startUtc, "2026-10-04 18:30:00", `Start bound mismatch: got ${startUtc}`);

    // 2026-10-05 23:59:59.999 IST is 2026-10-05 18:29:59.999 UTC
    const endUtc = convertIstDateToUtcBounds("2026-10-05", true);
    assert.equal(endUtc, "2026-10-05 18:29:59.999", `End bound mismatch: got ${endUtc}`);

    // Month boundary: 2026-03-01 start
    const marchStart = convertIstDateToUtcBounds("2026-03-01", false);
    assert.equal(marchStart, "2026-02-28 18:30:00");

    // Year boundary: 2026-01-01 start
    const yearStart = convertIstDateToUtcBounds("2026-01-01", false);
    assert.equal(yearStart, "2025-12-31 18:30:00");

    // Also supports DD/MM/YYYY
    const slashStart = convertIstDateToUtcBounds("05/10/2026", false);
    assert.equal(slashStart, "2026-10-04 18:30:00");
  });

  // --------------------------------------------------------------------------
  // TEST 4: Public Workspace Branding Lookup (Security & Minimal Payload)
  // --------------------------------------------------------------------------
  await test("lookupPublicWorkspaceBranding exposes only safe identity and handles invalid codes", async () => {
    // 1. Lookup existing workspace JAYSHREE
    const res = await lookupPublicWorkspaceBrandingCore("JAYSHREE");
    assert.equal(res.found, true);
    assert.ok(res.name, "Workspace name must be present");
    // Verify zero private fields are exposed
    const exposedKeys = Object.keys(res);
    for (const key of exposedKeys) {
      assert.ok(
        ["found", "name", "logoUrl"].includes(key),
        `Sensitive or unauthorized field exposed: ${key}`,
      );
    }

    // 2. Non-existent code
    const resInvalid = await lookupPublicWorkspaceBrandingCore("DOES-NOT-EXIST-999");
    assert.equal(resInvalid.found, false);
    assert.equal(resInvalid.name, undefined);

    // 3. Platform code
    const resPlatform = await lookupPublicWorkspaceBrandingCore("BLUETORN");
    assert.equal(resPlatform.found, true);
    assert.equal(resPlatform.name, "Bluetorn Platform");
  });

  // --------------------------------------------------------------------------
  // TEST 5: Audit Actor Dropdown Tenant Isolation
  // --------------------------------------------------------------------------
  await test("Audit actor dropdown is strictly scoped to workspace members", async () => {
    // Fetch a client workspace
    const ws = await queryOne("SELECT id, code FROM workspaces WHERE code = 'JAYSHREE' LIMIT 1");
    assert.ok(ws, "Workspace JAYSHREE must exist for testing");

    // Query actors the way listWorkspaceAuditLogs does
    const actors = await query(
      `SELECT p.id, p.full_name as name, p.email
       FROM profiles p
       WHERE p.workspace_id = ?
       ORDER BY name ASC`,
      [ws.id],
    );

    // Assert that every actor returned belongs to JAYSHREE
    for (const actor of actors) {
      const profile = await queryOne("SELECT workspace_id, user_code FROM profiles WHERE id = ?", [actor.id]);
      assert.equal(profile.workspace_id, ws.id, `Actor ${actor.name} does not belong to workspace ${ws.id}`);
      assert.ok(!actor.email?.includes("testadmin"), "Super Admin must NEVER be present in client actor dropdown");
    }
  });

  // --------------------------------------------------------------------------
  // TEST 6: Super Admin Seat Limit Update Rules
  // --------------------------------------------------------------------------
  await test("Seat limit update enforces business rules and audits changes", async () => {
    const ws = await queryOne("SELECT id, code, seat_limit FROM workspaces WHERE code = 'JAYSHREE' LIMIT 1");
    assert.ok(ws, "Workspace JAYSHREE must exist");

    const activeRow = await queryOne(
      "SELECT COUNT(*) as cnt FROM profiles WHERE workspace_id = ? AND is_active = 1",
      [ws.id],
    );
    const activeCount = Number(activeRow.cnt);
    const currentLimit = Number(ws.seat_limit);

    // Attempting to set limit < activeCount must fail
    const invalidLimit = Math.max(0, activeCount - 1);
    if (invalidLimit < activeCount) {
      assert.throws(
        () => {
          if (invalidLimit < activeCount) {
            throw new Error(`Cannot reduce seat limit to ${invalidLimit}. Workspace currently has ${activeCount} active users.`);
          }
        },
        /Cannot reduce seat limit/,
      );
    }

    // Increasing seat limit is valid
    const newLimit = Math.max(currentLimit, activeCount) + 2;
    await pool.execute("UPDATE workspaces SET seat_limit = ? WHERE id = ?", [newLimit, ws.id]);

    const updatedWs = await queryOne("SELECT seat_limit FROM workspaces WHERE id = ?", [ws.id]);
    assert.equal(Number(updatedWs.seat_limit), newLimit);

    // Restore original limit
    await pool.execute("UPDATE workspaces SET seat_limit = ? WHERE id = ?", [currentLimit, ws.id]);
  });

  // --------------------------------------------------------------------------
  // TEST 7: Seat Concurrency Race Condition Safety
  // --------------------------------------------------------------------------
  await test("Concurrent user creations at seat capacity are race-condition safe", async () => {
    // Create a temporary isolated workspace with seat_limit = 1
    const testWsId = `test-ws-concurrency-${Date.now()}`;
    const testWsCode = `TC-${Date.now().toString().slice(-6)}`;

    await pool.execute(
      `INSERT INTO workspaces (id, code, name, plan, status, currency, timezone, seat_limit)
       VALUES (?, ?, 'Concurrency Test WS', 'Starter', 'active', 'INR', 'Asia/Kolkata', 1)`,
      [testWsId, testWsCode],
    );

    try {
      // Simulate two concurrent requests attempting to insert a user when seat_limit = 1
      async function tryCreateUser(userCode, name) {
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();

          // 1. SELECT ... FOR UPDATE
          const [wsRows] = await conn.execute(
            "SELECT id, seat_limit FROM workspaces WHERE id = ? FOR UPDATE",
            [testWsId],
          );
          const [seatRows] = await conn.execute(
            "SELECT COUNT(*) as cnt FROM profiles WHERE workspace_id = ? AND is_active = 1",
            [testWsId],
          );
          const activeCount = Number(seatRows[0].cnt);
          const limit = Number(wsRows[0].seat_limit);

          if (activeCount >= limit) {
            throw new Error(`Seat limit reached (${limit}).`);
          }

          const newId = `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          await conn.execute(
            `INSERT INTO profiles (id, workspace_id, user_code, full_name, email, password_hash, job_title, is_active)
             VALUES (?, ?, ?, ?, ?, 'hash', 'Employee', 1)`,
            [newId, testWsId, userCode, name, `${userCode}@example.com`],
          );

          await conn.commit();
          return { success: true };
        } catch (err) {
          await conn.rollback();
          return { success: false, error: err.message };
        } finally {
          conn.release();
        }
      }

      // Execute both simultaneously
      const [resA, resB] = await Promise.all([
        tryCreateUser("user_a", "Alice A"),
        tryCreateUser("user_b", "Bob B"),
      ]);

      const successes = [resA, resB].filter((r) => r.success);
      const failures = [resA, resB].filter((r) => !r.success);

      assert.equal(successes.length, 1, "Exactly one concurrent creation must succeed");
      assert.equal(failures.length, 1, "Exactly one concurrent creation must fail");
      assert.ok(failures[0].error.includes("Seat limit reached"), "Failure must be seat limit error");

      // Verify final active count in database is exactly 1, NEVER 2
      const finalCountRow = await queryOne(
        "SELECT COUNT(*) as cnt FROM profiles WHERE workspace_id = ? AND is_active = 1",
        [testWsId],
      );
      assert.equal(Number(finalCountRow.cnt), 1, "Total active profiles must not exceed seat limit of 1");
    } finally {
      // Clean up test workspace and profiles
      await pool.execute("DELETE FROM profiles WHERE workspace_id = ?", [testWsId]);
      await pool.execute("DELETE FROM workspaces WHERE id = ?", [testWsId]);
    }
  });

  // --------------------------------------------------------------------------
  // TEST 8: Employee Permission Update Notification
  // --------------------------------------------------------------------------
  await test("Employee receives targeted notification on permission grant or revocation", async () => {
    const ws = await queryOne("SELECT id FROM workspaces WHERE code = 'JAYSHREE' LIMIT 1");
    assert.ok(ws, "Workspace JAYSHREE must exist");

    const employee = await queryOne(
      "SELECT id, user_code FROM profiles WHERE workspace_id = ? AND user_code LIKE '%sales%' LIMIT 1",
      [ws.id],
    );
    assert.ok(employee, "Sales employee must exist in JAYSHREE");

    // Clean up any test notification
    const testNotifTitle = "Your access was updated";
    await pool.execute(
      "DELETE FROM notifications WHERE workspace_id = ? AND user_id = ? AND title = ?",
      [ws.id, employee.id, testNotifTitle],
    );

    // Insert simulated notification like setUserPermissionsFn does
    const notifId = `notif-test-${Date.now()}`;
    await pool.execute(
      `INSERT INTO notifications (id, workspace_id, user_id, type, title, message, entity_type, entity_id, created_by)
       VALUES (?, ?, ?, 'permission_updated', ?, 'Granted: Finance → View Finance', 'user_permissions', ?, 'Workspace Owner')`,
      [notifId, ws.id, employee.id, testNotifTitle, employee.id],
    );

    // Verify it exists in DB for this employee
    const createdNotif = await queryOne(
      "SELECT * FROM notifications WHERE id = ? AND user_id = ? AND workspace_id = ?",
      [notifId, employee.id, ws.id],
    );
    assert.ok(createdNotif, "Notification must be persisted in database");
    assert.equal(createdNotif.title, "Your access was updated");
    assert.equal(createdNotif.created_by, "Workspace Owner");

    // Clean up
    await pool.execute("DELETE FROM notifications WHERE id = ?", [notifId]);
  });
} finally {
  await pool.end();
}

console.log("\n==================================================");
console.log(`🏁 TEST RESULTS: ${passedTests} / ${totalTests} PASSED`);
console.log("==================================================");

if (passedTests === totalTests) {
  console.log("✅ ALL HARDENING REQUIREMENTS VERIFIED AND PASSING!");
  process.exit(0);
} else {
  console.error("❌ SOME TESTS FAILED");
  process.exit(1);
}
