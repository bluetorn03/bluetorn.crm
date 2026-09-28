/**
 * BLUETORN CRM — Server Authentication & Authorization Helpers
 *
 * Uses Web Crypto API (globalThis.crypto.subtle) for HMAC-SHA256 signing.
 * Web Crypto is available in Node.js 18+ and all modern browsers.
 * Server-only modules (@tanstack/react-start/server and ./db) are dynamically
 * loaded when executed in server context, ensuring zero server-only static
 * imports leak into client Vite/Rolldown builds.
 */
import { createMiddleware } from "@tanstack/react-start";
import type { Profile, UserRole } from "./db-types";

/* -------------------------------- constants -------------------------------- */

export const SESSION_COOKIE = "bt_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

/* ---------------------------- dynamic server loaders ----------------------- */

async function getServerCookie() {
  return await import("@tanstack/react-start/server");
}

async function getDb() {
  return await import("./db");
}

/* ----------------------------- session tokens ----------------------------- */

let _devFallbackKey: CryptoKey | null = null;

async function getSigningKey(): Promise<CryptoKey> {
  const secret = typeof process !== "undefined" ? process.env?.["SESSION_SECRET"] : undefined;
  if (secret && secret.length >= 32) {
    const keyMaterial = new TextEncoder().encode(secret);
    const padded = new Uint8Array(32);
    padded.set(keyMaterial.slice(0, 32));
    return globalThis.crypto.subtle.importKey(
      "raw",
      padded,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
  }

  if (typeof process !== "undefined" && process.env?.["NODE_ENV"] === "production") {
    console.error(
      "[CRITICAL] SESSION_SECRET env var is missing or too short. Set a strong secret (min 32 chars) in production!",
    );
  }

  if (!_devFallbackKey) {
    const randBytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(randBytes);
    _devFallbackKey = await globalThis.crypto.subtle.importKey(
      "raw",
      randBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
  }
  return _devFallbackKey;
}

function toBase64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(str: string): Uint8Array {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Create an HMAC-SHA256 signed session token.
 * Format: base64url(payload).base64url(hmac)
 * Payload: userId:issuedAt:nonce
 */
export async function createSessionToken(userId: string): Promise<string> {
  const key = await getSigningKey();
  const nonce = new Uint8Array(16);
  globalThis.crypto.getRandomValues(nonce);
  const payload = `${userId}:${Date.now()}:${toBase64url(nonce)}`;
  const payloadB64 = toBase64url(new TextEncoder().encode(payload));
  const sigBuf = await globalThis.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  const sig = toBase64url(sigBuf);
  return `${payloadB64}.${sig}`;
}

/**
 * Verify the HMAC signature and extract userId.
 * Returns null if the token is invalid, expired, or tampered.
 */
export async function parseSessionToken(token: string): Promise<string | null> {
  try {
    const dotIdx = token.lastIndexOf(".");
    if (dotIdx === -1) return null;
    const payloadB64 = token.slice(0, dotIdx);
    const sig = token.slice(dotIdx + 1);
    const key = await getSigningKey();
    const valid = await globalThis.crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64url(sig) as unknown as BufferSource,
      new TextEncoder().encode(payloadB64),
    );
    if (!valid) return null;
    const payloadBytes = fromBase64url(payloadB64);
    const payload = new TextDecoder().decode(payloadBytes);
    const parts = payload.split(":");
    return parts[0] || null;
  } catch {
    return null;
  }
}

/* ------------------------------ cookie helpers ----------------------------- */

export async function setSessionCookie(token: string): Promise<void> {
  const { setCookie } = await getServerCookie();
  setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: typeof process !== "undefined" && process.env?.["NODE_ENV"] === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const { deleteCookie } = await getServerCookie();
  deleteCookie(SESSION_COOKIE, { path: "/" });
}

export async function readSessionCookie(): Promise<string | null> {
  try {
    const { getCookie } = await getServerCookie();
    return getCookie(SESSION_COOKIE) || null;
  } catch {
    return null;
  }
}

/* -------------------------------- middleware -------------------------------- */

/**
 * Middleware that authenticates a request using the MySQL session cookie.
 * Injects `userId`, `workspaceId`, and `role` into `context`.
 * Throws 401 if unauthenticated or user inactive.
 */
export const requireMySqlAuth = createMiddleware().server(async ({ next }) => {
  const token = await readSessionCookie();
  if (!token) {
    throw new Error("Unauthorized: No session cookie present.");
  }

  const userId = await parseSessionToken(token);
  if (!userId) {
    throw new Error("Unauthorized: Invalid or expired session token.");
  }

  const { queryOne } = await getDb();
  const profile = await queryOne<Profile>(
    "SELECT id, workspace_id, is_active FROM profiles WHERE id = ? LIMIT 1",
    [userId],
  );

  if (!profile || !profile.is_active) {
    await clearSessionCookie();
    throw new Error("Unauthorized: Account is inactive or does not exist.");
  }

  const role = await queryOne<UserRole>(
    "SELECT role FROM user_roles WHERE user_id = ? LIMIT 1",
    [userId],
  );

  return next({
    context: {
      userId: profile.id,
      workspaceId: profile.workspace_id,
      role: role?.role ?? "employee",
    },
  });
});

/* ------------------------------- permissions ------------------------------- */

export const PERMISSION_ALIASES: Record<string, string[]> = {
  "finance.view": ["finance.view", "view.finance", "manage.finance"],
  "finance.invoices.view": ["finance.invoices.view", "finance.view", "view.finance", "manage.finance"],
  "finance.invoices.create": ["finance.invoices.create", "create.invoice"],
  "finance.invoices.edit": ["finance.invoices.edit", "edit.invoice"],
  "finance.invoices.issue": ["finance.invoices.issue", "issue.invoice"],
  "finance.invoices.cancel": ["finance.invoices.cancel", "cancel.invoice"],
  "finance.invoices.delete": ["finance.invoices.delete", "finance.invoices.cancel", "cancel.invoice"],
  "finance.payments.view": ["finance.payments.view", "finance.view", "view.finance", "manage.finance"],
  "finance.payments.record": ["finance.payments.record", "finance.payments.create", "record.payment"],
  "finance.payments.create": ["finance.payments.create", "finance.payments.record", "record.payment"],
  "finance.payments.edit": ["finance.payments.edit", "edit.payment"],
  "finance.payments.reverse": ["finance.payments.reverse", "reverse.payment"],
  "finance.reports.view": ["finance.reports.view", "view.finance_reports", "view.reports", "manage.finance"],
  "finance.settings.view": ["finance.settings.view", "settings.view"],
  "finance.settings.edit": ["finance.settings.edit", "settings.edit"],
};

/**
 * Server-side authorization check.
 * - Owner and Super Admin have full access.
 * - Employees and Managers require explicit granular permission in `user_permissions`.
 * - Validates workspace isolation.
 */
export async function assertPermission(
  context: { userId: string; workspaceId: string | null; role: string },
  permission: string,
  targetWorkspaceId?: string,
): Promise<void> {
  const wsId = targetWorkspaceId || context.workspaceId;
  if (!wsId) throw new Error("FORBIDDEN: No workspace context.");

  // Workspace isolation: user must belong to the workspace unless super_admin
  if (context.role !== "super_admin" && context.workspaceId !== wsId) {
    throw new Error("FORBIDDEN: Cross-workspace access denied.");
  }

  // Super admin and Owner have full access
  if (context.role === "super_admin" || context.role === "owner") {
    return;
  }

  const { queryOne } = await getDb();
  const candidatePerms = PERMISSION_ALIASES[permission] || [permission];
  const placeholders = candidatePerms.map(() => "?").join(", ");
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM user_permissions WHERE workspace_id = ? AND user_id = ? AND permission IN (${placeholders}) LIMIT 1`,
    [wsId, context.userId, ...candidatePerms],
  );

  if (!row) {
    throw new Error(`FORBIDDEN: You do not have '${permission}' permission.`);
  }
}