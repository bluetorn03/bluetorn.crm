/**
 * BLUETORN CRM — Server-only utility functions.
 *
 * DO NOT import in client components.
 */
import bcrypt from "bcryptjs";
import { queryOne } from "./db";
import type { UserRole } from "./db-types";

const BCRYPT_ROUNDS = 10;

/** Hash a password with bcrypt. */
export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_ROUNDS);
}

/** Verify a password against a bcrypt hash. */
export async function verifyPassword(
  plaintext: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

/** Check if a user has super_admin role. */
export async function isSuperAdmin(userId: string): Promise<boolean> {
  const role = await queryOne<UserRole>(
    "SELECT role FROM user_roles WHERE user_id = ? AND role = 'super_admin' LIMIT 1",
    [userId],
  );
  return !!role;
}

/** Check if a user can manage workspace users (owner or manager). */
export async function canManageWorkspaceUsers(userId: string): Promise<boolean> {
  const role = await queryOne<UserRole>(
    "SELECT role FROM user_roles WHERE user_id = ? AND role IN ('owner', 'manager') LIMIT 1",
    [userId],
  );
  return !!role;
}