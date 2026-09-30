/**
 * BLUETORN CRM — Standalone Chat Retention Cleanup Runner
 *
 * Designed for deployment in Hostinger Business Hosting (hPanel Cron Jobs)
 * or VPS (crontab/systemd timer).
 *
 * Example Cron Configuration (every hour):
 *   0 * * * * cd /home/u.../domains/realestate.bluetorn.com/public_html && node scripts/cleanup-chat.mjs >> /tmp/chat-cleanup.log 2>&1
 *
 * Usage:
 *   node scripts/cleanup-chat.mjs
 */
import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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
  console.log(`[${new Date().toISOString()}] Starting Chat Retention Cleanup...`);

  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
  });

  try {
    let totalDeleted = 0;
    const batchSize = 1000;

    while (true) {
      const [res] = await conn.execute(
        "DELETE FROM chat_messages WHERE expires_at <= NOW() LIMIT ?",
        [batchSize],
      );
      const count = res.affectedRows ?? 0;
      totalDeleted += count;
      if (count < batchSize) break;
    }

    const duration = Date.now() - startTime;
    console.log(
      `[${new Date().toISOString()}] Completed! Deleted ${totalDeleted} expired messages in ${duration}ms.`,
    );
  } finally {
    await conn.end();
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Cleanup error:", err);
    process.exit(1);
  });
