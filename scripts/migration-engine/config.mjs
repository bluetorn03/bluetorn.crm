/**
 * BLUETORN CRM — Migration Engine Configuration & Production Safety Guards
 *
 * Enforces strict environment separation:
 * - Default: LOCAL ONLY (localhost / 127.0.0.1)
 * - Remote / Production hosts strictly forbidden unless explicitly authorized
 *   with ALLOW_PRODUCTION_MIGRATIONS=true AND target host strictly matches srv2218.hstgr.io.
 * - Password and secrets are never printed in logs or summaries.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const rootDir = path.resolve(__dirname, "..", "..");

export const PRODUCTION_HOST = "srv2218.hstgr.io";
export const PRODUCTION_DATABASE = "u168098130_bluetorn_crm";
export const LOCAL_ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "::1", ""]);

/**
 * Safely parse a .env or .env.local file without overriding existing process.env.
 */
export function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf-8");
  for (const rawLine of content.split("\n")) {
    const trimmed = rawLine.trim();
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
      if (!(key in process.env)) {
        process.env[key] = val;
      }
    }
  }
}

/**
 * Load environment from standard project locations.
 */
export function loadProjectEnv() {
  loadEnvFile(path.join(rootDir, ".env"));
  loadEnvFile(path.join(rootDir, ".env.local"));
}

/**
 * Validate database target and enforce production safety invariants.
 *
 * @param {Object} [overrides] Optional overrides for testing
 * @returns {Object} Validated connection configuration
 */
export function validateDatabaseConfig(overrides = {}) {
  const host = (overrides.host ?? process.env.DB_HOST ?? "localhost").trim();
  const port = Number(overrides.port ?? process.env.DB_PORT ?? 3306);
  const database = (overrides.database ?? process.env.DB_NAME ?? "bluetorn_crm").trim();
  const user = (overrides.user ?? process.env.DB_USER ?? "root").trim();
  const password = overrides.password ?? process.env.DB_PASSWORD ?? "";
  const allowProd = (overrides.allowProduction ?? process.env.ALLOW_PRODUCTION_MIGRATIONS ?? "").trim();
  const allowDestructiveProd = (
    overrides.allowDestructiveProduction ??
    process.env.ALLOW_DESTRUCTIVE_PRODUCTION_MIGRATIONS ??
    ""
  ).trim();

  const isLocalHost = LOCAL_ALLOWED_HOSTS.has(host.toLowerCase());
  const isProdHost = host.toLowerCase() === PRODUCTION_HOST.toLowerCase();
  const isProdDb = database === PRODUCTION_DATABASE;

  // Case 1: Target indicates remote or production host/DB, but production migration is not explicitly enabled
  if ((!isLocalHost || isProdHost || isProdDb) && allowProd !== "true") {
    throw new Error(
      `[PRODUCTION SAFETY GUARD] Migration target rejected: DB_HOST='${host}', DB_NAME='${database}'. ` +
        `Local development is forbidden from connecting to remote or production databases without explicit authorization. ` +
        `To target production, ALLOW_PRODUCTION_MIGRATIONS=true is strictly required. Default mode: LOCAL ONLY.`,
    );
  }

  // Case 2: ALLOW_PRODUCTION_MIGRATIONS=true was set, but host or database is NOT the authorized production target
  if (allowProd === "true") {
    if (!isProdHost) {
      throw new Error(
        `[PRODUCTION SAFETY GUARD] Production migration rejected: Host '${host}' is NOT the authorized production host ` +
          `('${PRODUCTION_HOST}'). You cannot use ALLOW_PRODUCTION_MIGRATIONS=true against an arbitrary host.`,
      );
    }
    if (!isProdDb) {
      throw new Error(
        `[PRODUCTION SAFETY GUARD] Production migration rejected: Database '${database}' does NOT match ` +
          `authorized production database ('${PRODUCTION_DATABASE}').`,
      );
    }
  }

  // Case 3: Local mode targeting unexpected production database name
  if (isLocalHost && isProdDb && allowProd !== "true") {
    throw new Error(
      `[PRODUCTION SAFETY GUARD] Cannot target production database name '${PRODUCTION_DATABASE}' on local host without production authorization.`,
    );
  }

  return {
    host,
    port,
    database,
    user,
    password,
    isProduction: allowProd === "true",
    allowDestructiveProduction: allowDestructiveProd === "true",
  };
}

/**
 * Print safe target summary without exposing passwords or tokens.
 */
export function printSafeTargetSummary(config) {
  console.log("--------------------------------------------------");
  console.log("🎯 TARGET DATABASE SUMMARY");
  console.log("--------------------------------------------------");
  console.log(` Mode:        ${config.isProduction ? "🚨 PRODUCTION" : "💻 LOCAL DEVELOPMENT"}`);
  console.log(` Host:        ${config.host}`);
  console.log(` Port:        ${config.port}`);
  console.log(` Database:    ${config.database}`);
  console.log(` User:        ${config.user}`);
  console.log(` Credentials: [REDACTED — SECURE]`);
  console.log("--------------------------------------------------");
}
