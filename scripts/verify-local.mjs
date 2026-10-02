/**
 * BLUETORN CRM — Local Verification Gate
 *
 * Runs all mandatory local quality and safety checks:
 * 1. Environment Safety Guard (confirms NO production DB is targeted)
 * 2. Secrets Leak Prevention Check (checks git staged and tracked files)
 * 3. Migration Files Immutability Check (verifies 001–004 historical files intact)
 * 4. TypeScript Typecheck (tsc --noEmit)
 * 5. Production Application Build (vite build)
 *
 * If any check fails, execution STOPS IMMEDIATELY and produces a structured report.
 *
 * Usage:
 *   npm run verify
 */

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { discoverMigrationFiles } from "./migration-engine/integrity.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

console.log("==================================================");
console.log("🛡️  BLUETORN CRM — LOCAL VERIFICATION GATE");
console.log("==================================================");

function fail(command, exactError, likelyCause, filesInvolved, recommendedFix) {
  console.error("\n==================================================");
  console.error("❌ VERIFICATION STEP FAILED — EXECUTION STOPPED");
  console.error("==================================================");
  console.error(`1. Failed Command:   ${command}`);
  console.error(`2. Exact Error:      ${exactError}`);
  console.error(`3. Likely Cause:     ${likelyCause}`);
  console.error(`4. Files Involved:   ${filesInvolved.join(", ")}`);
  console.error(`5. Recommended Fix:  ${recommendedFix}`);
  console.error("==================================================");
  console.error("DO NOT PUSH. DO NOT DEPLOY. RESOLVE ISSUES LOCALLY FIRST.\n");
  process.exit(1);
}

function runStep(name, commandName, fn, likelyCause, filesInvolved, recommendedFix) {
  console.log(`\n▶ [CHECK] ${name}...`);
  try {
    fn();
    console.log(`  ✓ Passed: ${name}`);
  } catch (err) {
    fail(commandName, err.message, likelyCause, filesInvolved, recommendedFix);
  }
}

// 1. Environment Safety Guard
runStep(
  "Environment Safety Guard (Local DB Only)",
  "Environment Safety Check",
  () => {
    const envFiles = [".env", ".env.local"];
    for (const f of envFiles) {
      const fullPath = path.join(rootDir, f);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, "utf-8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("#") && trimmed.startsWith("DB_HOST")) {
            const val = trimmed.split("=")[1]?.trim().replace(/['"]/g, "");
            if (val && !["localhost", "127.0.0.1", ""].includes(val.toLowerCase())) {
              throw new Error(
                `Active DB_HOST in ${f} is configured to '${val}'. Target must strictly be localhost / 127.0.0.1.`,
              );
            }
          }
        }
      }
    }

    if (process.env.DB_HOST && !["localhost", "127.0.0.1"].includes(process.env.DB_HOST.toLowerCase())) {
      throw new Error(
        `process.env.DB_HOST is set to '${process.env.DB_HOST}'. Local verification is forbidden from targeting production or remote hosts.`,
      );
    }
  },
  "An environment variable or configuration file has DB_HOST pointing to a remote Hostinger host instead of localhost.",
  [".env", ".env.local", "process.env.DB_HOST"],
  "Ensure DB_HOST is set to 'localhost' or '127.0.0.1' for all local development and verification runs.",
);

// 2. Migration Immutability & Sequence Check
runStep(
  "Migration Immutability & Integrity Check (001–004 + Engine)",
  "Migration Immutability Check",
  () => {
    // 1. Verify directory sequence and filenames
    const diskMigrations = discoverMigrationFiles(path.join(rootDir, "migrations"));

    // 2. Verify immutable historical hashes
    const expectedHistoricalChecksums = {
      "001": "c27e2e7a155e45605d6c44d4fcf078efc7fc69128b48e049d552c2351d75a274",
      "002": "8b36a51b94031f8ec2ebe531c59d0a3ac1262dca459a943334870f40ef72dd31",
      "003": "24f4b943e277dc7b8eb8034e22ca82981bfd8a3de4366a585f9be56396f12837",
      "004": "d9d14848ef32801c77ecfaee951e6eeea1bf3803340edc11b20a3e3e85659175",
    };

    for (const [ver, expectedHash] of Object.entries(expectedHistoricalChecksums)) {
      const match = diskMigrations.find((m) => m.version === ver);
      if (!match) {
        throw new Error(`Required historical migration ${ver} is missing from migrations directory!`);
      }
      if (match.checksum !== expectedHash) {
        throw new Error(
          `Historical migration ${match.filename} has been modified! Applied migrations are immutable.\n` +
            `  Expected: ${expectedHash}\n` +
            `  Found:    ${match.checksum}`,
        );
      }
    }
  },
  "One or more historical migration files in migrations/ have been altered, corrupted, deleted, or out of sequence.",
  ["migrations/001_finance_v1.sql", "migrations/002_team_chat_v1.sql", "migrations/003_team_chat_groups_v1_1.sql", "migrations/004_leads_configurable_options.sql"],
  "Restore the missing or modified historical migration files from git. Never edit or delete applied migrations.",
);

// 3. Secrets Leak Prevention Check
runStep(
  "Secrets & .env Git Leak Prevention",
  "Git Secrets Leak Check",
  () => {
    const result = spawnSync("git", ["ls-files", ".env", ".env.local", ".env.production"], {
      cwd: rootDir,
      encoding: "utf-8",
    });

    if (result.stdout && result.stdout.trim().length > 0) {
      throw new Error(
        `Private environment file tracked in git index: ${result.stdout.trim()}`,
      );
    }
  },
  "A private .env file was accidentally added to the git index or committed.",
  [".env", ".env.local", ".gitignore"],
  "Run 'git rm --cached <file>' to un-track the environment file and ensure it is listed in .gitignore.",
);

// 4. TypeScript Compilation / Typecheck
runStep(
  "TypeScript Typecheck (tsc --noEmit)",
  "npm run typecheck",
  () => {
    const isWindows = process.platform === "win32";
    const npxCmd = isWindows ? "npx.cmd" : "npx";
    const result = spawnSync(npxCmd, ["tsc", "--noEmit"], {
      cwd: rootDir,
      stdio: "inherit",
      shell: true,
    });

    if (result.status !== 0) {
      throw new Error(`tsc --noEmit exited with code ${result.status}`);
    }
  },
  "Type errors or syntax mismatches in TypeScript source files.",
  ["tsconfig.json", "src/**/*.ts", "src/**/*.tsx"],
  "Inspect the TypeScript compiler diagnostics above and fix type errors before attempting to release.",
);

// 5. Production Application Build
runStep(
  "Production Application Build (vite build)",
  "npm run build",
  () => {
    const isWindows = process.platform === "win32";
    const npmCmd = isWindows ? "npm.cmd" : "npm";
    const result = spawnSync(npmCmd, ["run", "build"], {
      cwd: rootDir,
      stdio: "inherit",
      shell: true,
    });

    if (result.status !== 0) {
      throw new Error(`vite build exited with code ${result.status}`);
    }
  },
  "Vite bundling or Nitro SSR compilation error.",
  ["vite.config.ts", "nitro.config.ts", "src/**/*"],
  "Check Vite build output for unresolvable imports or bundling issues.",
);

console.log("\n==================================================");
console.log("✅ ALL LOCAL VERIFICATION CHECKS PASSED!");
console.log("Local system is clean and ready for user QA review.");
console.log("==================================================");
process.exit(0);
