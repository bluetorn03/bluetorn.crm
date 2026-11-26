---
trigger: always_on
description: "Database safety rules, local vs production DB separation, and migration immutability"
---

# Database Safety Rules

## 1. Local Database ≠ Production Database
- **Local Database**: Used for local development and feature testing (`localhost:3306/bluetorn_crm`).
- **Production Database**: Dedicated live database hosted on Hostinger Cloud MariaDB (`srv2218.hstgr.io:3306/u168098130_bluetorn_crm`), configured via Hostinger Environment Variables.
- **Zero Local Overwrite**: Never overwrite or synchronize production by importing local database SQL dumps, dropping tables, or copying local test accounts into production.

## 2. Migration Immutability
- Historical migrations:
  - `001_finance_v1.sql`
  - `002_team_chat_v1.sql`
  - `003_team_chat_groups_v1_1.sql`
  - `004_leads_configurable_options.sql`
  - `005_audit_money_retention_upgrade.sql`
  - `006_custom_fields_vault_upi.sql`
  - `007_custom_fields_properties_and_system_fields.sql`
  are permanent, immutable historical records.
- **NEVER** edit, rename, re-order, delete, or re-run an already-applied migration against production.
- Any future schema evolution MUST begin with the next sequential number (e.g., `008_*`).

## 3. Schema Change Protocol & Metadata Tracking
1. New schema requirements must be written in a new forward-only migration.
2. **Automatic `_schema_migrations` Tracking Record**: Every new migration file MUST end with an idempotent metadata registration statement:
   ```sql
   INSERT INTO `_schema_migrations` (`version`, `name`, `checksum`, `applied_at`, `execution_time_ms`, `applied_by`)
   VALUES ('<version>', '<name>', '<sha256_checksum>', NOW(), 50, 'system:migration')
   ON DUPLICATE KEY UPDATE `applied_at` = NOW();
   ```
   This ensures that manual Hostinger phpMyAdmin imports and automated CLI runs both register the migration automatically with zero manual steps.
3. The migration must first be tested and verified against the LOCAL MySQL database.
4. Verify that zero legacy data is truncated, dropped, or corrupted.
5. Schema migrations must NEVER run automatically on production. They require explicit user authorization.

## 4. Mandatory Database Disclosure Rule (Every Turn & Conversation)
In EVERY response after implementing, updating, or fixing any feature:
1. **Explicit Statement**: Antigravity MUST explicitly declare whether any database schema changes were made.
2. **If DB Changes Occurred**:
   - Create a new sequential migration file (e.g. `008_*.sql`).
   - Include the automatic `_schema_migrations` tracking record.
   - Provide exact, step-by-step instructions for importing the file into the Hostinger production database via phpMyAdmin.
3. **If NO DB Changes Occurred**:
   - Explicitly confirm: *"No database changes occurred in this update. No SQL migration file is needed, and no database action on Hostinger phpMyAdmin is required. Only code deployment is required."*

