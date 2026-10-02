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
  are permanent, immutable historical records.
- **NEVER** edit, rename, re-order, delete, or re-run an already-applied migration against production.
- Any future schema evolution MUST begin with the next sequential number (e.g., `005_*`).

## 3. Schema Change Protocol
1. New schema requirements must be written in a new forward-only migration.
2. The migration must first be tested and verified against the LOCAL MySQL database.
3. Verify that zero legacy data is truncated, dropped, or corrupted.
4. Schema migrations must NEVER run automatically on production. They require explicit user authorization.
