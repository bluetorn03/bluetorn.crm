/**
 * BLUETORN CRM — Team Chat V1 Migration Script
 *
 * Idempotent, safe migration that:
 * 1. Adds `chat_retention_days` (default 15) to `workspaces` table if missing.
 * 2. Creates `chat_conversations` table if missing.
 * 3. Creates `chat_messages` table if missing.
 *
 * Usage: node scripts/migrate-team-chat-v1.mjs
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

async function tableExists(conn, table) {
  const [tables] = await conn.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [database, table],
  );
  return Array.isArray(tables) && tables.length > 0;
}

export async function migrateTeamChatV1(externalConn) {
  let conn = externalConn;
  let shouldClose = false;

  if (!conn) {
    conn = await mysql.createConnection({
      host,
      port,
      user,
      password,
      database,
      multipleStatements: true,
    });
    shouldClose = true;
  }

  try {
    console.log("=== Migrating Team Chat V1 Schema ===");

    // 1. Column: chat_retention_days on workspaces
    const hasRetentionCol = await columnExists(conn, "workspaces", "chat_retention_days");
    if (!hasRetentionCol) {
      console.log("Adding column `workspaces.chat_retention_days` (default 15)...");
      await conn.query(
        "ALTER TABLE `workspaces` ADD COLUMN `chat_retention_days` INT NOT NULL DEFAULT 15 AFTER `seat_limit`",
      );
      console.log("✅ Column `chat_retention_days` added.");
    } else {
      console.log("✓ Column `workspaces.chat_retention_days` already exists.");
    }

    // Ensure all existing workspaces have valid retention days (<= 15)
    await conn.query(
      "UPDATE `workspaces` SET `chat_retention_days` = 15 WHERE `chat_retention_days` IS NULL OR `chat_retention_days` <= 0 OR `chat_retention_days` > 15",
    );

    // 2. Table: chat_conversations
    const hasConvTable = await tableExists(conn, "chat_conversations");
    if (!hasConvTable) {
      console.log("Creating table `chat_conversations`...");
      await conn.query(`
        CREATE TABLE IF NOT EXISTS \`chat_conversations\` (
          \`id\` VARCHAR(36) NOT NULL,
          \`workspace_id\` VARCHAR(36) NOT NULL,
          \`user1_id\` VARCHAR(36) NOT NULL,
          \`user2_id\` VARCHAR(36) NOT NULL,
          \`last_message_at\` DATETIME DEFAULT NULL,
          \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`uk_chat_conversation_pair\` (\`workspace_id\`, \`user1_id\`, \`user2_id\`),
          KEY \`idx_chat_conv_ws\` (\`workspace_id\`),
          KEY \`idx_chat_conv_u1\` (\`user1_id\`),
          KEY \`idx_chat_conv_u2\` (\`user2_id\`),
          KEY \`idx_chat_conv_last_msg\` (\`workspace_id\`, \`last_message_at\`),
          CONSTRAINT \`fk_chat_conv_ws\` FOREIGN KEY (\`workspace_id\`) REFERENCES \`workspaces\` (\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_chat_conv_u1\` FOREIGN KEY (\`user1_id\`) REFERENCES \`profiles\` (\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_chat_conv_u2\` FOREIGN KEY (\`user2_id\`) REFERENCES \`profiles\` (\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      console.log("✅ Table `chat_conversations` created.");
    } else {
      console.log("✓ Table `chat_conversations` already exists.");
    }

    // 3. Table: chat_messages
    const hasMsgTable = await tableExists(conn, "chat_messages");
    if (!hasMsgTable) {
      console.log("Creating table `chat_messages`...");
      await conn.query(`
        CREATE TABLE IF NOT EXISTS \`chat_messages\` (
          \`id\` VARCHAR(36) NOT NULL,
          \`workspace_id\` VARCHAR(36) NOT NULL,
          \`conversation_id\` VARCHAR(36) NOT NULL,
          \`sender_id\` VARCHAR(36) NOT NULL,
          \`receiver_id\` VARCHAR(36) NOT NULL,
          \`body\` TEXT NOT NULL,
          \`is_read\` TINYINT(1) NOT NULL DEFAULT 0,
          \`read_at\` DATETIME DEFAULT NULL,
          \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`expires_at\` DATETIME NOT NULL,
          PRIMARY KEY (\`id\`),
          KEY \`idx_chat_msg_ws\` (\`workspace_id\`),
          KEY \`idx_chat_msg_conv_created\` (\`conversation_id\`, \`created_at\`),
          KEY \`idx_chat_msg_receiver_read\` (\`workspace_id\`, \`receiver_id\`, \`is_read\`),
          KEY \`idx_chat_msg_expires\` (\`expires_at\`),
          CONSTRAINT \`fk_chat_msg_ws\` FOREIGN KEY (\`workspace_id\`) REFERENCES \`workspaces\` (\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_chat_msg_conv\` FOREIGN KEY (\`conversation_id\`) REFERENCES \`chat_conversations\` (\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_chat_msg_sender\` FOREIGN KEY (\`sender_id\`) REFERENCES \`profiles\` (\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_chat_msg_receiver\` FOREIGN KEY (\`receiver_id\`) REFERENCES \`profiles\` (\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      console.log("✅ Table `chat_messages` created.");
    } else {
      console.log("✓ Table `chat_messages` already exists.");
    }

    console.log("=== Team Chat V1 Migration Completed Successfully ===");
  } finally {
    if (shouldClose && conn) {
      await conn.end();
    }
  }
}

// Direct execution
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  migrateTeamChatV1()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
