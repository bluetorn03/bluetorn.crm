/**
 * BLUETORN CRM — MySQL-backed authentication server functions.
 *
 * Uses bcrypt for password hashing and HMAC-SHA256 signed session cookies.
 *
 * Production MUST set SESSION_SECRET env variable (min 32 chars).
 * In development a process-stable random key is generated (tokens do not
 * survive server restarts — log out and back in after restart).
 */
import { createServerFn } from "@tanstack/react-start";
import bcrypt from "bcryptjs";
import { query, queryOne, execute, uuid } from "./db";
import {
  canonicalWorkspaceCode,
  canonicalUserCode,
  PLATFORM_WORKSPACE_CODE,
} from "./auth-identity";
import type { Profile, UserRole, Workspace } from "./db-types";
import {
  createSessionToken,
  parseSessionToken,
  setSessionCookie,
  clearSessionCookie,
  readSessionCookie,
} from "./auth-server";

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
      workspace = await queryOne<Workspace>("SELECT * FROM workspaces WHERE code = ? LIMIT 1", [
        wsCode,
      ]);
      if (!workspace) {
        throw new Error("Invalid workspace code, user ID or password.");
      }
      if (!["active", "trial"].includes(workspace.status)) {
        throw new Error("WORKSPACE_INACTIVE");
      }
    } else {
      workspace = await queryOne<Workspace>("SELECT * FROM workspaces WHERE code = ? LIMIT 1", [
        PLATFORM_WORKSPACE_CODE,
      ]);
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
    const token = await createSessionToken(profile.id);
    await setSessionCookie(token);

    // 7. Update last_login_at
    await execute("UPDATE profiles SET last_login_at = NOW() WHERE id = ?", [profile.id]);

    return {
      ok: true,
      isSuperAdmin: role.role === "super_admin",
      role: role.role,
    };
  });

/** Logout: clear session cookie. */
export const logoutAction = createServerFn({ method: "POST" }).handler(async () => {
  await clearSessionCookie();
  return { ok: true };
});

/** Get current session data from cookie. */
export const getSessionAction = createServerFn({ method: "GET" }).handler(async () => {
  const token = await readSessionCookie();
  if (!token) return { authenticated: false as const };

  const userId = await parseSessionToken(token);
  if (!userId) return { authenticated: false as const };

  const profile = await queryOne<Profile>("SELECT * FROM profiles WHERE id = ? LIMIT 1", [userId]);
  if (!profile || !profile.is_active) {
    await clearSessionCookie();
    return { authenticated: false as const };
  }

  const role = await queryOne<UserRole>(
    "SELECT * FROM user_roles WHERE user_id = ? ORDER BY CASE WHEN role = 'super_admin' THEN 0 ELSE 1 END LIMIT 1",
    [profile.id],
  );
  if (!role) {
    await clearSessionCookie();
    return { authenticated: false as const };
  }

  // Load workspace
  let workspace: Workspace | null = null;
  if (profile.workspace_id) {
    workspace = await queryOne<Workspace>("SELECT * FROM workspaces WHERE id = ? LIMIT 1", [
      profile.workspace_id,
    ]);
  }

  // Load permissions for current user in their workspace
  const userPermRows = profile.workspace_id
    ? await query<{ permission: string }>(
        "SELECT permission FROM user_permissions WHERE workspace_id = ? AND user_id = ?",
        [profile.workspace_id, profile.id],
      )
    : [];
  const permissions = userPermRows.map((r) => r.permission);

  // Load all workspaces for super admin
  let allWorkspaces: Workspace[] = [];
  if (role.role === "super_admin") {
    allWorkspaces = await query<Workspace>("SELECT * FROM workspaces ORDER BY name");
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
    permissions,
    workspaces: allWorkspaces.map((w) => ({
      id: w.id,
      code: w.code,
      name: w.name,
      legalName: w.legal_name,
      industry: w.industry,
      plan: w.plan,
      status: w.status,
      currency: w.currency,
      timezone: w.timezone,
      dateFormat: w.date_format,
      timeFormat: w.time_format,
      logoUrl: w.logo_url,
      contactEmail: w.contact_email,
      contactPhone: w.contact_phone,
      address: w.address,
      gstin: w.gstin ?? null,
      pan: w.pan ?? null,
      state: w.state ?? null,
      stateCode: w.state_code ?? null,
      website: w.website ?? null,
      bankName: w.bank_name ?? null,
      bankAccountNo: w.bank_account_no ?? null,
      bankAccountName: w.bank_account_name ?? null,
      bankIfsc: w.bank_ifsc ?? null,
      invoicePrefix: w.invoice_prefix ?? "INV",
      defaultPaymentTermsDays: w.default_payment_terms_days ?? 14,
      defaultInvoiceNotes: w.default_invoice_notes ?? null,
      defaultInvoiceTerms: w.default_invoice_terms ?? null,
      seatLimit: w.seat_limit,
    })),
    primaryWorkspaceId: profile.workspace_id,
  };
});


