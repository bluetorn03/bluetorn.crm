/**
 * BLUETORN CRM — Finance V1 Migration Script
 *
 * Idempotent, safe migration that:
 * 1. Creates `user_permissions` table
 * 2. Adds billing identity columns to `workspaces`
 * 3. Adds attribution, GST, lifecycle columns to `invoices`
 * 4. Adds HSN/SAC, unit, rate, discount, tax breakdown columns to `invoice_items`
 * 5. Adds attribution and reversal columns to `payments`
 *
 * Usage: node scripts/migrate-finance-v1.mjs
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

async function addColumnIfMissing(conn, table, column, definition) {
  const exists = await columnExists(conn, table, column);
  if (!exists) {
    console.log(`Adding column \`${table}\`.\`${column}\`...`);
    await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    console.log(`  ✓ Column \`${table}\`.\`${column}\` added.`);
  } else {
    console.log(`  ✓ Column \`${table}\`.\`${column}\` already exists.`);
  }
}

async function foreignKeyExists(conn, table, fkName) {
  const [fks] = await conn.query(
    `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    [database, table, fkName],
  );
  return Array.isArray(fks) && fks.length > 0;
}

async function addForeignKeyIfMissing(conn, table, fkName, fkDefinition) {
  const exists = await foreignKeyExists(conn, table, fkName);
  if (!exists) {
    try {
      console.log(`Adding foreign key [${fkName}] on \`${table}\`...`);
      await conn.query(`ALTER TABLE \`${table}\` ADD CONSTRAINT \`${fkName}\` ${fkDefinition}`);
      console.log(`  ✓ Foreign key [${fkName}] added.`);
    } catch (err) {
      console.warn(`  ⚠️ Could not add FK [${fkName}]:`, err.message);
    }
  } else {
    console.log(`  ✓ Foreign key [${fkName}] already exists.`);
  }
}

async function run() {
  console.log("==================================================");
  console.log("🚀 BLUETORN CRM — FINANCE V1 DATABASE MIGRATION");
  console.log("==================================================");
  console.log(`Connecting to ${host}:${port} (${database}) as ${user}...`);

  const conn = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
  });

  console.log("✅ Connected to MySQL successfully!\n");

  // 1. Table: user_permissions
  console.log("1. Verifying / Creating `user_permissions` table...");
  await conn.query(`
    CREATE TABLE IF NOT EXISTS \`user_permissions\` (
      \`id\` VARCHAR(36) NOT NULL,
      \`workspace_id\` VARCHAR(36) NOT NULL,
      \`user_id\` VARCHAR(36) NOT NULL,
      \`permission\` VARCHAR(64) NOT NULL,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uk_user_permission\` (\`workspace_id\`, \`user_id\`, \`permission\`),
      KEY \`idx_user_perm_lookup\` (\`workspace_id\`, \`user_id\`),
      CONSTRAINT \`fk_user_permissions_ws\` FOREIGN KEY (\`workspace_id\`) REFERENCES \`workspaces\` (\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`fk_user_permissions_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`profiles\` (\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log("  ✓ Table `user_permissions` ready.\n");

  // 2. Table: workspaces billing identity columns
  console.log("2. Updating `workspaces` with company profile & billing identity fields...");
  await addColumnIfMissing(conn, "workspaces", "gstin", "VARCHAR(32) DEFAULT NULL AFTER `address`");
  await addColumnIfMissing(conn, "workspaces", "pan", "VARCHAR(32) DEFAULT NULL AFTER `gstin`");
  await addColumnIfMissing(conn, "workspaces", "state", "VARCHAR(64) DEFAULT NULL AFTER `pan`");
  await addColumnIfMissing(conn, "workspaces", "state_code", "VARCHAR(8) DEFAULT NULL AFTER `state`");
  await addColumnIfMissing(conn, "workspaces", "website", "VARCHAR(255) DEFAULT NULL AFTER `state_code`");
  await addColumnIfMissing(conn, "workspaces", "bank_name", "VARCHAR(128) DEFAULT NULL AFTER `website`");
  await addColumnIfMissing(conn, "workspaces", "bank_account_no", "VARCHAR(64) DEFAULT NULL AFTER `bank_name`");
  await addColumnIfMissing(conn, "workspaces", "bank_account_name", "VARCHAR(128) DEFAULT NULL AFTER `bank_account_no`");
  await addColumnIfMissing(conn, "workspaces", "bank_ifsc", "VARCHAR(32) DEFAULT NULL AFTER `bank_account_name`");
  await addColumnIfMissing(conn, "workspaces", "invoice_prefix", "VARCHAR(32) NOT NULL DEFAULT 'INV' AFTER `bank_ifsc`");
  await addColumnIfMissing(conn, "workspaces", "default_payment_terms_days", "INT NOT NULL DEFAULT 14 AFTER `invoice_prefix`");
  await addColumnIfMissing(conn, "workspaces", "default_invoice_notes", "TEXT DEFAULT NULL AFTER `default_payment_terms_days`");
  await addColumnIfMissing(conn, "workspaces", "default_invoice_terms", "TEXT DEFAULT NULL AFTER `default_invoice_notes`");
  console.log("  ✓ `workspaces` columns verified.\n");

  // 3. Table: invoices columns & foreign keys
  console.log("3. Updating `invoices` with attribution, GST & lifecycle fields...");
  await addColumnIfMissing(conn, "invoices", "lead_id", "VARCHAR(36) DEFAULT NULL AFTER `customer_id`");
  await addColumnIfMissing(conn, "invoices", "assigned_to", "VARCHAR(36) DEFAULT NULL AFTER `property_id`");
  await addColumnIfMissing(conn, "invoices", "updated_by", "VARCHAR(36) DEFAULT NULL AFTER `assigned_to`");
  await addColumnIfMissing(conn, "invoices", "financial_year", "VARCHAR(16) DEFAULT NULL AFTER `invoice_number`");
  await addColumnIfMissing(conn, "invoices", "invoice_type", "VARCHAR(32) NOT NULL DEFAULT 'Tax Invoice' AFTER `financial_year`");
  await addColumnIfMissing(conn, "invoices", "discount", "DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER `subtotal`");
  await addColumnIfMissing(conn, "invoices", "taxable_amount", "DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER `discount`");
  await addColumnIfMissing(conn, "invoices", "cgst", "DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER `taxable_amount`");
  await addColumnIfMissing(conn, "invoices", "sgst", "DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER `cgst`");
  await addColumnIfMissing(conn, "invoices", "igst", "DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER `sgst`");
  await addColumnIfMissing(conn, "invoices", "cess", "DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER `igst`");
  await addColumnIfMissing(conn, "invoices", "place_of_supply", "VARCHAR(64) DEFAULT NULL AFTER `total`");
  await addColumnIfMissing(conn, "invoices", "terms", "TEXT DEFAULT NULL AFTER `notes`");
  await addColumnIfMissing(conn, "invoices", "cancellation_reason", "TEXT DEFAULT NULL AFTER `terms`");
  await addColumnIfMissing(conn, "invoices", "cancelled_at", "DATETIME DEFAULT NULL AFTER `cancellation_reason`");
  await addColumnIfMissing(conn, "invoices", "cancelled_by", "VARCHAR(36) DEFAULT NULL AFTER `cancelled_at`");

  await addForeignKeyIfMissing(conn, "invoices", "fk_invoices_lead", "FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE SET NULL");
  await addForeignKeyIfMissing(conn, "invoices", "fk_invoices_assigned", "FOREIGN KEY (`assigned_to`) REFERENCES `profiles` (`id`) ON DELETE SET NULL");
  await addForeignKeyIfMissing(conn, "invoices", "fk_invoices_updated_by", "FOREIGN KEY (`updated_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL");
  console.log("  ✓ `invoices` columns & FKs verified.\n");

  // 4. Table: invoice_items columns
  console.log("4. Updating `invoice_items` with HSN/SAC, Unit, Rate, Discount, Line Total fields...");
  await addColumnIfMissing(conn, "invoice_items", "hsn_sac", "VARCHAR(32) DEFAULT NULL AFTER `description`");
  await addColumnIfMissing(conn, "invoice_items", "unit", "VARCHAR(32) NOT NULL DEFAULT 'Units' AFTER `quantity`");
  await addColumnIfMissing(conn, "invoice_items", "rate", "DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER `unit`");
  await addColumnIfMissing(conn, "invoice_items", "discount", "DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER `rate`");
  await addColumnIfMissing(conn, "invoice_items", "tax_rate", "DECIMAL(6,3) NOT NULL DEFAULT 0.000 AFTER `discount`");
  await addColumnIfMissing(conn, "invoice_items", "tax_type", "VARCHAR(32) NOT NULL DEFAULT 'GST' AFTER `tax_rate`");
  await addColumnIfMissing(conn, "invoice_items", "tax_amount", "DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER `tax_type`");
  await addColumnIfMissing(conn, "invoice_items", "line_total", "DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER `tax_amount`");

  // Sync historical rate and line_total if they are 0 but unit_amount and amount exist
  await conn.query("UPDATE `invoice_items` SET `rate` = `unit_amount` WHERE `rate` = 0.00 AND `unit_amount` > 0");
  await conn.query("UPDATE `invoice_items` SET `line_total` = `amount` WHERE `line_total` = 0.00 AND `amount` > 0");
  console.log("  ✓ `invoice_items` columns verified.\n");

  // 5. Table: payments columns & foreign keys
  console.log("5. Updating `payments` with attribution & reversal fields...");
  await addColumnIfMissing(conn, "payments", "assigned_to", "VARCHAR(36) DEFAULT NULL AFTER `customer_id`");
  await addColumnIfMissing(conn, "payments", "updated_by", "VARCHAR(36) DEFAULT NULL AFTER `assigned_to`");
  await addColumnIfMissing(conn, "payments", "reversal_reason", "TEXT DEFAULT NULL AFTER `notes`");
  await addColumnIfMissing(conn, "payments", "reversed_at", "DATETIME DEFAULT NULL AFTER `reversal_reason`");
  await addColumnIfMissing(conn, "payments", "reversed_by", "VARCHAR(36) DEFAULT NULL AFTER `reversed_at`");

  await addForeignKeyIfMissing(conn, "payments", "fk_payments_assigned", "FOREIGN KEY (`assigned_to`) REFERENCES `profiles` (`id`) ON DELETE SET NULL");
  await addForeignKeyIfMissing(conn, "payments", "fk_payments_updated_by", "FOREIGN KEY (`updated_by`) REFERENCES `profiles` (`id`) ON DELETE SET NULL");
  console.log("  ✓ `payments` columns & FKs verified.\n");

  await conn.end();
  console.log("==================================================");
  console.log("🎉 Finance V1 Database Migration Completed Successfully!");
  console.log("==================================================");
}

run().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
