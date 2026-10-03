#!/usr/bin/env node

/**
 * BLUETORN CRM — Standalone Centralized Retention & Cleanup Runner
 *
 * Designed for deployment in Hostinger Business Hosting (hPanel Cron Jobs)
 * or VPS (crontab/systemd timer).
 *
 * Example Hostinger Cron Configuration (daily or hourly):
 *   0 2 * * * cd /home/u.../domains/realestate.bluetorn.com/public_html && node scripts/centralized-cleanup.mjs >> /tmp/crm-cleanup.log 2>&1
 *
 * Usage:
 *   node scripts/centralized-cleanup.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";

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

loadEnvFile(path.join(rootDir, ".env"));
loadEnvFile(path.join(rootDir, ".env.local"));

const host = process.env.DB_HOST || "localhost";
const port = Number(process.env.DB_PORT) || 3306;
const database = process.env.DB_NAME || "bluetorn_crm";
const user = process.env.DB_USER || "root";
const password = process.env.DB_PASSWORD ?? "";

async function run() {
  const startTime = Date.now();
  console.log(`[${new Date().toISOString()}] Starting Centralized Retention Cleanup...`);
  console.log(`Connecting to ${database} on ${host}:${port}...`);

  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
  });

  const batchSize = 1000;
  let chatMessagesDeleted = 0;
  let auditLogsPurged = 0;
  let readNotifsPurged = 0;
  let unreadNotifsPurged = 0;

  try {
    // 1. Chat Messages
    while (true) {
      const [res] = await conn.execute(
        "DELETE FROM chat_messages WHERE expires_at <= NOW() LIMIT ?",
        [batchSize],
      );
      const count = res.affectedRows ?? 0;
      chatMessagesDeleted += count;
      if (count < batchSize) break;
    }

    // 2. Audit Logs: Purge per workspace retention policy (default 180 days)
    const [workspaces] = await conn.query(
      "SELECT id, audit_retention_days FROM workspaces",
    );

    for (const ws of workspaces) {
      const days = Number(ws.audit_retention_days) || 180;
      while (true) {
        const [res] = await conn.execute(
          "DELETE FROM audit_logs WHERE workspace_id = ? AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY) LIMIT ?",
          [ws.id, days, batchSize],
        );
        const count = res.affectedRows ?? 0;
        auditLogsPurged += count;
        if (count < batchSize) break;
      }
    }

    // Platform audit logs without workspace_id
    while (true) {
      const [res] = await conn.execute(
        "DELETE FROM audit_logs WHERE workspace_id IS NULL AND created_at < DATE_SUB(NOW(), INTERVAL 180 DAY) LIMIT ?",
        [batchSize],
      );
      const count = res.affectedRows ?? 0;
      auditLogsPurged += count;
      if (count < batchSize) break;
    }

    // 3. Read Notifications (older than 30 days)
    while (true) {
      const [res] = await conn.execute(
        "DELETE FROM notifications WHERE is_read = 1 AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY) LIMIT ?",
        [batchSize],
      );
      const count = res.affectedRows ?? 0;
      readNotifsPurged += count;
      if (count < batchSize) break;
    }

    // 4. Unread Notifications (older than 90 days)
    while (true) {
      const [res] = await conn.execute(
        "DELETE FROM notifications WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY) LIMIT ?",
        [batchSize],
      );
      const count = res.affectedRows ?? 0;
      unreadNotifsPurged += count;
      if (count < batchSize) break;
    }

    const duration = Date.now() - startTime;
    console.log(
      `[${new Date().toISOString()}] Retention Cleanup Completed in ${duration}ms!\n` +
        `  - Chat Messages:     ${chatMessagesDeleted} expired deleted\n` +
        `  - Audit Logs:        ${auditLogsPurged} expired purged\n` +
        `  - Read Notifs:       ${readNotifsPurged} purged (30-day policy)\n` +
        `  - Unread Notifs:     ${unreadNotifsPurged} purged (90-day policy)`,
    );
  } finally {
    await conn.end();
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Centralized Cleanup error:", err);
    process.exit(1);
  });
