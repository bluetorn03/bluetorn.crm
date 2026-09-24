# BLUETORN CRM — FINAL HOSTINGER DEPLOYMENT MANIFEST

> **Target**: `https://realestate.bluetorn.com`
> **Generated**: 2026-09-24
> **Audit Status**: ✅ ALL CHECKS PASSED

---

## 1. PRE-DEPLOYMENT VERIFICATION RESULTS

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ Exit code 0 — zero type errors |
| `npm run build` | ✅ Exit code 0 — built in 15.07 s |
| `.output/server/index.mjs` exists | ✅ 38,606 bytes, valid ESM entry |
| `.output/nitro.json` preset | ✅ `"preset": "node-server"` |
| Supabase references in `src/` | ✅ **NONE FOUND** |
| Supabase references in entire repo | ✅ **NONE FOUND** |
| `http://localhost` hardcoded URLs in src | ✅ **NONE FOUND** |
| `127.0.0.1` hardcoded in src | ✅ **NONE FOUND** |
| Hardcoded DB passwords in src | ✅ **NONE FOUND** |
| `root` DB user hardcoded in src | ✅ **NONE FOUND** (only as fallback default in `db.ts` when `DB_USER` env is absent) |
| JWT / SESSION_SECRET / APP_URL in code | ✅ **NONE FOUND** — not used by this app |
| VITE_ client env variables | ✅ **NONE FOUND** — no client-side env vars |
| `import.meta.env` references | ✅ **NONE FOUND** |
| Production credentials in source | ✅ **NONE COMMITTED** (`.env` and `.env.local` are gitignored) |

> [!IMPORTANT]
> The local `.env` file contains `DB_USER=root` and empty `DB_PASSWORD=` — this is a **local dev** file
> that is gitignored and will NOT be deployed. Production values are set via Hostinger's environment
> variables panel.

---

## 2. HOSTINGER NODE.JS WEB APP CONFIGURATION

Set these **exactly** in Hostinger → Website → Node.js App panel:

| Setting | Value |
|---|---|
| **Node.js Version** | `18` (LTS) or `20` (LTS) — both are supported. The codebase uses ES2022 features and `crypto.randomUUID()` (available since Node 19, polyfilled for older). Recommend **Node 20 LTS**. |
| **Package Manager** | `npm` |
| **Root Directory** | `/` (project root, where `package.json` lives) |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `node .output/server/index.mjs` |
| **Entry Point** | `.output/server/index.mjs` |

> [!NOTE]
> The Nitro `node-server` preset bundles everything into `.output/`. The start command runs
> the self-contained Node server — no `npx`, no `vite`, no additional framework CLI needed.

### How the Server Listens

From the built `.output/server/index.mjs` (lines 1109–1124):

```js
var _parsedPort = Number.parseInt(process.env.NITRO_PORT ?? process.env.PORT ?? "");
var port = Number.isNaN(_parsedPort) ? 3000 : _parsedPort;
var host = process.env.NITRO_HOST || process.env.HOST;
```

Hostinger typically injects `PORT` automatically. If needed, set `PORT=3000`.

---

## 3. PRODUCTION ENVIRONMENT VARIABLES — EXACT INVENTORY

### Complete `process.env` Reference Scan

Every `process.env` reference in the **entire source codebase** (src + scripts):

| Variable | Used In | Purpose |
|---|---|---|
| `NODE_ENV` | `auth.functions.ts:75` | Cookie `secure` flag (set to `production` for HTTPS) |
| `DB_HOST` | `db.ts:20`, scripts | MySQL server hostname |
| `DB_PORT` | `db.ts:21`, scripts | MySQL server port |
| `DB_NAME` | `db.ts:22`, scripts | MySQL database name |
| `DB_USER` | `db.ts:23`, scripts | MySQL username |
| `DB_PASSWORD` | `db.ts:24`, scripts | MySQL password |
| `PORT` | `.output/server/index.mjs` (Nitro runtime) | Server listen port |
| `HOST` | `.output/server/index.mjs` (Nitro runtime) | Server listen host |
| `TZ` | OS-level | Timezone for date display |

### Variables to ADD in Hostinger Environment Variables Panel

```env
NODE_ENV=production
PORT=3000
HOST=127.0.0.1
DB_HOST=localhost
DB_PORT=3306
DB_NAME=u168098130_bluetorn_crm
DB_USER=u168098130_bluetorn_crm
DB_PASSWORD=<YOUR_STRONG_PRODUCTION_PASSWORD>
TZ=Asia/Kolkata
```

> [!WARNING]
> Replace `<YOUR_STRONG_PRODUCTION_PASSWORD>` with the actual password you set for the
> Hostinger MySQL database user. The DB_NAME, DB_USER values shown above match the
> `.env.example` template — adjust them to match your actual Hostinger database credentials.

### Variables to **NOT** ADD

| Variable | Reason |
|---|---|
| `SUPABASE_URL` | ❌ Not used anywhere in the codebase |
| `SUPABASE_ANON_KEY` | ❌ Not used anywhere in the codebase |
| `SUPABASE_SERVICE_ROLE_KEY` | ❌ Not used anywhere in the codebase |
| `JWT_SECRET` | ❌ Not used — auth uses stateless base64 session tokens, not JWTs |
| `SESSION_SECRET` | ❌ Not used — no signed session store |
| `APP_URL` | ❌ Not used anywhere in the codebase |
| `APP_SECRET` | ❌ Not used anywhere in the codebase |
| `API_KEY` | ❌ Not used anywhere in the codebase |
| `VITE_*` anything | ❌ No client-side env variables used |
| `NITRO_PORT` | ❌ Not needed — `PORT` is sufficient |
| `NITRO_HOST` | ❌ Not needed — `HOST` is sufficient |
| `NITRO_SSL_CERT` / `NITRO_SSL_KEY` | ❌ Hostinger handles TLS termination |

---

## 4. WHAT TO UPLOAD

### Files/Folders that **MUST** be deployed

Upload the **source project** (not just `.output/`) because Hostinger runs `npm install && npm run build` on the server:

| Path | Purpose |
|---|---|
| `package.json` | Dependencies + scripts |
| `package-lock.json` | Deterministic installs |
| `tsconfig.json` | TypeScript configuration |
| `vite.config.ts` | Build configuration |
| `nitro.config.ts` | Nitro server preset |
| `eslint.config.js` | Required for build (imported in tsconfig) |
| `components.json` | shadcn/ui config |
| `src/` | All application source code |
| `public/` | Static assets (favicon.png, robots.txt) |
| `scripts/` | Migration scripts (run manually post-deploy) |
| `mysql_schema.sql` | Database schema (import separately) |
| `.env.example` | Reference template (safe, no secrets) |
| `.prettierrc` | Code formatter config |
| `.prettierignore` | Formatter ignore rules |

### Files/Folders that **MUST NOT** be deployed

| Path | Reason |
|---|---|
| `node_modules/` | Reinstalled on server via `npm install` |
| `.output/` | Rebuilt on server via `npm run build` |
| `.git/` | Version control metadata |
| `.env` | Local dev credentials — **NEVER** deploy |
| `.env.local` | Local dev overrides — **NEVER** deploy |
| `.wrangler/` | Cloudflare dev artifacts |
| `.lovable/` | Lovable IDE metadata |
| `bun.lock` | Bun lockfile (using npm on Hostinger) |
| `bunfig.toml` | Bun configuration |
| `app.zip` | Archive artifact |
| `app.tar.gz` | Archive artifact |
| `.antigravity.local.md` | Local agent notes |
| `DEPLOYMENT_READINESS_REPORT.md` | Old report (optional) |
| `HOSTINGER_DEPLOYMENT_GUIDE.md` | Old guide (optional) |
| `add_whatsapp_phone.sql` | Superseded by migrate.mjs |

### app.zip Structure

The existing `scripts/package.py` correctly:
- ✅ Excludes `node_modules/`, `.output/`, `.git/`, `.wrangler/`, `.lovable/`
- ✅ Excludes `.env`, `.env.local`, `bun.lock`, `bunfig.toml`, `app.zip`, `app.tar.gz`
- ✅ Sets UNIX POSIX permissions (644 files, 755 dirs)
- ✅ Sets `create_system = 3` (UNIX) for Hostinger Linux compatibility

**To regenerate the deployment archive:**

```powershell
cd c:\Users\ADMIN\OneDrive\Documents\bluetorn_crm
python scripts/package.py
```

This produces `app.zip` and `app.tar.gz` — upload **either** to Hostinger.

---

## 5. WHERE TO UPLOAD IT

### Hostinger Business / Web Hosting

1. **Go to**: Hostinger hPanel → Websites → `realestate.bluetorn.com` → File Manager
2. **Navigate to**: `/home/u168098130/domains/realestate.bluetorn.com/public_html/` (or whatever root Hostinger assigns)
3. **Upload**: `app.zip`
4. **Extract**: Use File Manager's extract function into the web root
5. **Verify**: `package.json` should be at the root level (not nested in a subdirectory)

### Alternative: Git Auto-Deploy

If Git deployment is configured, push to the connected branch. Hostinger will pull, install, and build automatically.

---

## 6. WHERE TO ADD ENVIRONMENT VARIABLES

### Hostinger hPanel Location

1. **Go to**: Hostinger hPanel → Websites → `realestate.bluetorn.com`
2. **Navigate to**: Advanced → Node.js → Environment Variables
3. **Add each variable** from the table in Section 3

### If Using VPS

Create `/home/<user>/.env` or set variables in the service file (systemd):

```ini
[Service]
Environment="NODE_ENV=production"
Environment="PORT=3000"
Environment="HOST=127.0.0.1"
Environment="DB_HOST=localhost"
Environment="DB_PORT=3306"
Environment="DB_NAME=u168098130_bluetorn_crm"
Environment="DB_USER=u168098130_bluetorn_crm"
Environment="DB_PASSWORD=<YOUR_STRONG_PRODUCTION_PASSWORD>"
Environment="TZ=Asia/Kolkata"
```

---

## 7. DATABASE DEPLOYMENT

### Schema File

**Canonical schema**: `mysql_schema.sql`

- 17 tables total
- All use `CREATE TABLE IF NOT EXISTS` — safe for re-import
- Engine: InnoDB
- Charset: utf8mb4 / utf8mb4_unicode_ci
- No hardcoded production credentials

### Tables in Schema

| # | Table | Purpose |
|---|---|---|
| 1 | `workspaces` | Multi-tenant workspace containers |
| 2 | `profiles` | User accounts (includes `whatsapp_phone`) |
| 3 | `user_roles` | Role assignments (super_admin, owner, manager, employee) |
| 4 | `customers` | CRM customer records |
| 5 | `properties` | Real estate property listings |
| 6 | `leads` | Sales leads with scoring |
| 7 | `lead_activities` | Lead interaction history |
| 8 | `tasks` | Task management |
| 9 | `calendar_events` | Calendar/scheduling |
| 10 | `invoices` | Financial invoices |
| 11 | `invoice_items` | Invoice line items |
| 12 | `payments` | Payment records |
| 13 | `plans` | Subscription plans |
| 14 | `promo_media` | Promotional media content |
| 15 | `platform_settings` | Platform configuration KV store |
| 16 | `audit_logs` | Activity audit trail |
| 17 | `notifications` | User notification queue |

### Foreign Keys and Indexes on Assignment Columns

All `assigned_to` columns verified to have proper FK constraints and indexes:

| Table | FK Name | Index Name | References |
|---|---|---|---|
| `customers` | `fk_customers_assigned` | `idx_customers_assigned` | `profiles(id) ON DELETE SET NULL` |
| `properties` | `fk_properties_assigned` | `idx_properties_assigned` | `profiles(id) ON DELETE SET NULL` |
| `leads` | `fk_leads_assigned` | `idx_leads_assigned` | `profiles(id) ON DELETE SET NULL` |
| `tasks` | `fk_tasks_assigned` | `idx_tasks_assigned` | `profiles(id) ON DELETE SET NULL` |

### No Duplicate Columns

The `whatsapp_phone` column is defined in the base schema — the migration script
(`migrate.mjs`) checks `SHOW COLUMNS ... LIKE 'whatsapp_phone'` before adding, preventing duplicates.
Similarly, `assigned_at` is checked per-table before adding.

### Fresh Database Import

```sql
-- In Hostinger phpMyAdmin or MySQL CLI:
-- 1. Select your production database (e.g., u168098130_bluetorn_crm)
-- 2. Import mysql_schema.sql
-- The CREATE DATABASE / USE statements are safe — the migrate script strips them.
```

### Existing Database Migration

Run from the project root **on the server** after setting env vars:

```bash
node scripts/migrate.mjs
```

This script:
1. Applies base schema (all `CREATE TABLE IF NOT EXISTS`)
2. Adds `whatsapp_phone` to `profiles` if missing
3. Adds `assigned_at` to `leads`, `customers`, `properties`, `tasks` if missing
4. Lists all tables for verification

For assignment FK/index migration specifically:

```bash
node scripts/migrate-assignment-schema.mjs
```

This script:
1. Cleans orphaned `assigned_to` values in `properties` and `tasks`
2. Adds missing indexes on `assigned_to` columns
3. Adds missing FK constraints to `profiles(id)`

### No Production Credentials Hardcoded

- ✅ `mysql_schema.sql` — no credentials, only DDL
- ✅ `db.ts` — reads from `process.env` only, defaults are for local dev
- ✅ All scripts — read from `process.env`, load `.env` files from disk

---

## 8. SECURITY AUDIT SUMMARY

| Scan | Files Checked | Issues Found |
|---|---|---|
| `localhost` in src/ | All .ts/.tsx | 1 — fallback default in `db.ts` (safe: overridden by `DB_HOST` env) |
| `127.0.0.1` in src/ | All .ts/.tsx | 0 |
| Hardcoded passwords | All .ts/.tsx | 0 |
| `root` DB user | All .ts/.tsx | 1 — fallback default in `db.ts` (safe: overridden by `DB_USER` env) |
| Supabase references | Entire repo | 0 |
| JWT/SESSION/APP secrets | All .ts/.tsx | 0 |
| VITE_ env vars | All .ts/.tsx | 0 |
| `import.meta.env` | All .ts/.tsx | 0 |
| `.env` in .gitignore | — | ✅ Properly excluded |
| `.env.*` in .gitignore | — | ✅ Properly excluded (except `.env.example`) |

### `localhost` / `root` Fallback Defaults — Assessment

In `db.ts` lines 20-24:

```typescript
host: process.env["DB_HOST"] || "localhost",
user: process.env["DB_USER"] || "root",
```

These are **safe development fallbacks** — they only activate when env vars are missing.
In production, `DB_HOST` and `DB_USER` **must** be set via environment variables,
and these fallbacks will never execute.

The same pattern exists in the migration scripts (local dev tooling, not deployed as server code).

---

## 9. HOSTINGER BUILD/START SETTINGS SUMMARY

```
┌─────────────────────────────────────────────────────────┐
│  HOSTINGER NODE.JS APP CONFIGURATION                     │
├───────────────────┬─────────────────────────────────────┤
│  Node.js Version  │  20 (LTS)                           │
│  Package Manager  │  npm                                │
│  Root Directory   │  /                                  │
│  Build Command    │  npm install && npm run build        │
│  Start Command    │  node .output/server/index.mjs      │
├───────────────────┴─────────────────────────────────────┤
│  ENVIRONMENT VARIABLES                                   │
├───────────────────┬─────────────────────────────────────┤
│  NODE_ENV         │  production                         │
│  PORT             │  3000                               │
│  HOST             │  127.0.0.1                          │
│  DB_HOST          │  localhost                          │
│  DB_PORT          │  3306                               │
│  DB_NAME          │  u168098130_bluetorn_crm            │
│  DB_USER          │  u168098130_bluetorn_crm            │
│  DB_PASSWORD      │  <your production password>         │
│  TZ               │  Asia/Kolkata                       │
├───────────────────┴─────────────────────────────────────┤
│  DO NOT ADD                                              │
├─────────────────────────────────────────────────────────┤
│  SUPABASE_URL, SUPABASE_ANON_KEY,                       │
│  SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET,                  │
│  SESSION_SECRET, APP_URL, APP_SECRET,                    │
│  API_KEY, VITE_*, NITRO_PORT, NITRO_HOST,               │
│  NITRO_SSL_CERT, NITRO_SSL_KEY                          │
├───────────────────┴─────────────────────────────────────┤
│  DATABASE                                                │
├───────────────────┬─────────────────────────────────────┤
│  Schema File      │  mysql_schema.sql (17 tables)       │
│  Import Method    │  phpMyAdmin or MySQL CLI             │
│  Migration Script │  node scripts/migrate.mjs           │
│  FK Migration     │  node scripts/migrate-assignment-   │
│                   │  schema.mjs                         │
└───────────────────┴─────────────────────────────────────┘
```

---

## 10. DEPLOYMENT CHECKLIST

- [ ] Create MySQL database on Hostinger (`u168098130_bluetorn_crm`)
- [ ] Create MySQL user with full privileges on that database
- [ ] Import `mysql_schema.sql` via phpMyAdmin
- [ ] Run `node scripts/migrate.mjs` to apply incremental migrations
- [ ] Run `node scripts/migrate-assignment-schema.mjs` for FK/index integrity
- [ ] Generate `app.zip` via `python scripts/package.py`
- [ ] Upload `app.zip` to Hostinger web root
- [ ] Extract archive in File Manager
- [ ] Set Node.js version to 20 LTS
- [ ] Set build command: `npm install && npm run build`
- [ ] Set start command: `node .output/server/index.mjs`
- [ ] Add all 9 environment variables from Section 3
- [ ] Verify **no** Supabase / JWT / SESSION variables are added
- [ ] Start the Node.js app
- [ ] Verify `https://realestate.bluetorn.com` loads the login page
- [ ] Test login with workspace code + user ID + password
- [ ] Verify session cookie is set with `Secure` flag (HTTPS)

---

> [!CAUTION]
> **This deployment is READY** — all checks pass, no missing env vars, no hardcoded secrets,
> no Supabase dependencies, no obsolete variables. The only action required is setting
> the actual `DB_PASSWORD` value in Hostinger's environment variables panel.
