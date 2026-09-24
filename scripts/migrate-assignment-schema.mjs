/**
 * BLUETORN CRM — Live Database Migration for Assignment Architecture
 * 
 * Safely adds indexes and foreign keys for assigned_to on properties and tasks,
 * ensuring referential integrity with profiles(id).
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
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
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

async function migrate() {
  const connection = await mysql.createConnection({
    host,
    port,
    database,
    user,
    password,
  });

  console.log("Connected to MySQL database:", database);

  try {
    // 1. Clean any invalid orphaned assigned_to values in properties and tasks
    console.log("Checking for orphaned assigned_to values in properties...");
    const [orphanProps] = await connection.query(
      `SELECT id, assigned_to FROM properties WHERE assigned_to IS NOT NULL AND assigned_to NOT IN (SELECT id FROM profiles)`
    );
    if (orphanProps.length > 0) {
      console.log(`Found ${orphanProps.length} orphaned assigned_to in properties. Nullifying...`);
      await connection.query(
        `UPDATE properties SET assigned_to = NULL WHERE assigned_to IS NOT NULL AND assigned_to NOT IN (SELECT id FROM profiles)`
      );
    } else {
      console.log("No orphaned assigned_to in properties.");
    }

    console.log("Checking for orphaned assigned_to values in tasks...");
    const [orphanTasks] = await connection.query(
      `SELECT id, assigned_to FROM tasks WHERE assigned_to IS NOT NULL AND assigned_to NOT IN (SELECT id FROM profiles)`
    );
    if (orphanTasks.length > 0) {
      console.log(`Found ${orphanTasks.length} orphaned assigned_to in tasks. Nullifying...`);
      await connection.query(
        `UPDATE tasks SET assigned_to = NULL WHERE assigned_to IS NOT NULL AND assigned_to NOT IN (SELECT id FROM profiles)`
      );
    } else {
      console.log("No orphaned assigned_to in tasks.");
    }

    // 2. Check if indexes exist on properties(assigned_to) and tasks(assigned_to)
    const [propIndexes] = await connection.query(
      `SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'properties' AND COLUMN_NAME = 'assigned_to'`,
      [database]
    );
    if (propIndexes.length === 0) {
      console.log("Adding index idx_properties_assigned on properties(assigned_to)...");
      await connection.query(`ALTER TABLE properties ADD INDEX idx_properties_assigned (assigned_to)`);
    } else {
      console.log("Index on properties(assigned_to) already exists.");
    }

    const [taskIndexes] = await connection.query(
      `SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'assigned_to'`,
      [database]
    );
    if (taskIndexes.length === 0) {
      console.log("Adding index idx_tasks_assigned on tasks(assigned_to)...");
      await connection.query(`ALTER TABLE tasks ADD INDEX idx_tasks_assigned (assigned_to)`);
    } else {
      console.log("Index on tasks(assigned_to) already exists.");
    }

    // 3. Check foreign key constraints
    const [propFks] = await connection.query(
      `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'properties' AND COLUMN_NAME = 'assigned_to' AND REFERENCED_TABLE_NAME = 'profiles'`,
      [database]
    );
    if (propFks.length === 0) {
      console.log("Adding foreign key fk_properties_assigned on properties(assigned_to) -> profiles(id)...");
      await connection.query(
        `ALTER TABLE properties ADD CONSTRAINT fk_properties_assigned FOREIGN KEY (assigned_to) REFERENCES profiles (id) ON DELETE SET NULL`
      );
    } else {
      console.log("Foreign key on properties(assigned_to) already exists:", propFks[0].CONSTRAINT_NAME);
    }

    const [taskFks] = await connection.query(
      `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'assigned_to' AND REFERENCED_TABLE_NAME = 'profiles'`,
      [database]
    );
    if (taskFks.length === 0) {
      console.log("Adding foreign key fk_tasks_assigned on tasks(assigned_to) -> profiles(id)...");
      await connection.query(
        `ALTER TABLE tasks ADD CONSTRAINT fk_tasks_assigned FOREIGN KEY (assigned_to) REFERENCES profiles (id) ON DELETE SET NULL`
      );
    } else {
      console.log("Foreign key on tasks(assigned_to) already exists:", taskFks[0].CONSTRAINT_NAME);
    }

    console.log("✅ Live database schema migration completed successfully!");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

migrate();
