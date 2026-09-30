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
  createViewAsToken,
  parseViewAsToken,
  setViewAsCookie,
  clearViewAsCookie,
  readViewAsCookie,
  requireMySqlAuth,
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

/** Logout: clear session cookie and any active view-as cookie. */
export const logoutAction = createServerFn({ method: "POST" }).handler(async () => {
  await clearViewAsCookie();
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
    await clearViewAsCookie();
    return { authenticated: false as const };
  }

  const role = await queryOne<UserRole>(
    "SELECT * FROM user_roles WHERE user_id = ? ORDER BY CASE WHEN role = 'super_admin' THEN 0 ELSE 1 END LIMIT 1",
    [profile.id],
  );
  if (!role) {
    await clearSessionCookie();
    await clearViewAsCookie();
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

  // Check if view-as preview context is active for Owner / Super Admin
  const viewAsToken = await readViewAsCookie();
  let isViewingAs = false;
  let viewAsUser: Profile | null = null;
  let viewAsRole: string | null = null;
  let viewAsPermissions: string[] = [];

  if (viewAsToken && (role.role === "owner" || role.role === "super_admin")) {
    const parsed = await parseViewAsToken(viewAsToken);
    if (parsed && parsed.ownerUserId === profile.id) {
      const empProfile = await queryOne<Profile>(
        "SELECT * FROM profiles WHERE id = ? LIMIT 1",
        [parsed.employeeId],
      );
      if (
        empProfile &&
        (role.role === "super_admin" || empProfile.workspace_id === profile.workspace_id)
      ) {
        const empRole = await queryOne<UserRole>(
          "SELECT role FROM user_roles WHERE user_id = ? LIMIT 1",
          [parsed.employeeId],
        );
        if (empRole?.role !== "owner" && empRole?.role !== "super_admin") {
          isViewingAs = true;
          viewAsUser = empProfile;
          viewAsRole = empRole?.role ?? "employee";

          const empPermRows = profile.workspace_id
            ? await query<{ permission: string }>(
                "SELECT permission FROM user_permissions WHERE workspace_id = ? AND user_id = ?",
                [profile.workspace_id, empProfile.id],
              )
            : [];
          viewAsPermissions = empPermRows.map((r) => r.permission);
        } else {
          await clearViewAsCookie();
        }
      } else {
        await clearViewAsCookie();
      }
    } else {
      await clearViewAsCookie();
    }
  }

  const effectiveUser = isViewingAs && viewAsUser ? viewAsUser : profile;
  const effectiveRole =
    isViewingAs && viewAsRole
      ? (viewAsRole as "super_admin" | "owner" | "manager" | "employee")
      : role.role;
  const effectivePermissions = isViewingAs ? viewAsPermissions : permissions;

  return {
    authenticated: true as const,
    user: {
      id: effectiveUser.id,
      userCode: effectiveUser.user_code,
      name: effectiveUser.full_name,
      email: effectiveUser.email ?? "",
      phone: effectiveUser.phone ?? "",
      whatsappPhone: (effectiveUser as any).whatsapp_phone ?? "",
      jobTitle: effectiveUser.job_title ?? "",
      avatarUrl: effectiveUser.avatar_url,
      isActive: Boolean(effectiveUser.is_active),
    },
    role: effectiveRole,
    permissions: effectivePermissions,
    isViewingAs,
    viewAs:
      isViewingAs && viewAsUser
        ? {
            originalUserId: profile.id,
            originalUserName: profile.full_name,
            employeeId: viewAsUser.id,
            employeeName: viewAsUser.full_name,
            employeeUserCode: viewAsUser.user_code,
          }
        : null,
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

/** Start viewing as an employee (Owner/Super Admin only) */
export const startViewAsEmployeeFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { employeeId: string }) => {
    if (!input.employeeId) throw new Error("Employee ID is required.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const realRole = context.realRole || context.role;
    if (realRole !== "owner" && realRole !== "super_admin") {
      throw new Error("FORBIDDEN: Only workspace Owner can preview employee dashboards.");
    }
    const realUserId = context.realUserId || context.userId;

    const employee = await queryOne<Profile>(
      "SELECT id, workspace_id, user_code, full_name, is_active FROM profiles WHERE id = ? LIMIT 1",
      [data.employeeId],
    );
    if (!employee) throw new Error("Employee not found.");

    if (realRole !== "super_admin" && employee.workspace_id !== context.workspaceId) {
      throw new Error("FORBIDDEN: Employee does not belong to your workspace.");
    }

    const empRole = await queryOne<UserRole>(
      "SELECT role FROM user_roles WHERE user_id = ? LIMIT 1",
      [employee.id],
    );
    if (empRole?.role === "owner" || empRole?.role === "super_admin") {
      throw new Error("FORBIDDEN: Cannot preview Owner or Super Admin accounts.");
    }

    const token = await createViewAsToken(realUserId, employee.id, employee.workspace_id ?? "");
    await setViewAsCookie(token);

    // Audit log
    await execute(
      `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata)
       VALUES (?, ?, ?, ?, 'VIEW_EMPLOYEE_DASHBOARD', 'profile', ?, ?)`,
      [
        uuid(),
        employee.workspace_id,
        realUserId,
        realRole,
        employee.id,
        JSON.stringify({ user_code: employee.user_code, full_name: employee.full_name }),
      ],
    );

    return { ok: true, employeeName: employee.full_name };
  });

/** Exit viewing as an employee and return to Owner session */
export const exitViewAsEmployeeFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .handler(async ({ context }) => {
    const realUserId = context.realUserId || context.userId;
    const employeeId = context.isViewingAs ? context.userId : null;

    await clearViewAsCookie();

    // Audit log
    await execute(
      `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id)
       VALUES (?, ?, ?, ?, 'EXIT_EMPLOYEE_DASHBOARD_VIEW', 'profile', ?)`,
      [
        uuid(),
        context.workspaceId,
        realUserId,
        context.realRole || context.role,
        employeeId,
      ],
    );

    return { ok: true };
  });


