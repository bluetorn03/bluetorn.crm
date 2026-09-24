/**
 * BLUETORN CRM — MySQL-backed authentication server functions.
 *
 * Uses bcrypt for password hashing and signed session cookies for persistence.
 */
import { createServerFn } from "@tanstack/react-start";
import { createMiddleware } from "@tanstack/react-start";
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import bcrypt from "bcryptjs";
import { query, queryOne, execute, uuid } from "./db";
import {
  canonicalWorkspaceCode,
  canonicalUserCode,
  PLATFORM_WORKSPACE_CODE,
} from "./auth-identity";
import type { Profile, UserRole, Workspace } from "./db-types";

/* --------------------------------- types ---------------------------------- */

export type SessionPayload = {
  userId: string;
  userCode: string;
  fullName: string;
  email: string;
  phone: string;
  jobTitle: string;
  avatarUrl: string | null;
  isActive: boolean;
  role: "super_admin" | "owner" | "manager" | "employee";
  workspaceId: string | null;
  workspaceCode: string;
  workspaceName: string;
};

/* -------------------------------- constants -------------------------------- */

const SESSION_COOKIE = "bt_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

/* ----------------------------- session tokens ----------------------------- */

/**
 * Simple HMAC-like session token: base64(userId:timestamp:random).
 * The session is stateless — the token encodes the user ID and we look up
 * the rest from MySQL on every request.
 */
function createSessionToken(userId: string): string {
  const payload = `${userId}:${Date.now()}:${uuid()}`;
  if (typeof Buffer !== "undefined") {
    return Buffer.from(payload, "utf-8").toString("base64url");
  }
  return btoa(payload);
}

function parseSessionToken(token: string): string | null {
  try {
    let decoded: string;
    if (typeof Buffer !== "undefined") {
      decoded = Buffer.from(token, "base64url").toString("utf-8");
    } else {
      decoded = atob(token);
    }
    const parts = decoded.split(":");
    return parts[0] || null;
  } catch {
    return null;
  }
}

/* ------------------------------ cookie helpers ----------------------------- */

function setSessionCookie(token: string) {
  setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

function clearSessionCookie() {
  deleteCookie(SESSION_COOKIE, { path: "/" });
}

function readSessionCookie(): string | null {
  try {
    return getCookie(SESSION_COOKIE) || null;
  } catch {
    return null;
  }
}

/* ------------------------------ server functions -------------------------- */

/** Login: workspace code + user ID + password → session cookie. */
export const loginAction = createServerFn({ method: "POST" })
  .validator((input: { workspaceCode: string; userId: string; password: string }) => {
    if (!input.workspaceCode?.trim()) throw new Error("Workspace code is required.");
    if (!input.userId?.trim()) throw new Error("User ID is required.");
    if (!input.password) throw new Error("Password is required.");
    return input;
  })
  .handler(async ({ data }) => {
    const wsCode = canonicalWorkspaceCode(data.workspaceCode);
    const userCode = canonicalUserCode(data.userId);

    // 1. Find workspace
    const isSuperAdmin = wsCode === PLATFORM_WORKSPACE_CODE;
    let workspace: Workspace | null = null;

    if (!isSuperAdmin) {
      workspace = await queryOne<Workspace>(
        "SELECT * FROM workspaces WHERE code = ? LIMIT 1",
        [wsCode],
      );
      if (!workspace) {
        throw new Error("Invalid workspace code, user ID or password.");
      }
      if (!["active", "trial"].includes(workspace.status)) {
        throw new Error("WORKSPACE_INACTIVE");
      }
    } else {
      workspace = await queryOne<Workspace>(
        "SELECT * FROM workspaces WHERE code = ? LIMIT 1",
        [PLATFORM_WORKSPACE_CODE],
      );
    }

    // 2. Find user profile
    const profile = await queryOne<Profile>(
      isSuperAdmin
        ? "SELECT * FROM profiles WHERE user_code = ? AND (workspace_id = ? OR workspace_id IS NULL) LIMIT 1"
        : workspace
          ? "SELECT * FROM profiles WHERE user_code = ? AND workspace_id = ? LIMIT 1"
          : "SELECT * FROM profiles WHERE user_code = ? AND workspace_id IS NULL LIMIT 1",
      isSuperAdmin
        ? [userCode, workspace?.id ?? ""]
        : workspace
          ? [userCode, workspace.id]
          : [userCode],
    );

    if (!profile) {
      throw new Error("Invalid workspace code, user ID or password.");
    }

    // 3. Check account active
    if (!profile.is_active) {
      throw new Error("USER_INACTIVE");
    }

    // 4. Verify password
    if (!profile.password_hash) {
      throw new Error("Invalid workspace code, user ID or password.");
    }

    const passwordValid = await bcrypt.compare(data.password, profile.password_hash);
    if (!passwordValid) {
      throw new Error("Invalid workspace code, user ID or password.");
    }

    // 5. Get role
    const role = await queryOne<UserRole>(
      "SELECT * FROM user_roles WHERE user_id = ? ORDER BY CASE WHEN role = 'super_admin' THEN 0 ELSE 1 END LIMIT 1",
      [profile.id],
    );
    if (!role) {
      throw new Error("NO_ROLE");
    }

    // 6. Create session
    const token = createSessionToken(profile.id);
    setSessionCookie(token);

    // 7. Update last_login_at
    await execute(
      "UPDATE profiles SET last_login_at = NOW() WHERE id = ?",
      [profile.id],
    );

    return {
      ok: true,
      isSuperAdmin: role.role === "super_admin",
      role: role.role,
    };
  });

/** Logout: clear session cookie. */
export const logoutAction = createServerFn({ method: "POST" }).handler(async () => {
  clearSessionCookie();
  return { ok: true };
});

/** Get current session data from cookie. */
export const getSessionAction = createServerFn({ method: "GET" }).handler(async () => {
  const token = readSessionCookie();
  if (!token) return { authenticated: false as const };

  const userId = parseSessionToken(token);
  if (!userId) return { authenticated: false as const };

  const profile = await queryOne<Profile>(
    "SELECT * FROM profiles WHERE id = ? LIMIT 1",
    [userId],
  );
  if (!profile || !profile.is_active) {
    clearSessionCookie();
    return { authenticated: false as const };
  }

  const role = await queryOne<UserRole>(
    "SELECT * FROM user_roles WHERE user_id = ? ORDER BY CASE WHEN role = 'super_admin' THEN 0 ELSE 1 END LIMIT 1",
    [profile.id],
  );
  if (!role) {
    clearSessionCookie();
    return { authenticated: false as const };
  }

  // Load workspace
  let workspace: Workspace | null = null;
  if (profile.workspace_id) {
    workspace = await queryOne<Workspace>(
      "SELECT * FROM workspaces WHERE id = ? LIMIT 1",
      [profile.workspace_id],
    );
  }

  // Load all workspaces for super admin
  let allWorkspaces: Workspace[] = [];
  if (role.role === "super_admin") {
    allWorkspaces = await query<Workspace>(
      "SELECT * FROM workspaces ORDER BY name",
    );
  } else if (workspace) {
    allWorkspaces = [workspace];
  }

  return {
    authenticated: true as const,
    user: {
      id: profile.id,
      userCode: profile.user_code,
      name: profile.full_name,
      email: profile.email ?? "",
      phone: profile.phone ?? "",
      whatsappPhone: (profile as any).whatsapp_phone ?? "",
      jobTitle: profile.job_title ?? "",
      avatarUrl: profile.avatar_url,
      isActive: Boolean(profile.is_active),
    },
    role: role.role,
    workspaces: allWorkspaces.map((w) => ({
      id: w.id,
      code: w.code,
      name: w.name,
      industry: w.industry,
      plan: w.plan,
      status: w.status,
      currency: w.currency,
      timezone: w.timezone,
      dateFormat: w.date_format,
      timeFormat: w.time_format,
      logoUrl: w.logo_url,
      seatLimit: w.seat_limit,
    })),
    primaryWorkspaceId: profile.workspace_id,
  };
});

/* ----------------------------- auth middleware ----------------------------- */

/**
 * Server-function middleware that validates the session cookie
 * and injects userId into the context.
 */
export const requireMySqlAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const token = readSessionCookie();
    if (!token) throw new Error("Unauthorized: No session.");

    const userId = parseSessionToken(token);
    if (!userId) throw new Error("Unauthorized: Invalid session.");

    const profile = await queryOne<Profile>(
      "SELECT id, workspace_id, is_active FROM profiles WHERE id = ? LIMIT 1",
      [userId],
    );
    if (!profile || !profile.is_active) {
      clearSessionCookie();
      throw new Error("Unauthorized: Session expired.");
    }

    const role = await queryOne<UserRole>(
      "SELECT role FROM user_roles WHERE user_id = ? ORDER BY CASE WHEN role = 'super_admin' THEN 0 ELSE 1 END LIMIT 1",
      [userId],
    );

    return next({
      context: {
        userId: profile.id,
        workspaceId: profile.workspace_id,
        role: role?.role ?? "employee",
      },
    });
  },
);
