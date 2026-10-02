/**
 * BLUETORN CRM — Local Git Hooks Setup Script
 *
 * Installs the pre-push safety hook into .git/hooks/pre-push.
 * Gracefully skips if .git directory does not exist (e.g., in CI or tarball).
 *
 * Usage:
 *   node scripts/setup-hooks.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const gitHooksDir = path.join(rootDir, ".git", "hooks");

if (!fs.existsSync(path.join(rootDir, ".git"))) {
  console.log("ℹ️  Not a git repository root. Skipping Git hook setup.");
  process.exit(0);
}

if (!fs.existsSync(gitHooksDir)) {
  fs.mkdirSync(gitHooksDir, { recursive: true });
}

const prePushHookPath = path.join(gitHooksDir, "pre-push");
const hookContent = `#!/bin/sh
# BLUETORN CRM Pre-Push Safety Guard
node scripts/git-pre-push.mjs
exit $?
`;

fs.writeFileSync(prePushHookPath, hookContent, { encoding: "utf-8", mode: 0o755 });
console.log("✅ BLUETORN CRM Git pre-push hook installed at .git/hooks/pre-push");
