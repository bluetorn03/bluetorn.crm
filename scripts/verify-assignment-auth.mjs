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

async function runSecurityAudit() {
  console.log("=========================================");
  console.log("CRM ASSIGNMENT SECURITY & AUDIT VALIDATION");
  console.log("=========================================\n");

  const connection = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
  });

  try {
    const tables = ["leads", "customers", "properties", "tasks"];
    for (const table of tables) {
      const [cols] = await connection.query(`SHOW COLUMNS FROM \`${table}\``);
      const assignedToCol = cols.find((c) => c.Field === "assigned_to");
      const assignedAtCol = cols.find((c) => c.Field === "assigned_at");

      console.log(`[SCHEMA CHECK] Table '${table}':`);
      console.log(
        `  - assigned_to column: ${assignedToCol ? `${assignedToCol.Type} (Null: ${assignedToCol.Null})` : "MISSING"}`,
      );
      console.log(
        `  - assigned_at column: ${assignedAtCol ? `${assignedAtCol.Type} (Null: ${assignedAtCol.Null})` : "MISSING"}`,
      );

      const [indexes] = await connection.query(`SHOW INDEX FROM \`${table}\``);
      const assignedIdx = indexes.find((i) => i.Column_name === "assigned_to");
      console.log(`  - assigned_to index: ${assignedIdx ? assignedIdx.Key_name : "NO INDEX"}`);
    }

    console.log("\n[FOREIGN KEYS CHECK]");
    const [fks] = await connection.query(`
      SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL AND COLUMN_NAME = 'assigned_to'
    `);
    fks.forEach((fk) => {
      console.log(
        `  - ${fk.TABLE_NAME}.${fk.COLUMN_NAME} -> ${fk.REFERENCED_TABLE_NAME}(${fk.REFERENCED_COLUMN_NAME}) [${fk.CONSTRAINT_NAME}]`,
      );
    });

    console.log("\n[REFERENTIAL INTEGRITY CHECK]");
    for (const table of tables) {
      const [dangling] = await connection.query(`
        SELECT t.id, t.assigned_to 
        FROM \`${table}\` t 
        LEFT JOIN profiles p ON t.assigned_to = p.id 
        WHERE t.assigned_to IS NOT NULL AND p.id IS NULL
      `);
      console.log(`  - Table '${table}': ${dangling.length} dangling foreign keys.`);
    }

    console.log("\n=========================================");
    console.log("ALL DATABASE CHECKS COMPLETED SUCCESSFULLY!");
    console.log("=========================================");
    await connection.end();
    process.exit(0);
  } catch (err) {
    console.error("Audit verification error:", err);
    await connection.end();
    process.exit(1);
  }
}

runSecurityAudit();
