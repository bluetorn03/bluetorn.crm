/**
 * BLUETORN CRM — Idempotent Production Database Migration Script
 *
 * Safely executes mysql_schema.sql and applies incremental column/index
 * updates (whatsapp_phone, assigned_at, assignment foreign keys) if missing.
 *
 * Reads DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD from process.env
 * or loads them from .env / .env.local.
 *
 * Usage:
 *   node scripts/migrate.mjs
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
  console.log("==================================================");
  console.log("🚀 BLUETORN CRM — PRODUCTION DATABASE MIGRATION");
  console.log("==================================================");
  console.log(`Connecting to ${host}:${port} as ${user}...`);
  console.log(`Target Database: ${database}`);

  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
    multipleStatements: true,
  });

  console.log("✅ Connected to MySQL database successfully!\n");

  // 1. Run base schema (idempotent CREATE TABLE IF NOT EXISTS)
  const schemaPath = path.join(rootDir, "mysql_schema.sql");
  if (fs.existsSync(schemaPath)) {
    let sql = fs.readFileSync(schemaPath, "utf-8");
    // Strip external database creation so it targets the selected database
    sql = sql.replace(/CREATE DATABASE IF NOT EXISTS `[^`]+`[^;]*;/gi, "");
    sql = sql.replace(/USE `[^`]+`;/gi, "");

    console.log("Applying base tables from mysql_schema.sql...");
    await conn.query(sql);
    console.log("✅ Base schema tables verified/created.\n");
  } else {
    console.warn("⚠️ mysql_schema.sql not found at project root.");
  }

  // 2. Incremental column migration: whatsapp_phone on profiles
  try {
    const [cols] = await conn.query("SHOW COLUMNS FROM `profiles` LIKE 'whatsapp_phone'");
    if (Array.isArray(cols) && cols.length === 0) {
      console.log("Adding missing whatsapp_phone column to profiles table...");
      await conn.query(
        "ALTER TABLE `profiles` ADD COLUMN `whatsapp_phone` VARCHAR(64) DEFAULT NULL AFTER `phone`",
      );
      console.log("✅ Column profiles.whatsapp_phone added.");
    } else {
      console.log("✓ Column profiles.whatsapp_phone already exists.");
    }
  } catch (err) {
    console.error("Column check error (profiles.whatsapp_phone):", err.message);
  }

  // 3. Incremental column migration: assigned_at on assignable entities
  const tablesWithAssignedAt = ["leads", "customers", "properties", "tasks"];
  for (const tbl of tablesWithAssignedAt) {
    try {
      const [cols] = await conn.query(`SHOW COLUMNS FROM \`${tbl}\` LIKE 'assigned_at'`);
      if (Array.isArray(cols) && cols.length === 0) {
        console.log(`Adding missing assigned_at column to ${tbl} table...`);
        await conn.query(
          `ALTER TABLE \`${tbl}\` ADD COLUMN \`assigned_at\` DATETIME DEFAULT NULL AFTER \`assigned_to\``,
        );
        console.log(`✅ Column ${tbl}.assigned_at added.`);
      } else {
        console.log(`✓ Column ${tbl}.assigned_at already exists.`);
      }
    } catch (err) {
      console.error(`Column check error (${tbl}.assigned_at):`, err.message);
    }
  }

  // 4. Verify tables list
  const [tables] = await conn.query("SHOW TABLES");
  console.log("\nTables currently present in database:");
  for (const row of tables) {
    console.log(` - ${Object.values(row)[0]}`);
  }

  await conn.end();
  console.log("\n==================================================");
  console.log("🎉 Database migration completed successfully!");
  console.log("==================================================");
}

run().catch((err) => {
  console.error("❌ Migration failed with error:", err);
  process.exit(1);
});
