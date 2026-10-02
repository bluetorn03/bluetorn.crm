/**
 * BLUETORN CRM — Master Migration Runner & Orchestration Engine
 *
 * Implements:
 * - Safe baseline registration for historical migrations 001–004
 * - Non-destructive --check and --dry-run modes (zero DB writes)
 * - Strict MariaDB advisory locking (GET_LOCK / RELEASE_LOCK)
 * - Forward-only sequential migration execution (005+)
 * - Pre-execution and post-execution SHA-256 integrity verification
 * - Detailed failure stage reporting and immediate abort
 */

import mysql from "mysql2/promise";
import path from "node:path";
import {
  loadProjectEnv,
  validateDatabaseConfig,
  printSafeTargetSummary,
  rootDir,
} from "./config.mjs";
import {
  discoverMigrationFiles,
} from "./integrity.mjs";
import {
  detectDestructiveOperations,
  validateDestructiveSafety,
} from "./destructive.mjs";
import {
  acquireAdvisoryLock,
} from "./lock.mjs";
import {
  METADATA_TABLE_NAME,
  bootstrapMetadataTable,
  metadataTableExists,
  loadMigrationHistory,
  recordMigration,
  verifyAppliedMigrationRow,
  verifyBaselineSchema,
} from "./metadata.mjs";

export const FAILURE_STAGES = {
  TARGET_SAFETY: "TARGET_SAFETY",
  DISCOVERY: "DISCOVERY",
  VALIDATION: "VALIDATION",
  CHECKSUM: "CHECKSUM",
  DB_CONNECTION: "DB_CONNECTION",
  METADATA: "METADATA",
  LOCK: "LOCK",
  BASELINE: "BASELINE",
  SQL_EXECUTION: "SQL_EXECUTION",
  HISTORY_RECORDING: "HISTORY_RECORDING",
  POST_VERIFICATION: "POST_VERIFICATION",
};

/**
 * Format a structured failure report and throw/exit.
 */
export function reportFailure(stage, message, details = {}) {
  const err = new Error(message);
  err.stage = stage;
  err.details = details;
  return err;
}

/**
 * Main migration execution runner.
 *
 * @param {Object} options
 * @param {'migrate'|'baseline'|'check'|'dry-run'} [options.mode='migrate']
 * @param {string} [options.migrationsDir] Path to migrations directory
 * @param {Object} [options.configOverrides] Config overrides for testing
 * @returns {Promise<Object>} Execution result summary
 */
export async function runMigrationEngine(options = {}) {
  const mode = options.mode || "migrate";
  const migrationsDir = options.migrationsDir || path.join(rootDir, "migrations");
  let currentStage = FAILURE_STAGES.DISCOVERY;
  let activeConnection = null;
  let activeLockRelease = null;

  try {
    console.log("==================================================");
    console.log(`🚀 BLUETORN CRM — MIGRATION ENGINE [MODE: ${mode.toUpperCase()}]`);
    console.log("==================================================");

    // ----------------------------------------------------
    // STAGE 1: Discovery & Local Integrity Validation
    // ----------------------------------------------------
    currentStage = FAILURE_STAGES.DISCOVERY;
    const diskMigrations = discoverMigrationFiles(migrationsDir);
    console.log(`📁 Discovered ${diskMigrations.length} migration file(s) in '${path.basename(migrationsDir)}':`);
    for (const m of diskMigrations) {
      console.log(`   - ${m.version}_${m.name}.sql [SHA-256: ${m.checksum.slice(0, 16)}...]`);
    }

    // ----------------------------------------------------
    // STAGE 2: Environment & Database Target Safety
    // ----------------------------------------------------
    currentStage = FAILURE_STAGES.TARGET_SAFETY;
    if (!options.configOverrides) {
      loadProjectEnv();
    }
    const dbConfig = validateDatabaseConfig(options.configOverrides || {});
    printSafeTargetSummary(dbConfig);

    // ----------------------------------------------------
    // STAGE 3: Database Connection
    // ----------------------------------------------------
    currentStage = FAILURE_STAGES.DB_CONNECTION;
    console.log(`Connecting to database '${dbConfig.database}' on ${dbConfig.host}:${dbConfig.port}...`);
    activeConnection = await mysql.createConnection({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database,
      multipleStatements: true,
      timezone: "+00:00",
    });
    console.log("✅ Database connection established.\n");

    // ----------------------------------------------------
    // MODE: --check (Read-only status check)
    // ----------------------------------------------------
    if (mode === "check") {
      currentStage = FAILURE_STAGES.CHECKSUM;
      console.log("🔍 Running --check mode (ZERO WRITES GUARANTEED)...");

      const hasMeta = await metadataTableExists(activeConnection, dbConfig.database);
      let appliedMigrations = [];

      if (hasMeta) {
        appliedMigrations = await loadMigrationHistory(activeConnection);
      }

      const appliedMap = new Map(appliedMigrations.map((m) => [m.version, m]));
      const mismatches = [];
      const pending = [];

      for (const diskM of diskMigrations) {
        if (appliedMap.has(diskM.version)) {
          const applied = appliedMap.get(diskM.version);
          if (applied.checksum !== diskM.checksum) {
            mismatches.push({
              version: diskM.version,
              name: diskM.name,
              storedChecksum: applied.checksum,
              currentChecksum: diskM.checksum,
            });
          }
        } else {
          pending.push(diskM);
        }
      }

      console.log("\n--------------------------------------------------");
      console.log("📊 MIGRATION STATUS SUMMARY (--check)");
      console.log("--------------------------------------------------");
      console.log(`Metadata table (${METADATA_TABLE_NAME}): ${hasMeta ? "Present" : "Not yet bootstrapped"}`);
      console.log(`Total migrations on disk:  ${diskMigrations.length}`);
      console.log(`Total migrations applied:  ${appliedMigrations.length}`);
      console.log(`Total migrations pending:  ${pending.length}`);
      console.log(`Checksum mismatches:       ${mismatches.length}`);

      if (mismatches.length > 0) {
        console.error("\n❌ CHECKSUM MISMATCHES DETECTED:");
        for (const mis of mismatches) {
          console.error(` - Version:          ${mis.version}`);
          console.error(`   Name:             ${mis.name}`);
          console.error(`   Stored Checksum:  ${mis.storedChecksum}`);
          console.error(`   Current Checksum: ${mis.currentChecksum}`);
        }
        throw reportFailure(
          FAILURE_STAGES.CHECKSUM,
          `Checksum mismatch detected on ${mismatches.length} migration(s). Migrations must be immutable!`,
          { mismatches },
        );
      }

      if (pending.length > 0) {
        console.log("\n📋 Pending Migrations:");
        for (const p of pending) {
          console.log(`   - ${p.version}_${p.name}.sql`);
        }
      } else {
        console.log("\n✨ All migrations are up to date!");
      }

      console.log("--------------------------------------------------");
      console.log("✅ Check mode completed successfully with 0 database writes.");
      return {
        mode: "check",
        totalOnDisk: diskMigrations.length,
        totalApplied: appliedMigrations.length,
        pendingCount: pending.length,
        pending: pending.map((p) => p.filename),
        mismatches: [],
      };
    }

    // ----------------------------------------------------
    // MODE: --dry-run (Read-only execution preview)
    // ----------------------------------------------------
    if (mode === "dry-run") {
      currentStage = FAILURE_STAGES.CHECKSUM;
      console.log("🔎 Running --dry-run mode (ZERO WRITES GUARANTEED)...");

      const hasMeta = await metadataTableExists(activeConnection, dbConfig.database);
      let appliedMigrations = [];

      if (hasMeta) {
        appliedMigrations = await loadMigrationHistory(activeConnection);
      }

      const appliedMap = new Map(appliedMigrations.map((m) => [m.version, m]));
      const pending = [];

      for (const diskM of diskMigrations) {
        if (appliedMap.has(diskM.version)) {
          const applied = appliedMap.get(diskM.version);
          if (applied.checksum !== diskM.checksum) {
            throw reportFailure(
              FAILURE_STAGES.CHECKSUM,
              `Checksum mismatch on applied migration '${diskM.version}_${diskM.name}.sql'. ` +
                `Stored: ${applied.checksum}, Current: ${diskM.checksum}`,
              { version: diskM.version, stored: applied.checksum, current: diskM.checksum },
            );
          }
        } else {
          pending.push(diskM);
        }
      }

      console.log("\n--------------------------------------------------");
      console.log("📋 EXECUTION PLAN (--dry-run)");
      console.log("--------------------------------------------------");
      if (pending.length === 0) {
        console.log("No pending migrations to execute. Database is up to date.");
      } else {
        console.log(`The following ${pending.length} migration(s) would be executed in sequential order:`);
        for (let i = 0; i < pending.length; i++) {
          const m = pending[i];
          const destructive = detectDestructiveOperations(m.content);
          console.log(`\n[${i + 1}/${pending.length}] ${m.version}_${m.name}.sql`);
          console.log(`    File:        ${m.filePath}`);
          console.log(`    SHA-256:     ${m.checksum}`);
          console.log(`    Size:        ${m.content.length} bytes`);
          console.log(`    Destructive: ${destructive.length > 0 ? `⚠️ YES (${destructive.length} detected)` : "None"}`);
          if (destructive.length > 0) {
            for (const d of destructive) {
              console.log(`      - [${d.type}] ${d.description}`);
            }
          }
        }
      }

      console.log("--------------------------------------------------");
      console.log("✅ Dry-run completed successfully with 0 database writes.");
      return {
        mode: "dry-run",
        pendingCount: pending.length,
        pending: pending.map((p) => p.filename),
      };
    }

    // ----------------------------------------------------
    // MODE: --baseline (Register historical 001–004)
    // ----------------------------------------------------
    if (mode === "baseline") {
      currentStage = FAILURE_STAGES.BASELINE;
      console.log("🧱 Running safe baseline operation for historical migrations (001–004)...");

      // Step 1: Verify historical files 001–004 exist in diskMigrations
      const historicalVersions = ["001", "002", "003", "004"];
      const historicalFiles = diskMigrations.filter((m) =>
        historicalVersions.includes(m.version),
      );

      if (historicalFiles.length !== 4) {
        throw reportFailure(
          FAILURE_STAGES.BASELINE,
          `Baseline requires historical migration files 001–004 to exist on disk. Found: ${historicalFiles.length}/4.`,
        );
      }

      // Step 2: Verify existing database schema matches expected baseline
      console.log("Verifying existing database schema compatibility with baseline 001–004...");
      const schemaCheck = await verifyBaselineSchema(activeConnection, dbConfig.database);
      if (!schemaCheck.compatible) {
        console.error("❌ Schema verification failed! Missing expected baseline structures:");
        for (const item of schemaCheck.missing) {
          console.error(`   - Missing: ${item}`);
        }
        throw reportFailure(
          FAILURE_STAGES.BASELINE,
          `Cannot baseline: database schema does not match expected 001–004 baseline features. ` +
            `Missing ${schemaCheck.missing.length} table(s)/column(s).`,
          { missing: schemaCheck.missing },
        );
      }
      console.log("✅ Target database schema verified as compatible with 001–004 baseline.");

      // Step 3: Bootstrap _schema_migrations if needed
      currentStage = FAILURE_STAGES.METADATA;
      await bootstrapMetadataTable(activeConnection);

      // Step 4: Acquire advisory lock for safe registration
      currentStage = FAILURE_STAGES.LOCK;
      const lock = await acquireAdvisoryLock(activeConnection, dbConfig.database);
      activeLockRelease = lock.release;

      // Step 5: Read existing history
      const history = await loadMigrationHistory(activeConnection);
      const historyMap = new Map(history.map((h) => [h.version, h]));

      // Verify no future migration (>004) is already applied while 001-004 are missing
      const futureApplied = history.filter((h) => parseInt(h.version, 10) > 4);
      if (futureApplied.length > 0 && historicalFiles.some((hf) => !historyMap.has(hf.version))) {
        throw reportFailure(
          FAILURE_STAGES.BASELINE,
          `Inconsistent database state: Future migrations (${futureApplied.map((f) => f.version).join(", ")}) ` +
            `are recorded, but historical migrations 001–004 are not all recorded.`,
        );
      }

      // Step 6: Register 001–004 into _schema_migrations (without executing their SQL)
      let newlyRegistered = 0;
      for (const hf of historicalFiles) {
        if (!historyMap.has(hf.version)) {
          console.log(`Registering baseline migration ${hf.version}_${hf.name}.sql...`);
          await recordMigration(activeConnection, {
            version: hf.version,
            name: hf.name,
            checksum: hf.checksum,
            executionTimeMs: 0,
            appliedBy: "system:baseline",
          });
          newlyRegistered++;
        } else {
          // Verify checksum of already-recorded baseline migration
          const recorded = historyMap.get(hf.version);
          if (recorded.checksum !== hf.checksum) {
            throw reportFailure(
              FAILURE_STAGES.CHECKSUM,
              `Historical migration ${hf.version}_${hf.name}.sql is recorded with checksum mismatch! ` +
                `Stored: ${recorded.checksum}, Disk: ${hf.checksum}`,
            );
          }
          console.log(`✓ Baseline migration ${hf.version}_${hf.name}.sql already recorded and verified.`);
        }
      }

      // Step 7: Release lock
      if (activeLockRelease) {
        await activeLockRelease();
        activeLockRelease = null;
      }

      console.log("\n==================================================");
      console.log(`🎉 Baseline complete! Newly registered: ${newlyRegistered}, Verified: ${4 - newlyRegistered}.`);
      console.log("Future application migrations will safely start from 005_*.sql.");
      console.log("==================================================");

      return {
        mode: "baseline",
        newlyRegistered,
        verified: 4 - newlyRegistered,
      };
    }

    // ----------------------------------------------------
    // MODE: normal migration execution ('migrate')
    // ----------------------------------------------------
    console.log("🚀 Starting forward-only migration execution...");

    // Step 1: Bootstrap metadata table idempotently
    currentStage = FAILURE_STAGES.METADATA;
    await bootstrapMetadataTable(activeConnection);

    // Step 2: Acquire MariaDB advisory lock
    currentStage = FAILURE_STAGES.LOCK;
    const lock = await acquireAdvisoryLock(activeConnection, dbConfig.database);
    activeLockRelease = lock.release;

    // Step 3: Re-read history under lock
    currentStage = FAILURE_STAGES.CHECKSUM;
    const history = await loadMigrationHistory(activeConnection);
    const historyMap = new Map(history.map((h) => [h.version, h]));

    // Step 4: Validate historical checksums
    for (const h of history) {
      const diskMatch = diskMigrations.find((m) => m.version === h.version);
      if (!diskMatch) {
        throw reportFailure(
          FAILURE_STAGES.VALIDATION,
          `Applied migration '${h.version}_${h.name}' is recorded in ${METADATA_TABLE_NAME} but is missing from disk!`,
        );
      }
      if (diskMatch.checksum !== h.checksum) {
        throw reportFailure(
          FAILURE_STAGES.CHECKSUM,
          `Checksum mismatch detected for already-applied migration '${h.version}_${h.name}'!\n` +
            `  Version:         ${h.version}\n` +
            `  Name:            ${h.name}\n` +
            `  Stored Checksum: ${h.checksum}\n` +
            `  Disk Checksum:   ${diskMatch.checksum}\n` +
            `Applied migrations are immutable. You must never modify applied migration files.`,
          {
            version: h.version,
            name: h.name,
            storedChecksum: h.checksum,
            diskChecksum: diskMatch.checksum,
          },
        );
      }
    }

    // Step 5: Determine pending migrations
    const pending = diskMigrations.filter((m) => !historyMap.has(m.version));

    // Guard: If historical migrations 001–004 are pending, check if baseline is needed
    const pendingHistorical = pending.filter((p) => parseInt(p.version, 10) <= 4);
    if (pendingHistorical.length > 0) {
      // Check if schema already has baseline tables
      const schemaCheck = await verifyBaselineSchema(activeConnection, dbConfig.database);
      if (schemaCheck.compatible) {
        throw reportFailure(
          FAILURE_STAGES.BASELINE,
          `Historical migrations 001–004 are detected as present in the database schema ` +
            `but have not been registered in ${METADATA_TABLE_NAME}.\n` +
            `To safely register historical migrations without re-running their SQL, execute:\n` +
            `  npm run db:migrate -- --baseline`,
        );
      }
    }

    if (pending.length === 0) {
      console.log("✨ Target database is already up to date. Zero pending migrations.");
      if (activeLockRelease) {
        await activeLockRelease();
        activeLockRelease = null;
      }
      return {
        mode: "migrate",
        appliedCount: 0,
        applied: [],
      };
    }

    console.log(`Found ${pending.length} pending migration(s) to execute:`);
    for (const p of pending) {
      console.log(`   - ${p.version}_${p.name}.sql`);
    }

    // Step 6: Validate destructive migration safety
    validateDestructiveSafety(
      pending,
      dbConfig.isProduction,
      dbConfig.allowDestructiveProduction,
    );

    // Step 7: Execute strictly in sequential version order
    const successfullyApplied = [];

    for (const m of pending) {
      console.log(`\n▶ [EXECUTING] ${m.version}_${m.name}.sql...`);
      const startTime = Date.now();

      currentStage = FAILURE_STAGES.SQL_EXECUTION;
      try {
        await activeConnection.query(m.content);
      } catch (sqlErr) {
        throw reportFailure(
          FAILURE_STAGES.SQL_EXECUTION,
          `Failed executing SQL in migration '${m.version}_${m.name}.sql': ${sqlErr.message}`,
          { migration: m.filename, originalError: sqlErr.message, sqlState: sqlErr.sqlState },
        );
      }

      const executionTimeMs = Date.now() - startTime;

      // Record in metadata table
      currentStage = FAILURE_STAGES.HISTORY_RECORDING;
      await recordMigration(activeConnection, {
        version: m.version,
        name: m.name,
        checksum: m.checksum,
        executionTimeMs,
        appliedBy: dbConfig.isProduction ? `prod:${dbConfig.user}` : `local:${dbConfig.user}`,
      });

      // Post-migration immediate row verification
      currentStage = FAILURE_STAGES.POST_VERIFICATION;
      await verifyAppliedMigrationRow(activeConnection, m.version, m.checksum);

      console.log(`  ✓ Successfully applied and verified ${m.version}_${m.name}.sql (${executionTimeMs}ms)`);
      successfullyApplied.push(m.filename);
    }

    // Step 8: Release advisory lock
    if (activeLockRelease) {
      await activeLockRelease();
      activeLockRelease = null;
    }

    // Step 9: Final post-migration verification across all migrations
    currentStage = FAILURE_STAGES.POST_VERIFICATION;
    const finalHistory = await loadMigrationHistory(activeConnection);
    const finalMap = new Map(finalHistory.map((h) => [h.version, h]));

    for (const m of diskMigrations) {
      if (!finalMap.has(m.version)) {
        throw reportFailure(
          FAILURE_STAGES.POST_VERIFICATION,
          `Final verification failed: migration '${m.version}_${m.name}' was not recorded in ${METADATA_TABLE_NAME}!`,
        );
      }
      if (finalMap.get(m.version).checksum !== m.checksum) {
        throw reportFailure(
          FAILURE_STAGES.POST_VERIFICATION,
          `Final verification failed: checksum mismatch for '${m.version}_${m.name}'!`,
        );
      }
    }

    console.log("\n==================================================");
    console.log(`🎉 All ${successfullyApplied.length} migration(s) completed and verified successfully!`);
    console.log("==================================================");

    return {
      mode: "migrate",
      appliedCount: successfullyApplied.length,
      applied: successfullyApplied,
    };
  } catch (err) {
    console.error("\n==================================================");
    console.error("❌ MIGRATION ENGINE FAILURE — EXECUTION ABORTED");
    console.error("==================================================");
    console.error(`1. Failure Stage: ${err.stage || currentStage}`);
    console.error(`2. Exact Message: ${err.message}`);
    if (err.details) {
      console.error(`3. Details:       ${JSON.stringify(err.details, null, 2)}`);
    }
    console.error("==================================================");
    throw err;
  } finally {
    // Release lock if still held
    if (activeLockRelease) {
      try {
        await activeLockRelease();
      } catch (lockErr) {
        console.error("Error in finally releasing lock:", lockErr.message);
      }
    }
    // Close connection if still open
    if (activeConnection) {
      try {
        await activeConnection.end();
      } catch (connErr) {
        console.error("Error closing database connection:", connErr.message);
      }
    }
  }
}
