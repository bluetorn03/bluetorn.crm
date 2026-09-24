/**
 * BLUETORN CRM — Database Inspection Script
 *
 * Safely inspects the live MySQL database configuration and schema.
 * Run with: node scripts/inspect-db.mjs
 */
import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

// Load .env manually if not already present in environment
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

console.log("==================================================");
console.log("🔍 BLUETORN CRM — LIVE DATABASE AUDIT / INSPECTION");
console.log("==================================================");
console.log(`Host:     ${host}`);
console.log(`Port:     ${port}`);
console.log(`Database: ${database}`);
console.log(`User:     ${user}`);
console.log(`Password: ${password ? "******** (configured)" : "(empty)"}`);
console.log("--------------------------------------------------");

async function inspect() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host,
      port,
      database,
      user,
      password,
    });
    console.log("✅ Database connection successful!\n");

    const targetTables = [
      "leads",
      "customers",
      "properties",
      "tasks",
      "workspaces",
      "users",
      "workspace_members",
      "notifications",
      "activity_logs",
    ];

    // Check existing tables
    const [tables] = await connection.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?`,
      [database],
    );
    const existingTableNames = tables.map((t) => t.TABLE_NAME);
    console.log("📋 All Tables in Database:", existingTableNames.join(", "));
    console.log("\n==================================================");

    for (const table of targetTables) {
      if (!existingTableNames.includes(table)) {
        console.log(`⚠️ Table '${table}' DOES NOT EXIST in database '${database}'`);
        continue;
      }

      console.log(`\n📦 TABLE: ${table}`);
      console.log("--------------------------------------------------");

      // Columns
      const [columns] = await connection.query(
        `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY, EXTRA 
         FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? 
         ORDER BY ORDINAL_POSITION`,
        [database, table],
      );

      console.log("Columns:");
      for (const col of columns) {
        const isAssignmentCol = ["assigned_to", "assigned_at", "created_by", "owner_id"].includes(
          col.COLUMN_NAME,
        );
        const marker = isAssignmentCol ? " 👈 [ASSIGNMENT FIELD]" : "";
        console.log(
          `  - ${col.COLUMN_NAME.padEnd(20)} ${col.COLUMN_TYPE.padEnd(20)} Nullable: ${col.IS_NULLABLE.padEnd(4)} Key: ${col.COLUMN_KEY.padEnd(4)} Default: ${String(col.COLUMN_DEFAULT)}${marker}`,
        );
      }

      // Foreign Keys
      const [fks] = await connection.query(
        `SELECT 
           kcu.COLUMN_NAME, 
           kcu.CONSTRAINT_NAME, 
           kcu.REFERENCED_TABLE_NAME, 
           kcu.REFERENCED_COLUMN_NAME,
           rc.UPDATE_RULE,
           rc.DELETE_RULE
         FROM information_schema.KEY_COLUMN_USAGE kcu
         JOIN information_schema.REFERENTIAL_CONSTRAINTS rc 
           ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME 
           AND kcu.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
         WHERE kcu.TABLE_SCHEMA = ? AND kcu.TABLE_NAME = ? AND kcu.REFERENCED_TABLE_NAME IS NOT NULL`,
        [database, table],
      );

      if (fks.length > 0) {
        console.log("Foreign Keys:");
        for (const fk of fks) {
          console.log(
            `  - ${fk.COLUMN_NAME} -> ${fk.REFERENCED_TABLE_NAME}(${fk.REFERENCED_COLUMN_NAME}) [${fk.CONSTRAINT_NAME}] (ON DELETE ${fk.DELETE_RULE}, ON UPDATE ${fk.UPDATE_RULE})`,
          );
        }
      } else {
        console.log("Foreign Keys: None");
      }

      // Indexes
      const [indexes] = await connection.query(
        `SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME, SEQ_IN_INDEX 
         FROM information_schema.STATISTICS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? 
         ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
        [database, table],
      );

      const idxMap = {};
      for (const idx of indexes) {
        if (!idxMap[idx.INDEX_NAME]) {
          idxMap[idx.INDEX_NAME] = { unique: idx.NON_UNIQUE === 0, cols: [] };
        }
        idxMap[idx.INDEX_NAME].cols.push(idx.COLUMN_NAME);
      }

      console.log("Indexes:");
      for (const [idxName, info] of Object.entries(idxMap)) {
        console.log(
          `  - ${idxName} (${info.unique ? "UNIQUE" : "INDEX"}): [${info.cols.join(", ")}]`,
        );
      }

      // Row count
      const [cnt] = await connection.query(`SELECT COUNT(*) as total FROM \`${table}\``);
      console.log(`Total Rows: ${cnt[0].total}`);
    }

    console.log("\n==================================================");
    console.log("✨ Live Database Inspection Completed Successfully.");
    console.log("==================================================");
  } catch (error) {
    console.error("❌ Database inspection failed:", error.message);
    process.exitCode = 1;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

inspect();
