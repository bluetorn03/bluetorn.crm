/**
 * BLUETORN CRM identity model.
 *
 * Users never sign in with an email address. They sign in with:
 *   Workspace Code + User ID + Password
 *
 * Auth requires a unique identifier per account, so we derive a deterministic,
 * non-routable internal address from the workspace code and user ID. It is an
 * internal identifier only — never shown to users, never used for mail.
 * The user's real email lives on their profile (communication + recovery).
 */

export const PLATFORM_WORKSPACE_CODE = "BLUETORN";
const IDENTITY_DOMAIN = "users.bluetorn.app";

/** Lowercase, strip anything that isn't alphanumeric, collapse separators. */
export function normalizeCode(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Workspace codes are stored and displayed uppercase (e.g. BT-RE-1042). */
export function canonicalWorkspaceCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

/** User IDs are stored and displayed lowercase (e.g. arjun.mehta). */
export function canonicalUserCode(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

/** Deterministic internal auth identifier for a workspace user. */
export function authIdentifierFor(workspaceCode: string, userCode: string): string {
  const ws = normalizeCode(workspaceCode);
  const user = normalizeCode(userCode);
  return `${user}.${ws}@${IDENTITY_DOMAIN}`;
}

/** Platform staff (Super Admins) live outside any workspace. */
export function platformAuthIdentifierFor(userCode: string): string {
  return authIdentifierFor(PLATFORM_WORKSPACE_CODE, userCode);
}

export function isValidWorkspaceCode(value: string): boolean {
  return /^[A-Z0-9][A-Z0-9-]{2,30}$/.test(canonicalWorkspaceCode(value));
}

export function isValidUserCode(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{1,30}$/.test(canonicalUserCode(value));
}
