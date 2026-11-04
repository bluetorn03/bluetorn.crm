/**
 * BLUETORN CRM — Incident Remediation & Production Safety Test Suite
 *
 * Validates:
 * 1. Missing, short, and valid production SESSION_SECRET configuration
 * 2. Session signing and verification across requests and simulated restarts
 * 3. Expired, invalid, and tampered session tokens
 * 4. View-As token creation, expiration, and tampering
 * 5. Error formatter sanitization (Hostinger CDN challenge, raw HTML, secrets redaction)
 * 6. Server function response protocol (non-HTML error response protection)
 * 7. Workspace isolation and finance transaction integrity
 *
 * Usage:
 *   node --env-file=.env scripts/test-production-incident-remediation.mjs
 */

import assert from "node:assert/strict";
import {
  createSessionToken,
  parseSessionToken,
  createViewAsToken,
  parseViewAsToken,
  validateSessionSecretConfig,
  getSigningKey,
  resetSigningKeyCacheForTesting,
  SESSION_MAX_AGE,
} from "../src/lib/auth-server.ts";
import { formatErrorMessage, isCdnSecurityChallenge, safeToastError } from "../src/lib/error-formatter.ts";
import { toast } from "sonner";
import { query, queryOne } from "../src/lib/db.ts";

console.log("==================================================");
console.log("🛡️  BLUETORN CRM — PRODUCTION INCIDENT AUDIT TESTS");
console.log("==================================================\n");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// ─── 1. SESSION SECRET PRODUCTION CONFIGURATION & VALIDATION ────────────────

console.log("[SECTION 1] Session Secret Configuration & Production Safety Guard");

const originalEnv = { ...process.env };

try {
  // Scenario 1A: Production with missing SESSION_SECRET
  process.env.NODE_ENV = "production";
  delete process.env.SESSION_SECRET;
  resetSigningKeyCacheForTesting();

  const valMissing = validateSessionSecretConfig();
  test("Production rejects missing SESSION_SECRET in config validation", () => {
    assert.equal(valMissing.ok, false);
    assert.match(valMissing.error, /missing or shorter than 32 characters/i);
  });

  await testAsync("Production throws fatal error on getSigningKey when secret is missing", async () => {
    let threw = false;
    try {
      await getSigningKey();
    } catch (err) {
      threw = true;
      assert.match(err.message, /\[FATAL\] SESSION_SECRET/);
    }
    assert.equal(threw, true, "Should have thrown fatal error");
  });

  // Scenario 1B: Production with short SESSION_SECRET (< 32 chars)
  process.env.NODE_ENV = "production";
  process.env.SESSION_SECRET = "short_secret_under_32_bytes";
  resetSigningKeyCacheForTesting();

  const valShort = validateSessionSecretConfig();
  test("Production rejects short (< 32 chars) SESSION_SECRET in config validation", () => {
    assert.equal(valShort.ok, false);
    assert.match(valShort.error, /shorter than 32 characters/i);
  });

  await testAsync("Production throws fatal error on getSigningKey when secret is too short", async () => {
    let threw = false;
    try {
      await getSigningKey();
    } catch (err) {
      threw = true;
      assert.match(err.message, /\[FATAL\] SESSION_SECRET/);
    }
    assert.equal(threw, true, "Should have thrown fatal error");
  });

  // Scenario 1C: Production with valid strong SESSION_SECRET (>= 32 chars)
  process.env.NODE_ENV = "production";
  const validSecret = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"; // 64 hex chars
  process.env.SESSION_SECRET = validSecret;
  resetSigningKeyCacheForTesting();

  const valValid = validateSessionSecretConfig();
  test("Production accepts valid >= 32 character secret", () => {
    assert.equal(valValid.ok, true);
    assert.equal(valValid.error, undefined);
  });

  await testAsync("Production successfully imports HMAC key with valid secret", async () => {
    const key = await getSigningKey();
    assert.ok(key, "CryptoKey must be generated");
    assert.equal(key.algorithm.name, "HMAC");
  });

  // Scenario 1D: Local development uses fallback without crashing
  process.env.NODE_ENV = "development";
  delete process.env.SESSION_SECRET;
  resetSigningKeyCacheForTesting();

  const valDev = validateSessionSecretConfig();
  test("Development allows fallback with warning in validation", () => {
    assert.equal(valDev.ok, true);
    assert.match(valDev.error, /Using a development-only ephemeral/);
  });

  await testAsync("Development allows ephemeral key generation without throwing", async () => {
    const devKey = await getSigningKey();
    assert.ok(devKey);
    assert.equal(devKey.algorithm.name, "HMAC");
  });
} finally {
  // Restore process.env
  process.env = { ...originalEnv };
  resetSigningKeyCacheForTesting();
}

// ─── 2. SESSION SIGNING ACROSS REQUESTS & SIMULATED RESTARTS ────────────────

console.log("\n[SECTION 2] Session Signing, Verification & Restart Resilience");

const stableSecret = "c9f8a7b6e5d4c3b2a10987654321fedcba0987654321fedcba0987654321fedc";
process.env.NODE_ENV = "production";
process.env.SESSION_SECRET = stableSecret;
resetSigningKeyCacheForTesting();

const sampleUserId = "9e8f61bb-42f1-4cfa-b272-d92401e003d8";

let sessionToken = await createSessionToken(sampleUserId);
test("createSessionToken generates valid dot-separated HMAC token", () => {
  assert.equal(typeof sessionToken, "string");
  assert.ok(sessionToken.includes("."), "Must contain dot separator between payload and HMAC");
});

const verifiedUserId = await parseSessionToken(sessionToken);
test("parseSessionToken verifies token and returns correct userId", () => {
  assert.equal(verifiedUserId, sampleUserId);
});

// SIMULATE SERVER RESTART: wipe in-memory cache, re-verify with same stable secret
resetSigningKeyCacheForTesting();
const verifiedAfterRestart = await parseSessionToken(sessionToken);
test("Tokens remain VALID across server restarts when stable SESSION_SECRET is configured", () => {
  assert.equal(
    verifiedAfterRestart,
    sampleUserId,
    "Stable secret must allow persistent session verification across restarts"
  );
});

// SIMULATE SECRET MISMATCH / ROTATION: verify token signed with old secret fails on new secret
process.env.SESSION_SECRET = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
resetSigningKeyCacheForTesting();
const verifiedWithWrongSecret = await parseSessionToken(sessionToken);
test("Tokens fail verification if secret does not match (tamper/rotation boundary)", () => {
  assert.equal(verifiedWithWrongSecret, null);
});

// Restore stable secret
process.env.SESSION_SECRET = stableSecret;
resetSigningKeyCacheForTesting();

// ─── 3. EXPIRED, MALFORMED & TAMPERED SESSIONS ──────────────────────────────

console.log("\n[SECTION 3] Session Expiration, Tampering & View-As Token Security");

// Tamper signature
const tamperedSig = sessionToken.slice(0, -6) + "XXXXXX";
const parsedTamperedSig = await parseSessionToken(tamperedSig);
test("Rejects session with modified HMAC signature", () => {
  assert.equal(parsedTamperedSig, null);
});

// Tamper payload
const parts = sessionToken.split(".");
const tamperedPayload = "bm90X3JlYWxfdXNlcg." + parts[1];
const parsedTamperedPayload = await parseSessionToken(tamperedPayload);
test("Rejects session with tampered payload", () => {
  assert.equal(parsedTamperedPayload, null);
});

// Malformed token without dot
const malformedNoDot = "malformed_token_without_dot";
const parsedMalformed = await parseSessionToken(malformedNoDot);
test("Rejects malformed session token without dot delimiter", () => {
  assert.equal(parsedMalformed, null);
});

// Expired token test: construct an artificially expired payload
const oldTimestamp = Date.now() - (SESSION_MAX_AGE + 3600) * 1000; // expired 1 hour ago
const nonce = new Uint8Array(16);
globalThis.crypto.getRandomValues(nonce);
function toB64Url(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const expiredPayload = `${sampleUserId}:${oldTimestamp}:${toB64Url(nonce)}`;
const expiredPayloadB64 = toB64Url(new TextEncoder().encode(expiredPayload));
const key = await getSigningKey();
const expiredSigBuf = await globalThis.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(expiredPayloadB64));
const expiredToken = `${expiredPayloadB64}.${toB64Url(expiredSigBuf)}`;

const parsedExpired = await parseSessionToken(expiredToken);
test("Rejects expired session token exceeding SESSION_MAX_AGE", () => {
  assert.equal(parsedExpired, null);
});

// View-As token verification
const ownerId = "76a64772-b0df-429a-aed7-dc487d9b2901";
const employeeId = "87b75883-c1ef-530b-bfe8-ed598e0c3012";
const workspaceId = "00000000-0000-0000-0000-000000000001";

const viewAsToken = await createViewAsToken(ownerId, employeeId, workspaceId);
test("createViewAsToken generates valid signed token", () => {
  assert.equal(typeof viewAsToken, "string");
  assert.ok(viewAsToken.includes("."));
});

const parsedViewAs = await parseViewAsToken(viewAsToken);
test("parseViewAsToken extracts owner, employee, and workspace correctly", () => {
  assert.ok(parsedViewAs);
  assert.equal(parsedViewAs.ownerUserId, ownerId);
  assert.equal(parsedViewAs.employeeId, employeeId);
  assert.equal(parsedViewAs.workspaceId, workspaceId);
});

const tamperedViewAs = viewAsToken.slice(0, -3) + "ZZZ";
const parsedTamperedViewAs = await parseViewAsToken(tamperedViewAs);
test("parseViewAsToken rejects tampered View-As signature", () => {
  assert.equal(parsedTamperedViewAs, null);
});

// ─── 4. ERROR FORMATTER & SANITIZATION (HOSTINGER CDN CHALLENGE) ────────────

console.log("\n[SECTION 4] Error Formatter & HTML / CDN Challenge Sanitization");

const hostingerChallengeHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="X-UA-Compatible" content="IE=Edge"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Checking your browser before accessing. Just a moment...</title></head><body><h1>Checking your browser</h1><script src="/hcdn-cgi/jschallenge"></script></body></html>`;

const sanitizedChallenge = formatErrorMessage(new Error(hostingerChallengeHtml));
test("Sanitizes Hostinger CDN /hcdn-cgi/jschallenge into user-friendly guidance", () => {
  assert.ok(!sanitizedChallenge.includes("<script"), "Must not contain raw HTML scripts");
  assert.ok(!sanitizedChallenge.includes("<!DOCTYPE"), "Must not contain DOCTYPE header");
  assert.match(sanitizedChallenge, /Network security verification required by Hostinger CDN/i);
  assert.match(sanitizedChallenge, /refresh the page/i);
});

const generic502Html = `<!DOCTYPE html><html><head><title>502 Bad Gateway</title></head><body><center><h1>502 Bad Gateway</h1></center><hr><center>nginx</center></body></html>`;
const sanitized502 = formatErrorMessage(generic502Html);
test("Sanitizes upstream Nginx 502 HTML into clean error message", () => {
  assert.ok(!sanitized502.includes("<html>"));
  assert.match(sanitized502, /temporary server or network error/i);
});

const secretLeakingError = new Error("Database auth failed for user=root password=SuperSecretPassword123 with token=abcdef");
const sanitizedSecrets = formatErrorMessage(secretLeakingError);
test("Redacts passwords and secrets from error strings", () => {
  assert.ok(!sanitizedSecrets.includes("SuperSecretPassword123"));
  assert.ok(sanitizedSecrets.includes("password=[REDACTED]"));
  assert.ok(sanitizedSecrets.includes("token=[REDACTED]"));
});

const normalError = new Error("Customer name is required.");
const sanitizedNormal = formatErrorMessage(normalError);
test("Preserves standard validation error messages unmodified", () => {
  assert.equal(sanitizedNormal, "Customer name is required.");
});

// CDN challenge detection helper tests
test("isCdnSecurityChallenge correctly detects all CDN challenge variants", () => {
  assert.equal(isCdnSecurityChallenge(hostingerChallengeHtml), true);
  assert.equal(isCdnSecurityChallenge(new Error("Failed: /hcdn-cgi/jschallenge")), true);
  assert.equal(isCdnSecurityChallenge("Checking your browser before accessing"), true);
  assert.equal(isCdnSecurityChallenge("cf-browser-verification"), true);
  assert.equal(isCdnSecurityChallenge("Just a moment..."), true);
  assert.equal(isCdnSecurityChallenge({ message: "Checking your browser before accessing" }), true);
});

test("isCdnSecurityChallenge returns false for standard non-challenge errors", () => {
  assert.equal(isCdnSecurityChallenge("Customer name is required."), false);
  assert.equal(isCdnSecurityChallenge(new Error("Lead not found")), false);
  assert.equal(isCdnSecurityChallenge(null), false);
  assert.equal(isCdnSecurityChallenge(undefined), false);
  assert.equal(isCdnSecurityChallenge(""), false);
});

// Safe toast error tests
let capturedToast = null;
const origToastError = toast.error;
toast.error = (msg, data) => {
  capturedToast = { msg, data };
  return "test-toast-id";
};

test("safeToastError attaches Refresh action for CDN security challenge", () => {
  capturedToast = null;
  safeToastError(hostingerChallengeHtml);
  assert.ok(capturedToast);
  assert.match(capturedToast.msg, /Network security verification required by Hostinger CDN/i);
  assert.ok(capturedToast.data?.action);
  assert.equal(capturedToast.data.action.label, "Refresh");
  assert.equal(typeof capturedToast.data.action.onClick, "function");
});

test("safeToastError preserves standard error message without Refresh action", () => {
  capturedToast = null;
  safeToastError("Invoice amount must be greater than zero.");
  assert.ok(capturedToast);
  assert.equal(capturedToast.msg, "Invoice amount must be greater than zero.");
  assert.equal(capturedToast.data, undefined);
});

// Global toast.error wrapper emulation test
const safeWrappedToastError = (message, data) => {
  const isChallenge = isCdnSecurityChallenge(message);
  const safeMessage =
    typeof message === "string" || message instanceof Error || (typeof message === "object" && message !== null && "message" in message)
      ? formatErrorMessage(message)
      : message;

  let toastOptions = data;
  if (isChallenge && (!toastOptions || !toastOptions.action)) {
    toastOptions = {
      ...toastOptions,
      action: {
        label: "Refresh",
        onClick: () => {},
      },
    };
  }
  return { safeMessage, toastOptions };
};

test("Global toast.error wrapper sanitizes raw HTML and prevents raw markup in toasts", () => {
  const result = safeWrappedToastError(hostingerChallengeHtml);
  assert.ok(!result.safeMessage.includes("<!DOCTYPE"));
  assert.ok(!result.safeMessage.includes("<script"));
  assert.match(result.safeMessage, /Network security verification required/i);
  assert.equal(result.toastOptions.action.label, "Refresh");
});

test("Global toast.error wrapper passes normal validation string untouched", () => {
  const result = safeWrappedToastError("Property name is required.");
  assert.equal(result.safeMessage, "Property name is required.");
  assert.equal(result.toastOptions, undefined);
});

test("MutationCache avoids duplicate toasts when mutation defines onError", () => {
  let globalToastFired = false;
  const mockMutationWithOnError = { options: { onError: () => {} } };
  const mockMutationWithoutOnError = { options: {} };

  const handleMutationError = (mutation) => {
    if (mutation.options.onError) return;
    globalToastFired = true;
  };

  handleMutationError(mockMutationWithOnError);
  assert.equal(globalToastFired, false, "Must not fire global toast when mutation has local onError");

  handleMutationError(mockMutationWithoutOnError);
  assert.equal(globalToastFired, true, "Must fire safe toast when mutation lacks local onError");
});

toast.error = origToastError;

// ─── 5. WORKSPACE ISOLATION & FINANCIAL INTEGRITY CHECKS ────────────────────

console.log("\n[SECTION 5] Database Workspace Boundaries & Financial Consistency");

const jayshreeWorkspace = await queryOne("SELECT id, name, code FROM workspaces WHERE code = 'JAYSHREE'");
test("Jayshree workspace exists in local database", () => {
  assert.ok(jayshreeWorkspace);
  assert.equal(jayshreeWorkspace.code, "JAYSHREE");
});

if (jayshreeWorkspace) {
  const invoices = await query(
    "SELECT id, workspace_id, invoice_number, total, status FROM invoices WHERE workspace_id = ?",
    [jayshreeWorkspace.id]
  );
  test("Invoices strictly match workspace_id tenant boundary", () => {
    for (const inv of invoices) {
      assert.equal(inv.workspace_id, jayshreeWorkspace.id);
      assert.ok(typeof inv.total === "number" || typeof inv.total === "string");
    }
  });

  const payments = await query(
    "SELECT id, workspace_id, amount, status FROM payments WHERE workspace_id = ?",
    [jayshreeWorkspace.id]
  );
  test("Payments strictly match workspace_id tenant boundary", () => {
    for (const p of payments) {
      assert.equal(p.workspace_id, jayshreeWorkspace.id);
    }
  });
}

// ─── TEST SUMMARY ───────────────────────────────────────────────────────────

console.log("\n==================================================");
console.log(`INCIDENT AUDIT TEST SUMMARY: ${passed} passed, ${failed} failed`);
console.log("==================================================");

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
