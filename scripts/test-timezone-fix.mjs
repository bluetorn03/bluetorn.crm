/**
 * BLUETORN CRM — Automated Test Suite: Real-Time Timezone & Relative Time Standard
 *
 * Verifies:
 * 1. parseDbUtcTimestamp parses MySQL DATETIME strings as UTC (not local time).
 * 2. parseDbUtcTimestamp parses ISO 8601 UTC strings accurately.
 * 3. parseDbUtcTimestamp handles Date objects and null/undefined values safely.
 * 4. relativeTime formats recent timestamps (<60s) as "just now".
 * 5. relativeTime formats past minutes (1-59m) as "Xm ago".
 * 6. relativeTime formats past hours (1-23h) as "Xh ago".
 * 7. relativeTime formats past days (>=24h) as "Xd ago".
 * 8. relativeTime tolerates minor future skew (<60s) as "just now".
 * 9. relativeTime formats future intervals as "in Xm", "in Xh", "in Xd".
 * 10. formatAuditRelativeTime is an alias of relativeTime and yields identical results.
 * 11. formatAuditTimestamp converts UTC timestamps to Indian Standard Time (IST) correctly.
 * 12. Database pool connection sets session time_zone to "+00:00".
 */

import assert from "node:assert";
import { parseDbUtcTimestamp, relativeTime, formatAuditRelativeTime, formatAuditTimestamp } from "../src/lib/format.ts";
import { query } from "../src/lib/db.ts";

console.log("==================================================");
console.log("⏰ TEST: REAL-TIME TIMEZONE & RELATIVE TIME ENGINE");
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
    failed++;
  }
}

async function runSuite() {
  // 1. parseDbUtcTimestamp on MySQL string
  await test("1. parseDbUtcTimestamp parses MySQL DATETIME string as UTC", () => {
    const raw = "2026-10-04 18:30:00";
    const date = parseDbUtcTimestamp(raw);
    assert(date instanceof Date);
    assert.strictEqual(date.toISOString(), "2026-10-04T18:30:00.000Z");
  });

  // 2. parseDbUtcTimestamp on ISO string
  await test("2. parseDbUtcTimestamp parses ISO string accurately", () => {
    const raw = "2026-10-04T18:30:00.000Z";
    const date = parseDbUtcTimestamp(raw);
    assert.strictEqual(date.toISOString(), "2026-10-04T18:30:00.000Z");
  });

  // 3. parseDbUtcTimestamp handles edge cases
  await test("3. parseDbUtcTimestamp handles null, undefined, invalid strings", () => {
    assert.strictEqual(parseDbUtcTimestamp(null), null);
    assert.strictEqual(parseDbUtcTimestamp(undefined), null);
    assert.strictEqual(parseDbUtcTimestamp(""), null);
    assert.strictEqual(parseDbUtcTimestamp("invalid-date-string"), null);
  });

  // 4. relativeTime <60s
  await test("4. relativeTime formats timestamps <60s ago as 'just now'", () => {
    const now = Date.now();
    const t30sAgo = new Date(now - 30 * 1000).toISOString();
    assert.strictEqual(relativeTime(t30sAgo), "just now");
    const t5sAgo = new Date(now - 5 * 1000).toISOString();
    assert.strictEqual(relativeTime(t5sAgo), "just now");
  });

  // 5. relativeTime 1-59m
  await test("5. relativeTime formats 1-59 minutes as 'Xm ago'", () => {
    const now = Date.now();
    const t5mAgo = new Date(now - 5 * 60 * 1000).toISOString();
    assert.strictEqual(relativeTime(t5mAgo), "5m ago");
    const t45mAgo = new Date(now - 45 * 60 * 1000).toISOString();
    assert.strictEqual(relativeTime(t45mAgo), "45m ago");
  });

  // 6. relativeTime 1-23h
  await test("6. relativeTime formats 1-23 hours as 'Xh ago'", () => {
    const now = Date.now();
    const t2hAgo = new Date(now - 2 * 3600 * 1000).toISOString();
    assert.strictEqual(relativeTime(t2hAgo), "2h ago");
    const t18hAgo = new Date(now - 18 * 3600 * 1000).toISOString();
    assert.strictEqual(relativeTime(t18hAgo), "18h ago");
  });

  // 7. relativeTime >=24h
  await test("7. relativeTime formats >=24 hours as 'Xd ago'", () => {
    const now = Date.now();
    const t2dAgo = new Date(now - 48 * 3600 * 1000).toISOString();
    assert.strictEqual(relativeTime(t2dAgo), "2d ago");
  });

  // 8. relativeTime minor future skew tolerance (<60s)
  await test("8. relativeTime tolerates minor future skew (<60s) as 'just now'", () => {
    const now = Date.now();
    const t15sFuture = new Date(now + 15 * 1000).toISOString();
    assert.strictEqual(relativeTime(t15sFuture), "just now");
  });

  // 9. relativeTime future notifications
  await test("9. relativeTime formats future intervals as 'in Xm' or 'in Xh'", () => {
    const now = Date.now();
    const t10mFuture = new Date(now + 10 * 60 * 1000).toISOString();
    assert.strictEqual(relativeTime(t10mFuture), "in 10m");
    const t3hFuture = new Date(now + 3 * 3600 * 1000).toISOString();
    assert.strictEqual(relativeTime(t3hFuture), "in 3h");
  });

  // 10. formatAuditRelativeTime alias
  await test("10. formatAuditRelativeTime is identical to relativeTime", () => {
    const now = Date.now();
    const t5mAgo = new Date(now - 5 * 60 * 1000).toISOString();
    assert.strictEqual(formatAuditRelativeTime(t5mAgo), relativeTime(t5mAgo));
  });

  // 11. formatAuditTimestamp in IST
  await test("11. formatAuditTimestamp converts UTC to IST accurately", () => {
    // 2026-10-04 12:00:00 UTC = 2026-10-04 17:30:00 IST (+5:30)
    const utcIso = "2026-10-04T12:00:00.000Z";
    const istFormatted = formatAuditTimestamp(utcIso);
    // Should match DD/MM/YYYY • hh:mm AM/PM in IST (04/10/2026 • 05:30 PM)
    assert(istFormatted.includes("04/10/2026"), `Expected date 04/10/2026, got ${istFormatted}`);
    assert(istFormatted.includes("05:30 PM"), `Expected time 05:30 PM, got ${istFormatted}`);
  });

  // 12. Database session time_zone is +00:00
  await test("12. Database connection sets session time_zone to '+00:00'", async () => {
    const rows = await query("SELECT @@session.time_zone as stz, NOW() as db_now, UTC_TIMESTAMP() as db_utc");
    assert(rows.length > 0);
    const stz = rows[0].stz;
    assert.strictEqual(stz, "+00:00", `Expected session time_zone to be +00:00, got ${stz}`);
    
    // Ensure NOW() and UTC_TIMESTAMP() evaluate to the same second in DB
    const dbNow = new Date(rows[0].db_now).getTime();
    const dbUtc = new Date(rows[0].db_utc).getTime();
    assert(Math.abs(dbNow - dbUtc) <= 1000, `NOW() (${rows[0].db_now}) and UTC_TIMESTAMP() (${rows[0].db_utc}) must match in UTC`);
  });

  console.log("\n==================================================");
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log("==================================================");

  if (failed > 0) process.exit(1);
}

runSuite().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
