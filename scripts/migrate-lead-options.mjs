/**
 * BLUETORN CRM — Lead Options & Schema Migration Script
 *
 * Idempotent, safe migration that:
 * 1. Creates `lead_options` table if missing.
 * 2. Adds nullable option reference columns to `leads` table if missing:
 *    - source_option_id
 *    - location_option_id
 *    - purpose_option_id
 *    - possession_timeline_option_id
 *    - transaction_timeline_option_id
 *    - phase_option_id
 * 3. Adds indexes and foreign keys (ON DELETE SET NULL).
 * 4. Seeds default options for all existing workspaces idempotently.
 * 5. Backfills existing workspace sources and maps existing leads to source_option_id.
 * 6. Preserves all existing lead data and campaign column.
 *
 * Usage: node scripts/migrate-lead-options.mjs
 */
import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import crypto from "crypto";
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

export const DEFAULT_LEAD_OPTIONS = {
  source: [
    { name: "Meta Ads", stable_key: "meta_ads", is_system: 1, sort_order: 1 },
    { name: "Google Ads", stable_key: "google_ads", is_system: 1, sort_order: 2 },
    { name: "Website Forms", stable_key: "website_forms", is_system: 1, sort_order: 3 },
    { name: "Landing Pages", stable_key: "landing_pages", is_system: 1, sort_order: 4 },
    { name: "WhatsApp", stable_key: "whatsapp", is_system: 1, sort_order: 5 },
    { name: "Instagram Ads", stable_key: "instagram_ads", is_system: 1, sort_order: 6 },
    { name: "Manual Entry", stable_key: "manual_entry", is_system: 1, sort_order: 7 },
    { name: "Referral", stable_key: "referral", is_system: 0, sort_order: 8 },
  ],
  location: [
    { name: "Nerul-Seawoods", sort_order: 1 },
    { name: "Juinagar", sort_order: 2 },
    { name: "Ulwe", sort_order: 3 },
    { name: "Panvel", sort_order: 4 },
    { name: "Palaspe", sort_order: 5 },
  ],
  purpose: [
    { name: "Self Use", sort_order: 1 },
    { name: "Investment", sort_order: 2 },
  ],
  possession_timeline: [
    { name: "Immediate", sort_order: 1 },
    { name: "Within 6 months", sort_order: 2 },
    { name: "Within a year", sort_order: 3 },
    { name: "Within 2 years", sort_order: 4 },
    { name: "Within 3 years", sort_order: 5 },
    { name: "More than 3 years", sort_order: 6 },
  ],
  transaction_timeline: [
    { name: "Immediate", sort_order: 1 },
    { name: "Within a Month", sort_order: 2 },
    { name: "Within 3 Months", sort_order: 3 },
    { name: "Within 6 Months", sort_order: 4 },
    { name: "Just Exploring", sort_order: 5 },
  ],
  phase: [
    { name: "Pre launch", sort_order: 1 },
    { name: "Under Construction", sort_order: 2 },
    { name: "Nearby Possession", sort_order: 3 },
    { name: "Ready to move in", sort_order: 4 },
  ],
};

async function columnExists(conn, table, column) {
  const [cols] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [database, table, column],
  );
  return Array.isArray(cols) && cols.length > 0;
}

async function indexExists(conn, table, indexName) {
  const [indexes] = await conn.query(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [database, table, indexName],
  );
  return Array.isArray(indexes) && indexes.length > 0;
}

async function fkExists(conn, table, constraintName) {
  const [fks] = await conn.query(
    `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
    [database, table, constraintName],
  );
  return Array.isArray(fks) && fks.length > 0;
}

/**
 * Idempotently seeds default lead options for a workspace.
 */
export async function ensureDefaultLeadOptions(workspaceId, conn, actorId = null) {
  if (!workspaceId) return;

  for (const [type, items] of Object.entries(DEFAULT_LEAD_OPTIONS)) {
    for (const item of items) {
      // Check if option exists for this workspace + type + name (case-insensitive)
      const [existing] = await conn.query(
        "SELECT id, stable_key FROM lead_options WHERE workspace_id = ? AND type = ? AND LOWER(name) = LOWER(?) LIMIT 1",
        [workspaceId, type, item.name],
      );

      if (Array.isArray(existing) && existing.length > 0) {
        // If option exists but stable_key is missing and default specifies one, update it
        if (item.stable_key && !existing[0].stable_key) {
          await conn.query(
            "UPDATE lead_options SET stable_key = ?, is_system = ? WHERE id = ?",
            [item.stable_key, item.is_system ? 1 : 0, existing[0].id],
          );
        }
      } else {
        const id = crypto.randomUUID();
        await conn.query(
          `INSERT INTO lead_options (id, workspace_id, type, name, stable_key, is_system, is_active, sort_order, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
          [
            id,
            workspaceId,
            type,
            item.name,
            item.stable_key || null,
            item.is_system ? 1 : 0,
            item.sort_order || 0,
            actorId,
            actorId,
          ],
        );
      }
    }
  }
}

export async function migrateLeadOptions(existingConn = null) {
  console.log("==================================================");
  console.log("🚀 MIGRATING LEADS CONFIGURABLE OPTIONS");
  console.log("==================================================");

  let conn = existingConn;
  let closeConn = false;

  if (!conn) {
    conn = await mysql.createConnection({
      host,
      port,
      user,
      password,
      database,
    });
    closeConn = true;
  }

  try {
    // 1. Create lead_options table
    console.log("Verifying `lead_options` table...");
    await conn.query(`
      CREATE TABLE IF NOT EXISTS \`lead_options\` (
        \`id\` VARCHAR(36) NOT NULL,
        \`workspace_id\` VARCHAR(36) NOT NULL,
        \`type\` ENUM('source', 'location', 'purpose', 'possession_timeline', 'transaction_timeline', 'phase') NOT NULL,
        \`name\` VARCHAR(128) NOT NULL,
        \`stable_key\` VARCHAR(64) DEFAULT NULL,
        \`is_system\` TINYINT(1) NOT NULL DEFAULT 0,
        \`is_active\` TINYINT(1) NOT NULL DEFAULT 1,
        \`sort_order\` INT NOT NULL DEFAULT 0,
        \`created_by\` VARCHAR(36) DEFAULT NULL,
        \`updated_by\` VARCHAR(36) DEFAULT NULL,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_lead_options_ws_type_name\` (\`workspace_id\`, \`type\`, \`name\`),
        KEY \`idx_lead_options_ws_type_active\` (\`workspace_id\`, \`type\`, \`is_active\`, \`sort_order\`),
        KEY \`idx_lead_options_ws_stable_key\` (\`workspace_id\`, \`type\`, \`stable_key\`),
        CONSTRAINT \`fk_lead_options_ws\` FOREIGN KEY (\`workspace_id\`) REFERENCES \`workspaces\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("✅ `lead_options` table verified.");

    // 2. Add option columns to `leads` table if missing
    const columnsToAdd = [
      { name: "source_option_id", after: "source" },
      { name: "location_option_id", after: "requirement" },
      { name: "purpose_option_id", after: "location_option_id" },
      { name: "possession_timeline_option_id", after: "purpose_option_id" },
      { name: "transaction_timeline_option_id", after: "possession_timeline_option_id" },
      { name: "phase_option_id", after: "transaction_timeline_option_id" },
    ];

    for (const col of columnsToAdd) {
      const exists = await columnExists(conn, "leads", col.name);
      if (!exists) {
        console.log(`Adding missing column leads.${col.name}...`);
        await conn.query(
          `ALTER TABLE \`leads\` ADD COLUMN \`${col.name}\` VARCHAR(36) DEFAULT NULL AFTER \`${col.after}\``,
        );
        console.log(`✅ Column leads.${col.name} added.`);
      } else {
        console.log(`✓ Column leads.${col.name} already exists.`);
      }
    }

    // 3. Add indexes and foreign keys
    const fksToAdd = [
      { col: "source_option_id", idx: "idx_leads_source_opt", fk: "fk_leads_source_opt" },
      { col: "location_option_id", idx: "idx_leads_location_opt", fk: "fk_leads_location_opt" },
      { col: "purpose_option_id", idx: "idx_leads_purpose_opt", fk: "fk_leads_purpose_opt" },
      { col: "possession_timeline_option_id", idx: "idx_leads_possession_opt", fk: "fk_leads_possession_opt" },
      { col: "transaction_timeline_option_id", idx: "idx_leads_transaction_opt", fk: "fk_leads_transaction_opt" },
      { col: "phase_option_id", idx: "idx_leads_phase_opt", fk: "fk_leads_phase_opt" },
    ];

    for (const item of fksToAdd) {
      const idxPresent = await indexExists(conn, "leads", item.idx);
      if (!idxPresent) {
        console.log(`Adding index leads.${item.idx}...`);
        await conn.query(`ALTER TABLE \`leads\` ADD KEY \`${item.idx}\` (\`${item.col}\`)`);
        console.log(`✅ Index leads.${item.idx} added.`);
      }

      const fkPresent = await fkExists(conn, "leads", item.fk);
      if (!fkPresent) {
        console.log(`Adding foreign key leads.${item.fk}...`);
        try {
          await conn.query(
            `ALTER TABLE \`leads\` ADD CONSTRAINT \`${item.fk}\` FOREIGN KEY (\`${item.col}\`) REFERENCES \`lead_options\` (\`id\`) ON DELETE SET NULL`,
          );
          console.log(`✅ Foreign key leads.${item.fk} added.`);
        } catch (fkErr) {
          console.warn(`Warning adding FK ${item.fk}:`, fkErr.message);
        }
      }
    }

    // 4. Seed default options for every workspace and backfill existing leads
    const [workspaces] = await conn.query("SELECT id, code, name FROM workspaces");
    console.log(`Found ${workspaces.length} workspace(s) to process.`);

    for (const ws of workspaces) {
      console.log(`\nProcessing workspace "${ws.name}" (${ws.code})...`);
      await ensureDefaultLeadOptions(ws.id, conn);

      // Backfill: find all existing distinct source values in leads for this workspace
      const [existingSources] = await conn.query(
        "SELECT DISTINCT source FROM leads WHERE workspace_id = ? AND source IS NOT NULL AND TRIM(source) != ''",
        [ws.id],
      );

      for (const row of existingSources) {
        const srcName = row.source.trim();
        // Check if an option exists for this source name
        const [opt] = await conn.query(
          "SELECT id FROM lead_options WHERE workspace_id = ? AND type = 'source' AND LOWER(name) = LOWER(?) LIMIT 1",
          [ws.id, srcName],
        );

        if (!opt || opt.length === 0) {
          // Check if this source matches a standard alias
          let matchedKey = null;
          const lower = srcName.toLowerCase();
          if (lower === "facebook" || lower.includes("meta")) matchedKey = "meta_ads";
          else if (lower === "website") matchedKey = "website_forms";
          else if (lower === "landing page") matchedKey = "landing_pages";
          else if (lower === "instagram") matchedKey = "instagram_ads";
          else if (lower === "whatsapp") matchedKey = "whatsapp";
          else if (lower === "google ads") matchedKey = "google_ads";

          // If it matches a standard source, find that option
          let optionIdToUse = null;
          if (matchedKey) {
            const [systemOpt] = await conn.query(
              "SELECT id FROM lead_options WHERE workspace_id = ? AND type = 'source' AND stable_key = ? LIMIT 1",
              [ws.id, matchedKey],
            );
            if (systemOpt && systemOpt.length > 0) {
              optionIdToUse = systemOpt[0].id;
            }
          }

          // If no system option found, create this source as a custom active option
          if (!optionIdToUse) {
            const newId = crypto.randomUUID();
            await conn.query(
              `INSERT INTO lead_options (id, workspace_id, type, name, stable_key, is_system, is_active, sort_order)
               VALUES (?, ?, 'source', ?, NULL, 0, 1, 99)`,
              [newId, ws.id, srcName],
            );
            console.log(`Created custom source option "${srcName}" for workspace ${ws.code}`);
          }
        }
      }

      // Map existing leads where source_option_id IS NULL
      const [unmappedLeads] = await conn.query(
        "SELECT id, source FROM leads WHERE workspace_id = ? AND source_option_id IS NULL",
        [ws.id],
      );

      console.log(`Mapping ${unmappedLeads.length} unmapped lead(s) to source_option_id...`);
      for (const lead of unmappedLeads) {
        const src = (lead.source || "Manual Entry").trim();
        const lower = src.toLowerCase();

        // Check exact match first
        let [match] = await conn.query(
          "SELECT id FROM lead_options WHERE workspace_id = ? AND type = 'source' AND LOWER(name) = LOWER(?) LIMIT 1",
          [ws.id, src],
        );

        // Alias match for legacy sources
        if (!match || match.length === 0) {
          let aliasKey = null;
          if (lower === "facebook" || lower.includes("meta")) aliasKey = "meta_ads";
          else if (lower === "website") aliasKey = "website_forms";
          else if (lower === "landing page") aliasKey = "landing_pages";
          else if (lower === "instagram") aliasKey = "instagram_ads";
          else if (lower === "whatsapp") aliasKey = "whatsapp";
          else if (lower === "google ads") aliasKey = "google_ads";
          else if (lower === "manual entry") aliasKey = "manual_entry";

          if (aliasKey) {
            [match] = await conn.query(
              "SELECT id FROM lead_options WHERE workspace_id = ? AND type = 'source' AND stable_key = ? LIMIT 1",
              [ws.id, aliasKey],
            );
          }
        }

        // Fallback to manual entry option if still not matched
        if (!match || match.length === 0) {
          [match] = await conn.query(
            "SELECT id FROM lead_options WHERE workspace_id = ? AND type = 'source' AND stable_key = 'manual_entry' LIMIT 1",
            [ws.id],
          );
        }

        if (match && match.length > 0) {
          await conn.query("UPDATE leads SET source_option_id = ? WHERE id = ?", [
            match[0].id,
            lead.id,
          ]);
        }
      }
      console.log(`✓ Workspace ${ws.code} processed successfully.`);
    }

    console.log("\n✅ Lead options migration completed successfully!");
  } finally {
    if (closeConn && conn) {
      await conn.end();
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith("migrate-lead-options.mjs")) {
  migrateLeadOptions().catch((err) => {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  });
}
