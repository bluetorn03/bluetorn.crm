/**
 * BLUETORN CRM — Team Chat Groups V1.1 Migration Runner
 *
 * Idempotent, safe migration that:
 * 1. Modifies `chat_conversations` (makes user1_id, user2_id nullable).
 * 2. Adds `type`, `title`, `description`, `owner_id`, `status` columns to `chat_conversations`.
 * 3. Modifies `chat_messages` (makes receiver_id nullable for group messages).
 * 4. Creates `chat_conversation_members` table if missing.
 *
 * Usage: node scripts/migrate-team-chat-groups.mjs
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

async function columnExists(conn, table, column) {
  const [cols] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [database, table, column],
  );
  return Array.isArray(cols) && cols.length > 0;
}

async function indexExists(conn, table, indexName) {
  const [idxs] = await conn.query(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [database, table, indexName],
  );
  return Array.isArray(idxs) && idxs.length > 0;
}

async function tableExists(conn, tableName) {
  const [tbls] = await conn.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [database, tableName],
  );
  return Array.isArray(tbls) && tbls.length > 0;
}

async function run() {
  console.log("==================================================");
  console.log("🚀 BLUETORN CRM — TEAM CHAT GROUPS V1.1 MIGRATION");
  console.log("==================================================");
  console.log(`Connecting to MySQL database '${database}' on ${host}:${port} as '${user}'...`);

  let conn;
  try {
    conn = await mysql.createConnection({
      host,
      port,
      user,
      password,
      database,
      multipleStatements: true,
    });
    console.log("✓ Connected to MySQL database successfully.\n");

    // 1. Check & modify chat_conversations
    console.log("[STEP 1] Checking `chat_conversations` table...");
    if (await tableExists(conn, "chat_conversations")) {
      console.log("  → Making user1_id and user2_id nullable in chat_conversations...");
      await conn.query(`
        ALTER TABLE chat_conversations
        MODIFY COLUMN user1_id VARCHAR(36) NULL,
        MODIFY COLUMN user2_id VARCHAR(36) NULL
      `);
      console.log("  ✓ user1_id and user2_id are now nullable.");

      if (!(await columnExists(conn, "chat_conversations", "type"))) {
        console.log("  → Adding 'type' column to chat_conversations...");
        await conn.query(`
          ALTER TABLE chat_conversations
          ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT 'direct' AFTER workspace_id
        `);
        console.log("  ✓ 'type' column added.");
      } else {
        console.log("  ✓ 'type' column already exists.");
      }

      if (!(await columnExists(conn, "chat_conversations", "title"))) {
        console.log("  → Adding 'title' column to chat_conversations...");
        await conn.query(`
          ALTER TABLE chat_conversations
          ADD COLUMN title VARCHAR(120) NULL AFTER type
        `);
        console.log("  ✓ 'title' column added.");
      } else {
        console.log("  ✓ 'title' column already exists.");
      }

      if (!(await columnExists(conn, "chat_conversations", "description"))) {
        console.log("  → Adding 'description' column to chat_conversations...");
        await conn.query(`
          ALTER TABLE chat_conversations
          ADD COLUMN description TEXT NULL AFTER title
        `);
        console.log("  ✓ 'description' column added.");
      } else {
        console.log("  ✓ 'description' column already exists.");
      }

      if (!(await columnExists(conn, "chat_conversations", "owner_id"))) {
        console.log("  → Adding 'owner_id' column to chat_conversations...");
        await conn.query(`
          ALTER TABLE chat_conversations
          ADD COLUMN owner_id VARCHAR(36) NULL AFTER description
        `);
        console.log("  ✓ 'owner_id' column added.");
      } else {
        console.log("  ✓ 'owner_id' column already exists.");
      }

      if (!(await columnExists(conn, "chat_conversations", "status"))) {
        console.log("  → Adding 'status' column to chat_conversations...");
        await conn.query(`
          ALTER TABLE chat_conversations
          ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active' AFTER owner_id
        `);
        console.log("  ✓ 'status' column added.");
      } else {
        console.log("  ✓ 'status' column already exists.");
      }

      if (!(await indexExists(conn, "chat_conversations", "idx_chat_conv_ws_type_status"))) {
        console.log("  → Adding index `idx_chat_conv_ws_type_status`...");
        await conn.query(`
          ALTER TABLE chat_conversations
          ADD INDEX idx_chat_conv_ws_type_status (workspace_id, type, status)
        `);
        console.log("  ✓ Index idx_chat_conv_ws_type_status created.");
      }
    } else {
      console.warn("  ⚠ chat_conversations table does not exist. Please run migrate-team-chat-v1.mjs first.");
    }

    // 2. Modify chat_messages receiver_id
    console.log("\n[STEP 2] Checking `chat_messages` table...");
    if (await tableExists(conn, "chat_messages")) {
      console.log("  → Making receiver_id nullable in chat_messages...");
      await conn.query(`
        ALTER TABLE chat_messages
        MODIFY COLUMN receiver_id VARCHAR(36) NULL
      `);
      console.log("  ✓ receiver_id is now nullable in chat_messages.");
    }

    // 3. Create chat_conversation_members table
    console.log("\n[STEP 3] Checking `chat_conversation_members` table...");
    if (!(await tableExists(conn, "chat_conversation_members"))) {
      console.log("  → Creating table `chat_conversation_members`...");
      await conn.query(`
        CREATE TABLE chat_conversation_members (
          id VARCHAR(36) NOT NULL,
          conversation_id VARCHAR(36) NOT NULL,
          workspace_id VARCHAR(36) NOT NULL,
          user_id VARCHAR(36) NOT NULL,
          role VARCHAR(20) NOT NULL DEFAULT 'member',
          joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          left_at DATETIME DEFAULT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'active',
          last_read_at DATETIME DEFAULT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uk_conv_member (conversation_id, user_id),
          KEY idx_conv_members_user (user_id, status),
          KEY idx_conv_members_ws (workspace_id),
          KEY idx_conv_members_joined (conversation_id, joined_at),
          CONSTRAINT fk_conv_members_conv FOREIGN KEY (conversation_id) REFERENCES chat_conversations (id) ON DELETE CASCADE,
          CONSTRAINT fk_conv_members_ws FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
          CONSTRAINT fk_conv_members_user FOREIGN KEY (user_id) REFERENCES profiles (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      console.log("  ✓ Table `chat_conversation_members` created.");
    } else {
      console.log("  ✓ Table `chat_conversation_members` already exists.");
    }

    console.log("\n==================================================");
    console.log("✨ TEAM CHAT GROUPS V1.1 MIGRATION COMPLETE");
    console.log("==================================================");
  } catch (err) {
    console.error("Migration error:", err);
    process.exit(1);
  } finally {
    if (conn) {
      await conn.end();
    }
  }
}

run();
