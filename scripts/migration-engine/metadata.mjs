/**
 * BLUETORN CRM — Migration Metadata & Schema Verification Engine
 *
 * Manages the `_schema_migrations` tracking table:
 * - Bootstraps table idempotently (NOT as an application migration)
 * - Loads migration history
 * - Records newly applied migrations
 * - Verifies row existence and checksum correctness post-migration
 * - Verifies baseline schema compatibility for migrations 001–004
 */

export const METADATA_TABLE_NAME = "_schema_migrations";

/**
 * Bootstrap the _schema_migrations metadata table independently and idempotently.
 *
 * @param {Object} conn Active mysql2 connection
 */
export async function bootstrapMetadataTable(conn) {
  const ddl = `
    CREATE TABLE IF NOT EXISTS \`${METADATA_TABLE_NAME}\` (
      \`version\` VARCHAR(64) NOT NULL,
      \`name\` VARCHAR(255) NOT NULL,
      \`checksum\` CHAR(64) NOT NULL,
      \`applied_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`execution_time_ms\` INT NOT NULL,
      \`applied_by\` VARCHAR(128) NOT NULL,
      PRIMARY KEY (\`version\`),
      KEY \`idx_schema_migrations_applied_at\` (\`applied_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;
  await conn.query(ddl);
}

/**
 * Check if the metadata table exists in the database.
 *
 * @param {Object} conn Active mysql2 connection
 * @param {string} database Database name
 * @returns {Promise<boolean>}
 */
export async function metadataTableExists(conn, database) {
  const [rows] = await conn.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [database, METADATA_TABLE_NAME],
  );
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * Load all applied migrations from _schema_migrations.
 *
 * @param {Object} conn Active mysql2 connection
 * @returns {Promise<Array<Object>>} Applied migration records sorted by version
 */
export async function loadMigrationHistory(conn) {
  const [rows] = await conn.query(
    `SELECT version, name, checksum, applied_at, execution_time_ms, applied_by ` +
      `FROM \`${METADATA_TABLE_NAME}\` ORDER BY version ASC`,
  );
  return rows.map((r) => ({
    version: String(r.version),
    name: String(r.name),
    checksum: String(r.checksum),
    applied_at: r.applied_at,
    execution_time_ms: Number(r.execution_time_ms),
    applied_by: String(r.applied_by),
  }));
}

/**
 * Record a successfully applied migration into _schema_migrations.
 *
 * @param {Object} conn Active mysql2 connection
 * @param {Object} record Migration metadata
 */
export async function recordMigration(conn, record) {
  const { version, name, checksum, executionTimeMs, appliedBy } = record;
  await conn.query(
    `INSERT INTO \`${METADATA_TABLE_NAME}\` ` +
      `(version, name, checksum, applied_at, execution_time_ms, applied_by) ` +
      `VALUES (?, ?, ?, NOW(), ?, ?)`,
    [version, name, checksum, executionTimeMs, appliedBy],
  );
}

/**
 * Verify that a specific migration is correctly recorded and its checksum matches.
 *
 * @param {Object} conn Active mysql2 connection
 * @param {string} version Version identifier
 * @param {string} expectedChecksum Expected SHA-256 hash
 */
export async function verifyAppliedMigrationRow(conn, version, expectedChecksum) {
  const [rows] = await conn.query(
    `SELECT version, name, checksum, applied_at FROM \`${METADATA_TABLE_NAME}\` WHERE version = ?`,
    [version],
  );
  if (!rows || rows.length === 0) {
    throw new Error(
      `[POST-MIGRATION VERIFICATION FAILED] Migration version '${version}' is not recorded in ${METADATA_TABLE_NAME}.`,
    );
  }
  const row = rows[0];
  if (row.checksum !== expectedChecksum) {
    throw new Error(
      `[POST-MIGRATION VERIFICATION FAILED] Checksum mismatch in ${METADATA_TABLE_NAME} for version '${version}': ` +
        `expected '${expectedChecksum}', recorded '${row.checksum}'.`,
    );
  }
  return row;
}

/**
 * Check whether a table exists in the target database.
 */
export async function tableExists(conn, database, tableName) {
  const [rows] = await conn.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [database, tableName],
  );
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * Check whether a column exists in a specific table.
 */
export async function columnExists(conn, database, tableName, columnName) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [database, tableName, columnName],
  );
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * Verify that the target database schema matches expected baseline requirements
 * for migrations 001 through 004 before registering them as applied.
 *
 * @param {Object} conn Active mysql2 connection
 * @param {string} database Database name
 * @returns {Promise<{ compatible: boolean, missing: string[] }>}
 */
export async function verifyBaselineSchema(conn, database) {
  const missing = [];

  // 1. Checks for 001_finance_v1.sql
  if (!(await tableExists(conn, database, "user_permissions"))) {
    missing.push("Table 'user_permissions' (from 001_finance_v1.sql)");
  }
  if (!(await tableExists(conn, database, "payments"))) {
    missing.push("Table 'payments' (from 001_finance_v1.sql)");
  }
  if (!(await columnExists(conn, database, "workspaces", "legal_name"))) {
    missing.push("Column 'workspaces.legal_name' (from 001_finance_v1.sql)");
  }
  if (!(await columnExists(conn, database, "workspaces", "gstin"))) {
    missing.push("Column 'workspaces.gstin' (from 001_finance_v1.sql)");
  }
  if (!(await columnExists(conn, database, "invoices", "taxable_amount"))) {
    missing.push("Column 'invoices.taxable_amount' (from 001_finance_v1.sql)");
  }
  if (!(await columnExists(conn, database, "invoices", "financial_year"))) {
    missing.push("Column 'invoices.financial_year' (from 001_finance_v1.sql)");
  }

  // 2. Checks for 002_team_chat_v1.sql
  if (!(await tableExists(conn, database, "chat_conversations"))) {
    missing.push("Table 'chat_conversations' (from 002_team_chat_v1.sql)");
  }
  if (!(await tableExists(conn, database, "chat_messages"))) {
    missing.push("Table 'chat_messages' (from 002_team_chat_v1.sql)");
  }
  if (!(await columnExists(conn, database, "workspaces", "chat_retention_days"))) {
    missing.push("Column 'workspaces.chat_retention_days' (from 002_team_chat_v1.sql)");
  }

  // 3. Checks for 003_team_chat_groups_v1_1.sql
  if (!(await tableExists(conn, database, "chat_conversation_members"))) {
    missing.push("Table 'chat_conversation_members' (from 003_team_chat_groups_v1_1.sql)");
  }
  if (!(await columnExists(conn, database, "chat_conversations", "type"))) {
    missing.push("Column 'chat_conversations.type' (from 003_team_chat_groups_v1_1.sql)");
  }
  if (!(await columnExists(conn, database, "chat_conversations", "title"))) {
    missing.push("Column 'chat_conversations.title' (from 003_team_chat_groups_v1_1.sql)");
  }

  // 4. Checks for 004_leads_configurable_options.sql
  if (!(await tableExists(conn, database, "lead_options"))) {
    missing.push("Table 'lead_options' (from 004_leads_configurable_options.sql)");
  }
  if (!(await columnExists(conn, database, "leads", "source_option_id"))) {
    missing.push("Column 'leads.source_option_id' (from 004_leads_configurable_options.sql)");
  }
  if (!(await columnExists(conn, database, "leads", "location_option_id"))) {
    missing.push("Column 'leads.location_option_id' (from 004_leads_configurable_options.sql)");
  }
  if (!(await columnExists(conn, database, "leads", "phase_option_id"))) {
    missing.push("Column 'leads.phase_option_id' (from 004_leads_configurable_options.sql)");
  }

  return {
    compatible: missing.length === 0,
    missing,
  };
}
