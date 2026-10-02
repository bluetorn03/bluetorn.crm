/**
 * BLUETORN CRM — Comprehensive Migration Engine Test Suite
 *
 * Covers ALL 22 Required Test Cases:
 * 1.  Valid migration filename
 * 2.  Malformed filename rejection
 * 3.  Duplicate version rejection
 * 4.  Missing sequence rejection
 * 5.  Migration ordering
 * 6.  SHA-256 checksum deterministic computation (BOM, CRLF)
 * 7.  Checksum mismatch detection and abort
 * 8.  Already-applied migration detection
 * 9.  Pending migration detection
 * 10. Baseline behavior (registers 001–004 without running SQL)
 * 11. Baseline schema mismatch (aborts when schema missing expected baseline)
 * 12. Production host rejection (rejects remote hosts in local mode)
 * 13. Production flag requirement (rejects production host without flag)
 * 14. Unexpected database rejection (rejects production database or mismatch)
 * 15. Advisory lock success
 * 16. Advisory lock failure (blocks concurrent runner with timeout)
 * 17. Check mode produces zero writes
 * 18. Dry-run produces zero writes
 * 19. Failed migration stops subsequent migrations
 * 20. History verification
 * 21. Destructive migration detection
 * 22. 001–004 remain unchanged
 *
 * SAFETY INVARIANT:
 * - Uses a temporary test database ('bluetorn_crm_test_migrations_engine') on localhost.
 * - Local development database 'bluetorn_crm' is NEVER altered, dropped, or corrupted.
 * - Test database is cleaned up upon test completion.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import mysql from "mysql2/promise";
import { fileURLToPath } from "node:url";

import {
  validateDatabaseConfig,
  PRODUCTION_HOST,
  PRODUCTION_DATABASE,
} from "./migration-engine/config.mjs";
import {
  calculateChecksum,
  parseMigrationFilename,
  discoverMigrationFiles,
} from "./migration-engine/integrity.mjs";
import {
  detectDestructiveOperations,
  validateDestructiveSafety,
} from "./migration-engine/destructive.mjs";
import {
  acquireAdvisoryLock,
} from "./migration-engine/lock.mjs";
import {
  METADATA_TABLE_NAME,
  bootstrapMetadataTable,
  loadMigrationHistory,
  recordMigration,
  verifyAppliedMigrationRow,
  verifyBaselineSchema,
} from "./migration-engine/metadata.mjs";
import {
  runMigrationEngine,
} from "./migration-engine/runner.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const TEST_DB_NAME = "bluetorn_crm_test_migrations_engine";
const LOCAL_HOST = "localhost";
const LOCAL_PORT = 3306;
const LOCAL_USER = "root";
const LOCAL_PASSWORD = "";

let testsPassed = 0;
let testsFailed = 0;

async function test(name, fn) {
  try {
    process.stdout.write(`  [TEST] ${name}... `);
    await fn();
    console.log("✓ PASSED");
    testsPassed++;
  } catch (err) {
    console.log("❌ FAILED");
    console.error(`         Error: ${err.message}`);
    testsFailed++;
  }
}

// Helper to create a temporary directory with test migration files
function createTempMigrationsDir(filesMap) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bluetorn-test-migrations-"));
  for (const [filename, content] of Object.entries(filesMap)) {
    fs.writeFileSync(path.join(tmpDir, filename), content, "utf-8");
  }
  return {
    dir: tmpDir,
    cleanup: () => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    },
  };
}

async function main() {
  console.log("==================================================");
  console.log("🧪 BLUETORN CRM — MIGRATION ENGINE TEST SUITE");
  console.log("==================================================");
  console.log(`Test Database: ${TEST_DB_NAME} (Isolated from bluetorn_crm)`);
  console.log("--------------------------------------------------");

  let rootConn;
  try {
    rootConn = await mysql.createConnection({
      host: LOCAL_HOST,
      port: LOCAL_PORT,
      user: LOCAL_USER,
      password: LOCAL_PASSWORD,
      multipleStatements: true,
    });
    // Create test database
    await rootConn.query(`DROP DATABASE IF EXISTS \`${TEST_DB_NAME}\``);
    await rootConn.query(`CREATE DATABASE \`${TEST_DB_NAME}\``);
  } catch (err) {
    console.error("❌ Failed to connect to local MySQL to setup test database:", err.message);
    process.exit(1);
  }

  try {
    // ----------------------------------------------------
    // Test 1: Valid migration filename
    // ----------------------------------------------------
    await test("1. Valid migration filename parsing", () => {
      const parsed1 = parseMigrationFilename("001_finance_v1.sql");
      assert.equal(parsed1.version, "001");
      assert.equal(parsed1.name, "finance_v1");
      assert.equal(parsed1.numericVersion, 1);

      const parsed2 = parseMigrationFilename("005_audit_logs_v2.sql");
      assert.equal(parsed2.version, "005");
      assert.equal(parsed2.name, "audit_logs_v2");
      assert.equal(parsed2.numericVersion, 5);
    });

    // ----------------------------------------------------
    // Test 2: Malformed filename rejection
    // ----------------------------------------------------
    await test("2. Malformed migration filename rejection", () => {
      const invalidNames = [
        "invalid.sql",
        "01_too_short.sql",
        "migration.sql",
        "001-.sql",
        "001_name.txt",
        "create_table.sql",
      ];
      for (const name of invalidNames) {
        assert.throws(
          () => parseMigrationFilename(name),
          /Malformed migration filename/,
          `Expected '${name}' to be rejected as malformed`,
        );
      }
    });

    // ----------------------------------------------------
    // Test 3: Duplicate version rejection
    // ----------------------------------------------------
    await test("3. Duplicate version rejection", () => {
      const { dir, cleanup } = createTempMigrationsDir({
        "001_first.sql": "SELECT 1;",
        "001_first_duplicate.sql": "SELECT 2;",
      });
      try {
        assert.throws(
          () => discoverMigrationFiles(dir),
          /Duplicate migration version detected/,
        );
      } finally {
        cleanup();
      }
    });

    // ----------------------------------------------------
    // Test 4: Missing sequence rejection
    // ----------------------------------------------------
    await test("4. Missing sequence gap rejection", () => {
      const { dir, cleanup } = createTempMigrationsDir({
        "001_first.sql": "SELECT 1;",
        "002_second.sql": "SELECT 2;",
        "004_fourth.sql": "SELECT 4;", // Missing 003
      });
      try {
        assert.throws(
          () => discoverMigrationFiles(dir),
          /Missing migration sequence gap: expected version 003/,
        );
      } finally {
        cleanup();
      }
    });

    // ----------------------------------------------------
    // Test 5: Migration ordering
    // ----------------------------------------------------
    await test("5. Migration ordering (monotonically ascending)", () => {
      const { dir, cleanup } = createTempMigrationsDir({
        "003_third.sql": "SELECT 3;",
        "001_first.sql": "SELECT 1;",
        "002_second.sql": "SELECT 2;",
      });
      try {
        const migrations = discoverMigrationFiles(dir);
        assert.equal(migrations.length, 3);
        assert.equal(migrations[0].version, "001");
        assert.equal(migrations[1].version, "002");
        assert.equal(migrations[2].version, "003");
      } finally {
        cleanup();
      }
    });

    // ----------------------------------------------------
    // Test 6: SHA-256 checksum deterministic computation
    // ----------------------------------------------------
    await test("6. SHA-256 deterministic computation across BOM and CRLF", () => {
      const baseText = "CREATE TABLE `test` (\n  `id` INT PRIMARY KEY\n);\n";
      const crlfText = baseText.replace(/\n/g, "\r\n");
      const bomWithCrlf = "\uFEFF" + crlfText;

      const hashBase = calculateChecksum(baseText);
      const hashCrlf = calculateChecksum(crlfText);
      const hashBom = calculateChecksum(bomWithCrlf);

      assert.equal(hashBase, hashCrlf);
      assert.equal(hashBase, hashBom);
      assert.equal(hashBase.length, 64);
    });

    // ----------------------------------------------------
    // Test 7: Checksum mismatch detection and abort
    // ----------------------------------------------------
    await test("7. Checksum mismatch detection and abort", async () => {
      const conn = await mysql.createConnection({
        host: LOCAL_HOST,
        port: LOCAL_PORT,
        user: LOCAL_USER,
        password: LOCAL_PASSWORD,
        database: TEST_DB_NAME,
      });
      try {
        await bootstrapMetadataTable(conn);
        // Record fake checksum for 001
        await recordMigration(conn, {
          version: "001",
          name: "test_migration",
          checksum: "0000000000000000000000000000000000000000000000000000000000000000",
          executionTimeMs: 10,
          appliedBy: "test",
        });

        const { dir, cleanup } = createTempMigrationsDir({
          "001_test_migration.sql": "CREATE TABLE `tbl1` (id INT);",
        });
        try {
          await assert.rejects(
            async () => {
              await runMigrationEngine({
                mode: "migrate",
                migrationsDir: dir,
                configOverrides: {
                  host: LOCAL_HOST,
                  port: LOCAL_PORT,
                  database: TEST_DB_NAME,
                  user: LOCAL_USER,
                  password: LOCAL_PASSWORD,
                },
              });
            },
            (err) => err.stage === "CHECKSUM" && err.message.includes("Checksum mismatch"),
          );
        } finally {
          cleanup();
        }
      } finally {
        await conn.end();
      }
    });

    // ----------------------------------------------------
    // Test 8: Already-applied migration detection
    // ----------------------------------------------------
    await test("8. Already-applied migration detection", async () => {
      const conn = await mysql.createConnection({
        host: LOCAL_HOST,
        port: LOCAL_PORT,
        user: LOCAL_USER,
        password: LOCAL_PASSWORD,
        database: TEST_DB_NAME,
      });
      try {
        await conn.query(`TRUNCATE TABLE \`${METADATA_TABLE_NAME}\``);
        await recordMigration(conn, {
          version: "001",
          name: "first",
          checksum: calculateChecksum("SELECT 1;"),
          executionTimeMs: 5,
          appliedBy: "test",
        });

        const history = await loadMigrationHistory(conn);
        assert.equal(history.length, 1);
        assert.equal(history[0].version, "001");
      } finally {
        await conn.end();
      }
    });

    // ----------------------------------------------------
    // Test 9: Pending migration detection
    // ----------------------------------------------------
    await test("9. Pending migration detection", async () => {
      const { dir, cleanup } = createTempMigrationsDir({
        "001_first.sql": "SELECT 1;",
        "002_second.sql": "SELECT 2;",
      });
      try {
        const result = await runMigrationEngine({
          mode: "check",
          migrationsDir: dir,
          configOverrides: {
            host: LOCAL_HOST,
            port: LOCAL_PORT,
            database: TEST_DB_NAME,
            user: LOCAL_USER,
            password: LOCAL_PASSWORD,
          },
        });
        // 001 is applied, 002 is pending
        assert.equal(result.pendingCount, 1);
        assert.equal(result.pending[0], "002_second.sql");
      } finally {
        cleanup();
      }
    });

    // ----------------------------------------------------
    // Test 10: Baseline behavior
    // ----------------------------------------------------
    await test("10. Baseline behavior (registers 001–004 without running SQL)", async () => {
      const conn = await mysql.createConnection({
        host: LOCAL_HOST,
        port: LOCAL_PORT,
        user: LOCAL_USER,
        password: LOCAL_PASSWORD,
        database: TEST_DB_NAME,
        multipleStatements: true,
      });
      try {
        await conn.query(`DROP TABLE IF EXISTS \`${METADATA_TABLE_NAME}\``);
        // Setup baseline schema mock in test db
        await conn.query(`
          CREATE TABLE IF NOT EXISTS user_permissions (id VARCHAR(36) PRIMARY KEY);
          CREATE TABLE IF NOT EXISTS payments (id VARCHAR(36) PRIMARY KEY);
          CREATE TABLE IF NOT EXISTS workspaces (
            id VARCHAR(36) PRIMARY KEY,
            legal_name VARCHAR(255),
            gstin VARCHAR(32),
            chat_retention_days INT
          );
          CREATE TABLE IF NOT EXISTS invoices (
            id VARCHAR(36) PRIMARY KEY,
            taxable_amount DECIMAL(14,2),
            financial_year VARCHAR(16)
          );
          CREATE TABLE IF NOT EXISTS chat_conversations (
            id VARCHAR(36) PRIMARY KEY,
            type VARCHAR(20),
            title VARCHAR(120)
          );
          CREATE TABLE IF NOT EXISTS chat_messages (id VARCHAR(36) PRIMARY KEY);
          CREATE TABLE IF NOT EXISTS chat_conversation_members (id VARCHAR(36) PRIMARY KEY);
          CREATE TABLE IF NOT EXISTS lead_options (id VARCHAR(36) PRIMARY KEY);
          CREATE TABLE IF NOT EXISTS leads (
            id VARCHAR(36) PRIMARY KEY,
            source_option_id VARCHAR(36),
            location_option_id VARCHAR(36),
            phase_option_id VARCHAR(36)
          );
        `);

        // Run baseline using actual project migrations
        const result = await runMigrationEngine({
          mode: "baseline",
          migrationsDir: path.join(rootDir, "migrations"),
          configOverrides: {
            host: LOCAL_HOST,
            port: LOCAL_PORT,
            database: TEST_DB_NAME,
            user: LOCAL_USER,
            password: LOCAL_PASSWORD,
          },
        });

        assert.equal(result.mode, "baseline");
        assert.equal(result.newlyRegistered, 4);

        // Verify history
        const history = await loadMigrationHistory(conn);
        assert.equal(history.length, 4);
        assert.equal(history[0].version, "001");
        assert.equal(history[0].applied_by, "system:baseline");
        assert.equal(history[3].version, "004");
      } finally {
        await conn.end();
      }
    });

    // ----------------------------------------------------
    // Test 11: Baseline schema mismatch
    // ----------------------------------------------------
    await test("11. Baseline schema mismatch (aborts when schema is incomplete)", async () => {
      // Create empty db for this check
      await rootConn.query(`DROP DATABASE IF EXISTS \`bluetorn_empty_baseline_test\``);
      await rootConn.query(`CREATE DATABASE \`bluetorn_empty_baseline_test\``);
      try {
        await assert.rejects(
          async () => {
            await runMigrationEngine({
              mode: "baseline",
              migrationsDir: path.join(rootDir, "migrations"),
              configOverrides: {
                host: LOCAL_HOST,
                port: LOCAL_PORT,
                database: "bluetorn_empty_baseline_test",
                user: LOCAL_USER,
                password: LOCAL_PASSWORD,
              },
            });
          },
          (err) => err.stage === "BASELINE" && err.message.includes("does not match expected 001–004"),
        );
      } finally {
        await rootConn.query(`DROP DATABASE IF EXISTS \`bluetorn_empty_baseline_test\``);
      }
    });

    // ----------------------------------------------------
    // Test 12: Production host rejection
    // ----------------------------------------------------
    await test("12. Production host rejection in local mode", () => {
      // Attempting to target production host without allowProduction
      assert.throws(
        () =>
          validateDatabaseConfig({
            host: PRODUCTION_HOST,
            database: PRODUCTION_DATABASE,
            allowProduction: "",
          }),
        /Local development is forbidden from connecting to remote or production databases/,
      );

      // Attempting remote IP in local mode
      assert.throws(
        () =>
          validateDatabaseConfig({
            host: "198.51.100.25",
            database: "bluetorn_crm",
            allowProduction: "",
          }),
        /Local development is forbidden from connecting to remote or production databases/,
      );
    });

    // ----------------------------------------------------
    // Test 13: Production flag requirement
    // ----------------------------------------------------
    await test("13. Production flag requirement validation", () => {
      // ALLOW_PRODUCTION_MIGRATIONS=true against unauthorized remote host
      assert.throws(
        () =>
          validateDatabaseConfig({
            host: "unauthorized.server.com",
            database: PRODUCTION_DATABASE,
            allowProduction: "true",
          }),
        /is NOT the authorized production host/,
      );

      // ALLOW_PRODUCTION_MIGRATIONS=true against authorized host and db succeeds
      const prodConfig = validateDatabaseConfig({
        host: PRODUCTION_HOST,
        database: PRODUCTION_DATABASE,
        allowProduction: "true",
      });
      assert.equal(prodConfig.isProduction, true);
      assert.equal(prodConfig.host, PRODUCTION_HOST);
    });

    // ----------------------------------------------------
    // Test 14: Unexpected database rejection
    // ----------------------------------------------------
    await test("14. Unexpected database rejection", () => {
      // Local host targeting production db name without authorization
      assert.throws(
        () =>
          validateDatabaseConfig({
            host: "localhost",
            database: PRODUCTION_DATABASE,
            allowProduction: "",
          }),
        /forbidden from connecting to remote or production databases/,
      );

      // Prod flag set with wrong db name
      assert.throws(
        () =>
          validateDatabaseConfig({
            host: PRODUCTION_HOST,
            database: "wrong_db_name",
            allowProduction: "true",
          }),
        /does NOT match authorized production database/,
      );
    });

    // ----------------------------------------------------
    // Test 15: Advisory lock success
    // ----------------------------------------------------
    await test("15. Advisory lock acquisition and release", async () => {
      const conn = await mysql.createConnection({
        host: LOCAL_HOST,
        port: LOCAL_PORT,
        user: LOCAL_USER,
        password: LOCAL_PASSWORD,
        database: TEST_DB_NAME,
      });
      try {
        const lock = await acquireAdvisoryLock(conn, TEST_DB_NAME, 3);
        assert.ok(lock.lockName.includes("bluetorn_migrate"));
        await lock.release();
      } finally {
        await conn.end();
      }
    });

    // ----------------------------------------------------
    // Test 16: Advisory lock failure on concurrent attempt
    // ----------------------------------------------------
    await test("16. Advisory lock contention detection", async () => {
      const conn1 = await mysql.createConnection({
        host: LOCAL_HOST,
        port: LOCAL_PORT,
        user: LOCAL_USER,
        password: LOCAL_PASSWORD,
        database: TEST_DB_NAME,
      });
      const conn2 = await mysql.createConnection({
        host: LOCAL_HOST,
        port: LOCAL_PORT,
        user: LOCAL_USER,
        password: LOCAL_PASSWORD,
        database: TEST_DB_NAME,
      });
      try {
        // conn1 acquires lock
        const lock1 = await acquireAdvisoryLock(conn1, TEST_DB_NAME, 5);
        try {
          // conn2 tries to acquire same lock with 1s timeout -> should fail
          await assert.rejects(
            async () => {
              await acquireAdvisoryLock(conn2, TEST_DB_NAME, 1);
            },
            /Unable to acquire advisory lock/,
          );
        } finally {
          await lock1.release();
        }
      } finally {
        await conn1.end();
        await conn2.end();
      }
    });

    // ----------------------------------------------------
    // Test 17: Check mode produces zero writes
    // ----------------------------------------------------
    await test("17. Check mode produces zero database writes", async () => {
      const checkDbName = "bluetorn_check_zero_write_test";
      await rootConn.query(`DROP DATABASE IF EXISTS \`${checkDbName}\``);
      await rootConn.query(`CREATE DATABASE \`${checkDbName}\``);

      const { dir, cleanup } = createTempMigrationsDir({
        "001_check_write.sql": "CREATE TABLE should_not_exist (id INT);",
      });
      try {
        await runMigrationEngine({
          mode: "check",
          migrationsDir: dir,
          configOverrides: {
            host: LOCAL_HOST,
            port: LOCAL_PORT,
            database: checkDbName,
            user: LOCAL_USER,
            password: LOCAL_PASSWORD,
          },
        });

        const verifyConn = await mysql.createConnection({
          host: LOCAL_HOST,
          port: LOCAL_PORT,
          user: LOCAL_USER,
          password: LOCAL_PASSWORD,
          database: checkDbName,
        });
        try {
          const [afterTables] = await verifyConn.query("SHOW TABLES");
          // Zero tables should have been created (including _schema_migrations)
          assert.equal(afterTables.length, 0);
        } finally {
          await verifyConn.end();
        }
      } finally {
        cleanup();
        await rootConn.query(`DROP DATABASE IF EXISTS \`${checkDbName}\``);
      }
    });

    // ----------------------------------------------------
    // Test 18: Dry-run produces zero writes
    // ----------------------------------------------------
    await test("18. Dry-run produces zero database writes", async () => {
      const dryDbName = "bluetorn_dry_zero_write_test";
      await rootConn.query(`DROP DATABASE IF EXISTS \`${dryDbName}\``);
      await rootConn.query(`CREATE DATABASE \`${dryDbName}\``);

      const { dir, cleanup } = createTempMigrationsDir({
        "001_dry_write.sql": "CREATE TABLE dry_should_not_exist (id INT);",
      });
      try {
        await runMigrationEngine({
          mode: "dry-run",
          migrationsDir: dir,
          configOverrides: {
            host: LOCAL_HOST,
            port: LOCAL_PORT,
            database: dryDbName,
            user: LOCAL_USER,
            password: LOCAL_PASSWORD,
          },
        });

        const verifyConn = await mysql.createConnection({
          host: LOCAL_HOST,
          port: LOCAL_PORT,
          user: LOCAL_USER,
          password: LOCAL_PASSWORD,
          database: dryDbName,
        });
        try {
          const [afterTables] = await verifyConn.query("SHOW TABLES");
          // Zero tables should have been created (including _schema_migrations)
          assert.equal(afterTables.length, 0);
        } finally {
          await verifyConn.end();
        }
      } finally {
        cleanup();
        await rootConn.query(`DROP DATABASE IF EXISTS \`${dryDbName}\``);
      }
    });

    // ----------------------------------------------------
    // Test 19: Failed migration stops subsequent migrations
    // ----------------------------------------------------
    await test("19. Failed migration stops execution of subsequent migrations", async () => {
      // Create isolated test database for sequential execution test
      await rootConn.query("DROP DATABASE IF EXISTS `bluetorn_failure_stop_test`");
      await rootConn.query("CREATE DATABASE `bluetorn_failure_stop_test`");

      const { dir, cleanup } = createTempMigrationsDir({
        "001_success_table.sql": "CREATE TABLE step1_ok (id INT PRIMARY KEY);",
        "002_syntax_error.sql": "THIS IS INVALID SQL THAT WILL FAIL SYNTAX CHECK;",
        "003_never_reached.sql": "CREATE TABLE step3_never (id INT PRIMARY KEY);",
      });

      try {
        await assert.rejects(
          async () => {
            await runMigrationEngine({
              mode: "migrate",
              migrationsDir: dir,
              configOverrides: {
                host: LOCAL_HOST,
                port: LOCAL_PORT,
                database: "bluetorn_failure_stop_test",
                user: LOCAL_USER,
                password: LOCAL_PASSWORD,
              },
            });
          },
          (err) => err.stage === "SQL_EXECUTION",
        );

        // Verify state: step1_ok exists in DB and metadata, step3_never does NOT exist
        const checkConn = await mysql.createConnection({
          host: LOCAL_HOST,
          port: LOCAL_PORT,
          user: LOCAL_USER,
          password: LOCAL_PASSWORD,
          database: "bluetorn_failure_stop_test",
        });
        try {
          const [tbl1] = await checkConn.query("SHOW TABLES LIKE 'step1_ok'");
          assert.equal(tbl1.length, 1);

          const [tbl3] = await checkConn.query("SHOW TABLES LIKE 'step3_never'");
          assert.equal(tbl3.length, 0, "Step 3 table must NEVER be created after Step 2 failure");

          const history = await loadMigrationHistory(checkConn);
          assert.equal(history.length, 1);
          assert.equal(history[0].version, "001");
        } finally {
          await checkConn.end();
        }
      } finally {
        cleanup();
        await rootConn.query("DROP DATABASE IF EXISTS `bluetorn_failure_stop_test`");
      }
    });

    // ----------------------------------------------------
    // Test 20: History verification
    // ----------------------------------------------------
    await test("20. History verification and row validation", async () => {
      await rootConn.query("DROP DATABASE IF EXISTS `bluetorn_history_verify_test`");
      await rootConn.query("CREATE DATABASE `bluetorn_history_verify_test`");

      const { dir, cleanup } = createTempMigrationsDir({
        "001_initial_tbl.sql": "CREATE TABLE test_verify (id INT PRIMARY KEY);",
      });

      try {
        await runMigrationEngine({
          mode: "migrate",
          migrationsDir: dir,
          configOverrides: {
            host: LOCAL_HOST,
            port: LOCAL_PORT,
            database: "bluetorn_history_verify_test",
            user: LOCAL_USER,
            password: LOCAL_PASSWORD,
          },
        });

        const checkConn = await mysql.createConnection({
          host: LOCAL_HOST,
          port: LOCAL_PORT,
          user: LOCAL_USER,
          password: LOCAL_PASSWORD,
          database: "bluetorn_history_verify_test",
        });
        try {
          const files = discoverMigrationFiles(dir);
          const row = await verifyAppliedMigrationRow(checkConn, "001", files[0].checksum);
          assert.equal(row.version, "001");
          assert.equal(row.name, "initial_tbl");
          assert.equal(row.checksum, files[0].checksum);
        } finally {
          await checkConn.end();
        }
      } finally {
        cleanup();
        await rootConn.query("DROP DATABASE IF EXISTS `bluetorn_history_verify_test`");
      }
    });

    // ----------------------------------------------------
    // Test 21: Destructive migration detection
    // ----------------------------------------------------
    await test("21. Destructive migration detection", () => {
      const destructiveSql = `
        DROP TABLE \`users\`;
        ALTER TABLE \`accounts\` DROP COLUMN \`old_key\`;
        TRUNCATE TABLE \`sessions\`;
        DELETE FROM \`temp_logs\`;
        UPDATE \`status\` SET active = 0;
      `;
      const detected = detectDestructiveOperations(destructiveSql);
      const types = detected.map((d) => d.type);

      assert.ok(types.includes("DROP_TABLE"));
      assert.ok(types.includes("DROP_COLUMN"));
      assert.ok(types.includes("TRUNCATE_TABLE"));
      assert.ok(types.includes("UNRESTRICTED_DELETE"));
      assert.ok(types.includes("UNRESTRICTED_UPDATE"));

      // Test blocking in production without approval flag
      assert.throws(
        () =>
          validateDestructiveSafety(
            [{ filename: "005_dangerous.sql", content: destructiveSql }],
            true, // isProduction
            false, // allowDestructiveProduction
          ),
        /Destructive SQL detected in production target/,
      );
    });

    // ----------------------------------------------------
    // Test 22: 001–004 remain unchanged
    // ----------------------------------------------------
    await test("22. Immutability: 001–004 exact SHA-256 hashes match", () => {
      const diskMigrations = discoverMigrationFiles(path.join(rootDir, "migrations"));
      const expectedHistoricalHashes = {
        "001": "c27e2e7a155e45605d6c44d4fcf078efc7fc69128b48e049d552c2351d75a274",
        "002": "8b36a51b94031f8ec2ebe531c59d0a3ac1262dca459a943334870f40ef72dd31",
        "003": "24f4b943e277dc7b8eb8034e22ca82981bfd8a3de4366a585f9be56396f12837",
        "004": "d9d14848ef32801c77ecfaee951e6eeea1bf3803340edc11b20a3e3e85659175",
      };

      for (const [ver, expectedHash] of Object.entries(expectedHistoricalHashes)) {
        const found = diskMigrations.find((m) => m.version === ver);
        assert.ok(found, `Migration ${ver} must exist`);
        assert.equal(
          found.checksum,
          expectedHash,
          `Checksum mismatch for migration ${found.filename}`,
        );
      }
    });
  } finally {
    // Drop test database
    try {
      await rootConn.query(`DROP DATABASE IF EXISTS \`${TEST_DB_NAME}\``);
      await rootConn.end();
    } catch {}
  }

  console.log("--------------------------------------------------");
  console.log(`TOTAL TESTS: ${testsPassed + testsFailed} | PASSED: ${testsPassed} | FAILED: ${testsFailed}`);
  console.log("==================================================");

  if (testsFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Test runner encountered unexpected error:", err);
  process.exit(1);
});
