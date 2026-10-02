# BLUETORN CRM — DATABASE MIGRATION ENGINE V1

## Architectural Overview

BLUETORN CRM uses a custom, forward-only MySQL/MariaDB database migration engine designed for strict production safety, immutability, and deterministic cross-platform behavior.

### Core Concepts

1. **Historical Baseline (001–004)**:
   - Migrations `001_finance_v1.sql`, `002_team_chat_v1.sql`, `003_team_chat_groups_v1_1.sql`, and `004_leads_configurable_options.sql` represent the existing, applied database baseline.
   - They are permanent and immutable.
   - They are never re-run or edited.
2. **Future Application Migrations (005+)**:
   - Every new schema change must start at `005_*.sql` and follow sequentially: `006_*.sql`, `007_*.sql`, etc.
3. **Migration Engine Metadata (`_schema_migrations`)**:
   - `_schema_migrations` is independent engine metadata/infrastructure.
   - It is never created as an application migration file.
   - It is bootstrapped idempotently by the engine before running migrations.

---

## Migration File Naming Conventions

All migration files in `migrations/` must match the pattern:
```
NNN_descriptive_name.sql
```
- `NNN`: Three or more zero-padded digits (`001`, `002`, ..., `005`, `006`).
- `descriptive_name`: Lowercase letters, numbers, and underscores describing the schema evolution.
- Extension: `.sql`.

### Rejection Invariants
The engine strictly rejects:
- Non-SQL or malformed file names (e.g. `migration.sql`, `05_patch.sql`, `001-.sql`).
- Duplicate version numbers (e.g. two `005` migrations).
- Broken or out-of-order sequence (e.g. `001`, `002`, `004` missing `003`).

---

## Metadata Table Schema (`_schema_migrations`)

```sql
CREATE TABLE IF NOT EXISTS `_schema_migrations` (
  `version` VARCHAR(64) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `checksum` CHAR(64) NOT NULL,
  `applied_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `execution_time_ms` INT NOT NULL,
  `applied_by` VARCHAR(128) NOT NULL,
  PRIMARY KEY (`version`),
  KEY `idx_schema_migrations_applied_at` (`applied_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## SHA-256 Checksum & Integrity Engine

Every migration is hashed with SHA-256 using Node.js `crypto`. Checksum computation is deterministic across Windows and Linux:
1. Strips UTF-8 Byte Order Mark (BOM: `0xFEFF`) if present.
2. Normalizes Windows CRLF line endings (`\r\n`) to standard Unix LF (`\n`).
3. Preserves all other characters untouched.

### Integrity Verification
On every command execution (`migrate`, `check`, `dry-run`):
- All historical migrations recorded in `_schema_migrations` have their stored checksum compared with disk file checksum.
- If **any** mismatch is detected:
  - Execution stops immediately with exit code `1`.
  - The mismatch is reported with version, name, stored checksum, and current checksum.
  - No pending migrations are executed.

---

## Command Modes & CLI Usage

### 1. Normal Forward Migration
```bash
npm run db:migrate
```
Executes all pending migrations forward-only in strict version order.
- Acquires MariaDB advisory lock.
- Re-reads history.
- Verifies integrity of all applied migrations.
- Executes pending migrations sequentially.
- Records metadata row and verifies recorded hash immediately.
- Releases advisory lock.

### 2. Baseline Historical Migrations
```bash
npm run db:migrate -- --baseline
```
Safely baselines migrations `001` through `004`:
- Verifies files 001–004 exist on disk and computes their checksums.
- Inspects database schema to verify required tables and columns exist before registration.
- Bootstraps `_schema_migrations`.
- Inserts metadata records with `applied_by = 'system:baseline'` and `execution_time_ms = 0`.
- **Guarantees zero application data modification and does NOT re-run SQL statements.**

### 3. Inspection & Verification Check Mode
```bash
npm run db:migrate -- --check
```
- Inspects `_schema_migrations` and compares with disk files.
- Reports count of applied, pending, and checksum mismatches.
- **GUARANTEES ZERO DATABASE WRITES.**

### 4. Dry-Run Execution Plan Preview
```bash
npm run db:migrate -- --dry-run
```
- Validates disk files and historical checksums.
- Simulates execution plan for pending migrations.
- Runs static analysis for destructive SQL statements.
- **GUARANTEES ZERO DATABASE WRITES.**

---

## Advisory Locking (Concurrency Control)

The engine prevents concurrent migration processes using MariaDB/MySQL session locks:
- Lock identifier: `bluetorn_migrate_<database>`
- Acquisition: `SELECT GET_LOCK(?, 10)` (10-second timeout).
- Release: `SELECT RELEASE_LOCK(?)` in `finally` block.
- If lock cannot be acquired within 10 seconds, execution safely halts.

---

## Production Safety Invariants

### Default Mode: LOCAL ONLY
- The engine rejects remote database hosts (`srv2218.hstgr.io`, public IPs) by default.
- Prevents accidental connections from developer machines to live databases.

### Explicit Production Authorization Required
Production execution strictly requires:
```bash
ALLOW_PRODUCTION_MIGRATIONS=true
DB_HOST=srv2218.hstgr.io
DB_NAME=u168098130_bluetorn_crm
```
If any of these conditions fail:
- Engine stops immediately without executing any queries.
- Generic bypass flags or arbitrary environment variables are rejected.

### Destructive SQL Protection
The engine statically parses migration SQL for destructive operations:
- `DROP TABLE`
- `DROP DATABASE`
- `DROP COLUMN`
- `TRUNCATE TABLE`
- `DELETE` without a `WHERE` clause
- `UPDATE` without a `WHERE` clause

In **production**, destructive migrations are **BLOCKED** by default unless explicitly approved via:
```bash
ALLOW_DESTRUCTIVE_PRODUCTION_MIGRATIONS=true
```
In **local development**, destructive operations display prominent warning notices.

---

## Creating Future Migrations (005+)

1. Create a dedicated feature branch:
   ```bash
   git checkout -b feature/<feature-name>
   ```
2. Create the next sequential migration file:
   ```bash
   migrations/005_<description>.sql
   ```
3. Test locally using dry-run and migration commands:
   ```bash
   npm run db:migrate -- --dry-run
   npm run db:migrate
   ```
4. Verify local status and test suite:
   ```bash
   npm run db:migrate -- --check
   npm run test:migrations
   npm run verify
   ```
5. Follow the Release Gate protocol before requesting approval.
