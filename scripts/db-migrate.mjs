#!/usr/bin/env node

/**
 * BLUETORN CRM — Database Migration CLI Entrypoint
 *
 * Usage:
 *   npm run db:migrate                 Run pending migrations in sequential order
 *   npm run db:migrate -- --baseline   Register historical migrations 001–004 safely
 *   npm run db:migrate -- --check      Inspect migration state without modifying DB
 *   npm run db:migrate -- --dry-run    Preview migration execution plan (zero writes)
 *   npm run db:migrate -- --help       Show help and production safety guidelines
 */

import { runMigrationEngine } from "./migration-engine/runner.mjs";

function printHelp() {
  console.log(`
BLUETORN CRM — Database Migration Engine V1
===========================================

USAGE:
  npm run db:migrate [options]
  node scripts/db-migrate.mjs [options]

COMMAND MODES:
  (no flag)      Execute all pending migrations forward-only in sequential version order.
  --baseline     Safely baseline historical migrations (001–004) without executing their SQL.
                 Verifies existing schema matches 001–004 requirements before registration.
  --check        Inspect and report migration status, applied migrations, pending migrations,
                 and SHA-256 checksum integrity. GUARANTEES ZERO DATABASE WRITES.
  --dry-run      Simulate migration run, inspect statements, check for destructive operations,
                 and output the execution plan. GUARANTEES ZERO DATABASE WRITES.
  --help, -h     Show this help manual.

SAFETY RULES & INVARIANTS:
  - Default mode is LOCAL ONLY (localhost / 127.0.0.1 / ::1).
  - Historical migrations (001, 002, 003, 004) are immutable and must never be altered.
  - Future application migrations must strictly begin with 005_*.sql.
  - Production execution strictly requires:
      ALLOW_PRODUCTION_MIGRATIONS=true
      AND DB_HOST=srv2218.hstgr.io
      AND DB_NAME=u168098130_bluetorn_crm
  - Destructive operations (DROP, TRUNCATE, unconstrained DELETE/UPDATE) in production
    require ALLOW_DESTRUCTIVE_PRODUCTION_MIGRATIONS=true.
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  let mode = "migrate";
  if (args.includes("--baseline")) {
    mode = "baseline";
  } else if (args.includes("--check")) {
    mode = "check";
  } else if (args.includes("--dry-run")) {
    mode = "dry-run";
  }

  try {
    await runMigrationEngine({ mode });
    process.exit(0);
  } catch {
    // Error details are already formatted and logged by runner
    process.exit(1);
  }
}

main();
