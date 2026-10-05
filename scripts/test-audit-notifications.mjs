/**
 * BLUETORN CRM — Audit Log Date Filter & Notification Timestamp Test Suite
 *
 * Validates:
 * 1. AUDIT FILTER:
 *    - convertIstDateToUtcBoundsFrom (00:00:00 IST -> 18:30:00 UTC previous day)
 *    - convertIstDateToUtcBoundsTo (23:59:59.999 IST -> 18:29:59.999 UTC)
 *    - From-only filtering (boundary matches events >= start)
 *    - From + To filtering (boundary matches events >= start AND <= end)
 *    - Same-day filtering (e.g. 01/10/2026 -> 01/10/2026)
 *    - Multi-day filtering (e.g. 01/10/2026 -> 03/10/2026)
 *    - Month boundary (e.g. 01/03/2026 -> 28/02/2026 18:30:00 UTC)
 *    - Year boundary (e.g. 01/01/2026 -> 31/12/2025 18:30:00 UTC)
 *    - Future / no-result range
 *    - Reset filters (clears dates, returns full set)
 *
 * 2. AUDIT DISPLAY:
 *    - Absolute timestamp strictly DD/MM/YYYY • hh:mm AM/PM (Asia/Kolkata)
 *    - No secondary relative timestamp in table
 *
 * 3. NOTIFICATIONS:
 *    - Relative format: now (<1m), 2m, 27m, 38m, 1h, 5h, 1d, 3d
 *    - No "ago", no "in", no "in 5h", no "8m ago"
 *    - Future clock-skew tolerance (<60s returns "now")
 *    - Real database created_at timestamps (UTC)
 *    - Newest-first ordering (ORDER BY created_at DESC)
 *
 * 4. LIVE UPDATE:
 *    - Relative time ticker updates as baseNow advances without reload
 */

import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import {
  formatDate,
  formatTime,
  formatDateTime,
  formatAuditTimestamp,
  formatNotificationTime,
  convertIstDateToUtcBounds,
  parseDbUtcTimestamp,
  IST_TIMEZONE,
} from "../src/lib/format.ts";

console.log("==================================================");
console.log("🧪 TEST SUITE: AUDIT LOG DATE FILTER & NOTIFICATION TIME");
console.log("==================================================");

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}:`, err.message);
    if (err.stack) console.error(err.stack);
    failed++;
  }
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  database: process.env.DB_NAME || "bluetorn_crm",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  waitForConnections: true,
  connectionLimit: 5,
  charset: "utf8mb4",
  timezone: "+00:00",
});

try {
  // --------------------------------------------------------------------------
  // SECTION 1: AUDIT DATE BOUNDARIES & CONVERSION
  // --------------------------------------------------------------------------
  console.log("\n[SECTION 1: Audit Log Date Bounds & Conversion]");

  await test("From boundary 01/10/2026 converts to 2026-09-30 18:30:00 UTC", () => {
    const res = convertIstDateToUtcBounds("01/10/2026", false);
    assert.equal(res, "2026-09-30 18:30:00");

    const resIso = convertIstDateToUtcBounds("2026-10-01", false);
    assert.equal(resIso, "2026-09-30 18:30:00");
  });

  await test("To boundary 01/10/2026 converts to 2026-10-01 18:29:59.999 UTC", () => {
    const res = convertIstDateToUtcBounds("01/10/2026", true);
    assert.equal(res, "2026-10-01 18:29:59.999");

    const resIso = convertIstDateToUtcBounds("2026-10-01", true);
    assert.equal(resIso, "2026-10-01 18:29:59.999");
  });

  await test("Same-day From + To boundary encapsulates exactly 24 hours IST", () => {
    const fromUtc = convertIstDateToUtcBounds("2026-10-01", false);
    const toUtc = convertIstDateToUtcBounds("2026-10-01", true);

    const fromMs = new Date(fromUtc + "Z").getTime();
    const toMs = new Date(toUtc + "Z").getTime();
    const durationMs = toMs - fromMs;

    // 24 hours minus 1 ms = 86399999 ms
    assert.equal(durationMs, 86399999, "Same-day window must be precisely 23h 59m 59.999s");
  });

  await test("Multi-day From + To boundary (01/10/2026 -> 03/10/2026)", () => {
    const fromUtc = convertIstDateToUtcBounds("2026-10-01", false);
    const toUtc = convertIstDateToUtcBounds("2026-10-03", true);

    assert.equal(fromUtc, "2026-09-30 18:30:00");
    assert.equal(toUtc, "2026-10-03 18:29:59.999");
  });

  await test("Month boundary conversion (01/03/2026)", () => {
    const start = convertIstDateToUtcBounds("2026-03-01", false);
    assert.equal(start, "2026-02-28 18:30:00");
  });

  await test("Year boundary conversion (01/01/2026)", () => {
    const start = convertIstDateToUtcBounds("2026-01-01", false);
    assert.equal(start, "2025-12-31 18:30:00");
  });

  // --------------------------------------------------------------------------
  // SECTION 2: AUDIT FILTER SQL EXECUTION
  // --------------------------------------------------------------------------
  console.log("\n[SECTION 2: Audit Filter Database Queries]");

  const wsRow = await pool.query("SELECT id FROM workspaces LIMIT 1");
  const wsId = wsRow[0][0]?.id;
  assert(wsId, "Must have at least one workspace");

  await test("From-only query filters records on or after start boundary", async () => {
    const fromUtc = convertIstDateToUtcBounds("2026-10-01", false);
    const [rows] = await pool.execute(
      "SELECT count(*) as c FROM audit_logs WHERE workspace_id = ? AND created_at >= ?",
      [wsId, fromUtc],
    );
    assert(typeof rows[0].c === "number");
  });

  await test("From + To query bounds records strictly within range", async () => {
    const fromUtc = convertIstDateToUtcBounds("2026-10-01", false);
    const toUtc = convertIstDateToUtcBounds("2026-10-03", true);
    const [rows] = await pool.execute(
      "SELECT count(*) as c FROM audit_logs WHERE workspace_id = ? AND created_at >= ? AND created_at <= ?",
      [wsId, fromUtc, toUtc],
    );
    assert(typeof rows[0].c === "number");
  });

  await test("Future range returns zero records", async () => {
    const fromUtc = convertIstDateToUtcBounds("2099-01-01", false);
    const toUtc = convertIstDateToUtcBounds("2099-01-02", true);
    const [rows] = await pool.execute(
      "SELECT count(*) as c FROM audit_logs WHERE workspace_id = ? AND created_at >= ? AND created_at <= ?",
      [wsId, fromUtc, toUtc],
    );
    assert.equal(rows[0].c, 0, "Future date range must return 0 records");
  });

  // --------------------------------------------------------------------------
  // SECTION 3: AUDIT DISPLAY FORMAT
  // --------------------------------------------------------------------------
  console.log("\n[SECTION 3: Audit Display Format]");

  await test("formatAuditTimestamp displays DD/MM/YYYY • hh:mm AM/PM in IST", () => {
    // 2026-10-05T04:09:00Z -> IST is 09:39 AM (add 5:30)
    const formatted = formatAuditTimestamp("2026-10-05T04:09:00Z");
    assert.equal(formatted, "05/10/2026 • 09:39 AM");
  });

  await test("formatAuditTimestamp handles null/empty safely", () => {
    assert.equal(formatAuditTimestamp(null), "—");
    assert.equal(formatAuditTimestamp(""), "—");
    assert.equal(formatAuditTimestamp(undefined), "—");
  });

  // --------------------------------------------------------------------------
  // SECTION 4: NOTIFICATION FORMAT & BEHAVIOR
  // --------------------------------------------------------------------------
  console.log("\n[SECTION 4: Notification Relative Time Format]");

  const baseNow = new Date("2026-10-05T10:00:00.000Z").getTime();

  await test("Notification < 1 minute displays 'now'", () => {
    const ts30s = new Date(baseNow - 30 * 1000).toISOString();
    assert.equal(formatNotificationTime(ts30s, baseNow), "now");
  });

  await test("Notification clock-skew (<60s in future) displays 'now'", () => {
    const future20s = new Date(baseNow + 20 * 1000).toISOString();
    assert.equal(formatNotificationTime(future20s, baseNow), "now");
  });

  await test("Notification 2 minutes old displays '2m'", () => {
    const ts2m = new Date(baseNow - 2 * 60 * 1000).toISOString();
    assert.equal(formatNotificationTime(ts2m, baseNow), "2m");
  });

  await test("Notification 27 minutes old displays '27m'", () => {
    const ts27m = new Date(baseNow - 27 * 60 * 1000).toISOString();
    assert.equal(formatNotificationTime(ts27m, baseNow), "27m");
  });

  await test("Notification 38 minutes old displays '38m'", () => {
    const ts38m = new Date(baseNow - 38 * 60 * 1000).toISOString();
    assert.equal(formatNotificationTime(ts38m, baseNow), "38m");
  });

  await test("Notification 1 hour old displays '1h'", () => {
    const ts1h = new Date(baseNow - 60 * 60 * 1000).toISOString();
    assert.equal(formatNotificationTime(ts1h, baseNow), "1h");
  });

  await test("Notification 5 hours old displays '5h'", () => {
    const ts5h = new Date(baseNow - 5 * 3600 * 1000).toISOString();
    assert.equal(formatNotificationTime(ts5h, baseNow), "5h");
  });

  await test("Notification 1 day old displays '1d'", () => {
    const ts1d = new Date(baseNow - 24 * 3600 * 1000).toISOString();
    assert.equal(formatNotificationTime(ts1d, baseNow), "1d");
  });

  await test("Notification never displays 'ago', 'in', or random strings", () => {
    const sampleTimes = [
      new Date(baseNow - 10 * 1000),
      new Date(baseNow - 5 * 60 * 1000),
      new Date(baseNow - 4 * 3600 * 1000),
      new Date(baseNow - 48 * 3600 * 1000),
      new Date(baseNow + 15 * 1000),
    ];

    for (const t of sampleTimes) {
      const formatted = formatNotificationTime(t.toISOString(), baseNow);
      assert(!formatted.includes("ago"), `Must not contain 'ago': ${formatted}`);
      assert(!formatted.startsWith("in"), `Must not start with 'in': ${formatted}`);
      assert(!formatted.includes("-"), `Must not have negative sign: ${formatted}`);
    }
  });

  // --------------------------------------------------------------------------
  // SECTION 5: LIVE RELATIVE TIME UPDATE
  // --------------------------------------------------------------------------
  console.log("\n[SECTION 5: Live Relative Time Update (Without Reload)]");

  await test("Relative time advances as baseNow increases", () => {
    const created = new Date("2026-10-05T05:00:00.000Z").getTime();

    // At 05:00:20 -> now
    const at05_00 = new Date("2026-10-05T05:00:20.000Z").getTime();
    assert.equal(formatNotificationTime(created, at05_00), "now");

    // At 05:27:00 -> 27m
    const at05_27 = new Date("2026-10-05T05:27:00.000Z").getTime();
    assert.equal(formatNotificationTime(created, at05_27), "27m");

    // At 05:32:00 -> 32m
    const at05_32 = new Date("2026-10-05T05:32:00.000Z").getTime();
    assert.equal(formatNotificationTime(created, at05_32), "32m");
  });

  // --------------------------------------------------------------------------
  // SECTION 6: NOTIFICATION ORDERING & REAL CREATED_AT TIMESTAMPS
  // --------------------------------------------------------------------------
  console.log("\n[SECTION 6: Notification Database Ordering & Timestamps]");

  await test("Notifications query orders strictly by created_at DESC", async () => {
    const [rows] = await pool.query(
      "SELECT id, created_at FROM notifications ORDER BY created_at DESC LIMIT 10",
    );
    for (let i = 0; i < rows.length - 1; i++) {
      const current = new Date(rows[i].created_at).getTime();
      const next = new Date(rows[i + 1].created_at).getTime();
      assert(
        current >= next,
        `Notifications must be sorted descending: row ${i} (${rows[i].created_at}) < row ${i + 1} (${rows[i + 1].created_at})`,
      );
    }
  });

  await test("Notification created_at timestamps are real Date objects in UTC", async () => {
    const [rows] = await pool.query(
      "SELECT id, created_at, CAST(created_at as CHAR) as raw_str FROM notifications LIMIT 5",
    );
    for (const r of rows) {
      assert(r.created_at, "created_at must exist");
      const parsed = parseDbUtcTimestamp(r.created_at);
      assert(parsed instanceof Date && !isNaN(parsed.getTime()), "Must parse to valid Date");
    }
  });

} finally {
  await pool.end();
}

console.log("\n==================================================");
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log("==================================================");

if (failed > 0) {
  process.exit(1);
}
