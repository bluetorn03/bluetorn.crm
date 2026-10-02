---
trigger: always_on
description: "Production safety restrictions, default local development mode, and explicit user approval requirements"
---

# Production Safety Rules

## DEFAULT MODE: LOCAL DEVELOPMENT ONLY

Antigravity operates by default in local development mode. It must NEVER execute actions targeting production infrastructure, remote git tracking branches, or live databases without explicit, unambiguous user confirmation in chat.

### Prohibited Automated Actions
The following actions are strictly prohibited from being run automatically:
1. `git push` (especially `git push origin main` or any remote push).
2. Merging pull requests via CLI, API, or automated commands.
3. Deploying to Hostinger (via SFTP, SSH, Git webhook triggers, or package uploads).
4. Modifying Hostinger production server configurations, Apache/Nginx directives, or runtime variables.
5. Modifying Hostinger environment variables or production secrets.
6. Connecting to, inspecting, or mutating the production database (`u168098130_bluetorn_crm` / `srv2218.hstgr.io`) during development or automated tests.
7. Executing DDL (`ALTER`, `DROP`, `CREATE`) or DML (`UPDATE`, `DELETE`, `TRUNCATE`) on production tables.
8. Running database migrations or baselines against production without explicit approval.
9. Deleting or replacing the production database with local database dumps.

### Approval Protocol
- If a task is ready for deployment, Antigravity must stop and print the `READY FOR USER APPROVAL` template.
- Antigravity must pause execution and wait for direct user consent (e.g., "Approved, release it", "Approved, commit and push", "Deploy to production").
- Without this explicit message, no commit, push, or release action may take place.
