/**
 * BLUETORN CRM — Git Pre-Push Safety Guard
 *
 * Prevents accidental direct pushes to 'main'.
 *
 * Behavior:
 * - Feature/fix/chore branches are always allowed to push.
 * - Pushes targeting 'main' are blocked by default unless explicitly approved
 *   via the environment flag BLUETORN_RELEASE_APPROVED=true.
 */

import readline from "node:readline";

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  let pushingToMain = false;

  for await (const line of rl) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 4) {
      const remoteRef = parts[2];
      if (remoteRef === "refs/heads/main" || remoteRef === "refs/for/main") {
        pushingToMain = true;
      }
    }
  }

  // Also check if current branch is main and no stdin was provided (e.g., direct call)
  if (process.argv.includes("--check-current")) {
    const { execSync } = await import("node:child_process");
    const currentBranch = execSync("git branch --show-current", { encoding: "utf-8" }).trim();
    if (currentBranch === "main") {
      pushingToMain = true;
    }
  }

  if (pushingToMain) {
    if (process.env.BLUETORN_RELEASE_APPROVED === "true") {
      console.log("🔓 Release approval verified (BLUETORN_RELEASE_APPROVED=true). Allowing push to main.");
      process.exit(0);
    }

    console.error("\n==================================================");
    console.error("🛑 PRODUCTION RELEASE BLOCKED: DIRECT PUSH TO MAIN");
    console.error("==================================================");
    console.error("Direct push to 'main' is blocked by BLUETORN CRM safety policy.\n");
    console.error("Required Development Flow:");
    console.error("  1. Work on a feature branch: git checkout -b feature/<name>");
    console.error("  2. Verify all checks pass:   npm run verify");
    console.error("  3. Request user review and submit a Pull Request to 'main'");
    console.error("  4. Merge only after CI quality checks pass.\n");
    console.error("For intentional, explicitly approved releases, set:");
    console.error("  PowerShell:  $env:BLUETORN_RELEASE_APPROVED=\"true\"; git push origin main");
    console.error("  Bash/Zsh:    BLUETORN_RELEASE_APPROVED=true git push origin main");
    console.error("==================================================\n");
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Pre-push guard error:", err);
  process.exit(1);
});
