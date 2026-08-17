import { createServerFn } from "@tanstack/react-start";
import { requireMySqlAuth } from "./auth.functions";
import { hashPassword, isSuperAdmin, canManageWorkspaceUsers } from "./server-utils";
import { query, queryOne, execute, uuid } from "./db";
import type { Profile, UserRole, Workspace } from "./db-types";
import {
  authIdentifierFor,
  canonicalUserCode,
  canonicalWorkspaceCode,
  isValidUserCode,
  isValidWorkspaceCode,
  PLATFORM_WORKSPACE_CODE,
} from "@/lib/auth-identity";

type BootstrapInput = {
  userCode: string;
  fullName: string;
  email: string;
  password: string;
};

type WorkspaceInput = {
  code: string;
  name: string;
  legalName?: string;
  industry?: string;
  plan?: string;
  status?: "active" | "trial" | "suspended" | "inactive";
  currency?: string;
  timezone?: string;
  contactEmail?: string;
  contactPhone?: string;
  seatLimit?: number;
  owner: {
    userCode: string;
    fullName: string;
    email?: string;
    phone?: string;
    password: string;
  };
};

type WorkspaceUserInput = {
  workspaceId: string;
  userCode: string;
  fullName: string;
  role: "owner" | "manager" | "employee";
  email?: string;
  phone?: string;
  jobTitle?: string;
  password: string;
};

/** Whether the platform already has a Super Admin. Safe to call signed out. */
export const getPlatformStatus = createServerFn({ method: "GET" }).handler(async () => {
  const row = await queryOne<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM user_roles WHERE role = 'super_admin'",
  );
  return { initialized: (row?.cnt ?? 0) > 0 };
});

/** One-time creation of the first platform Super Admin. Refuses once one exists. */
export const bootstrapPlatform = createServerFn({ method: "POST" })
  .validator((input: BootstrapInput) => {
    if (!isValidUserCode(input.userCode)) throw new Error("Invalid user ID.");
    if (!input.fullName?.trim()) throw new Error("Full name is required.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email ?? "")) throw new Error("A valid email is required.");
    if ((input.password ?? "").length < 10) throw new Error("Password must be at least 10 characters.");
    return input;
  })
  .handler(async ({ data }) => {
    const existing = await queryOne<{ cnt: number }>(
      "SELECT COUNT(*) as cnt FROM user_roles WHERE role = 'super_admin'",
    );
    if ((existing?.cnt ?? 0) > 0) throw new Error("Platform is already initialised.");

    const userCode = canonicalUserCode(data.userCode);
    const userId = uuid();
    const pwHash = await hashPassword(data.password);

    // Ensure platform workspace exists
    let platformWs = await queryOne<Workspace>(
      "SELECT * FROM workspaces WHERE code = ? LIMIT 1",
      [PLATFORM_WORKSPACE_CODE],
    );
    if (!platformWs) {
      const wsId = uuid();
      await execute(
        `INSERT INTO workspaces (id, code, name, industry, plan, status, currency, timezone, seat_limit)
         VALUES (?, ?, 'Bluetorn Platform', 'Platform', 'Scale', 'active', 'INR', 'Asia/Kolkata', 100)`,
        [wsId, PLATFORM_WORKSPACE_CODE],
      );
      platformWs = (await queryOne<Workspace>("SELECT * FROM workspaces WHERE id = ?", [wsId]))!;
    }

    await execute(
      `INSERT INTO profiles (id, workspace_id, user_code, full_name, email, password_hash, job_title)
       VALUES (?, ?, ?, ?, ?, ?, 'Platform Super Admin')`,
      [userId, platformWs.id, userCode, data.fullName.trim(), data.email.trim(), pwHash],
    );

    const roleId = uuid();
    await execute(
      "INSERT INTO user_roles (id, user_id, workspace_id, role) VALUES (?, ?, NULL, 'super_admin')",
      [roleId, userId],
    );

    await execute(
      `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id)
       VALUES (?, NULL, ?, ?, 'platform.bootstrap', 'profile', ?)`,
      [uuid(), userId, data.fullName.trim(), userId],
    );

    return { ok: true, workspaceCode: PLATFORM_WORKSPACE_CODE, userCode };
  });

/** Super Admin creates a client workspace together with its Owner account. */
export const adminCreateWorkspace = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: WorkspaceInput) => {
    if (!isValidWorkspaceCode(input.code)) throw new Error("Workspace code must be 3-31 letters, digits or dashes.");
    if (!input.name?.trim()) throw new Error("Company name is required.");
    if (!isValidUserCode(input.owner?.userCode ?? "")) throw new Error("Invalid owner user ID.");
    if (!input.owner?.fullName?.trim()) throw new Error("Owner name is required.");
    if ((input.owner?.password ?? "").length < 8) throw new Error("Owner password must be at least 8 characters.");
    return input;
  })
  .handler(async ({ data, context }) => {
    if (!(await isSuperAdmin(context.userId))) {
      throw new Error("Only platform Super Admins can create workspaces.");
    }

    const code = canonicalWorkspaceCode(data.code);

    // Check duplicate
    const existing = await queryOne<Workspace>("SELECT id FROM workspaces WHERE code = ? LIMIT 1", [code]);
    if (existing) throw new Error(`Workspace code ${code} is already in use.`);

    const wsId = uuid();
    await execute(
      `INSERT INTO workspaces (id, code, name, legal_name, industry, plan, status, currency, timezone, contact_email, contact_phone, seat_limit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        wsId, code, data.name.trim(), data.legalName?.trim() || null,
        data.industry?.trim() || "Real Estate", data.plan || "Starter",
        data.status || "trial", data.currency || "INR",
        data.timezone || "Asia/Kolkata", data.contactEmail?.trim() || null,
        data.contactPhone?.trim() || null, data.seatLimit ?? 10,
      ],
    );

    const ownerCode = canonicalUserCode(data.owner.userCode);
    const ownerId = uuid();
    const ownerPwHash = await hashPassword(data.owner.password);

    await execute(
      `INSERT INTO profiles (id, workspace_id, user_code, full_name, email, phone, password_hash, job_title)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Owner')`,
      [ownerId, wsId, ownerCode, data.owner.fullName.trim(), data.owner.email?.trim() || null, data.owner.phone?.trim() || null, ownerPwHash],
    );

    const roleId = uuid();
    await execute(
      "INSERT INTO user_roles (id, user_id, workspace_id, role) VALUES (?, ?, ?, 'owner')",
      [roleId, ownerId, wsId],
    );

    await execute(
      `INSERT INTO audit_logs (id, workspace_id, actor_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, ?, 'workspace.created', 'workspace', ?, ?)`,
      [uuid(), wsId, context.userId, wsId, JSON.stringify({ code, owner_user_code: ownerCode })],
    );

    return { workspaceId: wsId, code, ownerUserCode: ownerCode };
  });

/** Create a user inside a workspace. Super Admin, or an Owner/Manager of that workspace. */
export const createWorkspaceUser = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: WorkspaceUserInput) => {
    if (!input.workspaceId) throw new Error("Workspace is required.");
    if (!isValidUserCode(input.userCode)) throw new Error("User ID must be 2-31 lowercase letters, digits, dot, dash or underscore.");
    if (!input.fullName?.trim()) throw new Error("Full name is required.");
    if (!["owner", "manager", "employee"].includes(input.role)) throw new Error("Invalid role.");
    if ((input.password ?? "").length < 8) throw new Error("Password must be at least 8 characters.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const isAdmin = await isSuperAdmin(context.userId);
    const canManage = await canManageWorkspaceUsers(context.userId);
    const me = await queryOne<Profile>("SELECT workspace_id FROM profiles WHERE id = ?", [context.userId]);
    const sameWorkspace = me?.workspace_id === data.workspaceId;

    if (!isAdmin && !(sameWorkspace && canManage)) {
      throw new Error("You do not have permission to add users to this workspace.");
    }
    if (!isAdmin && data.role === "owner") {
      throw new Error("Only a platform Super Admin can assign the Owner role.");
    }

    const workspace = await queryOne<Workspace>(
      "SELECT id, code, seat_limit FROM workspaces WHERE id = ?",
      [data.workspaceId],
    );
    if (!workspace) throw new Error("Workspace not found.");

    const seatRow = await queryOne<{ cnt: number }>(
      "SELECT COUNT(*) as cnt FROM profiles WHERE workspace_id = ?",
      [workspace.id],
    );
    if ((seatRow?.cnt ?? 0) >= workspace.seat_limit) {
      throw new Error(`Seat limit reached (${workspace.seat_limit}). Ask Bluetorn to raise the plan limit.`);
    }

    const userCode = canonicalUserCode(data.userCode);

    // Check duplicate
    const dup = await queryOne<Profile>(
      "SELECT id FROM profiles WHERE workspace_id = ? AND user_code = ? LIMIT 1",
      [workspace.id, userCode],
    );
    if (dup) throw new Error(`User ID "${userCode}" already exists in this workspace.`);

    const userId = uuid();
    const pwHash = await hashPassword(data.password);

    await execute(
      `INSERT INTO profiles (id, workspace_id, user_code, full_name, email, phone, job_title, password_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, workspace.id, userCode, data.fullName.trim(), data.email?.trim() || null, data.phone?.trim() || null, data.jobTitle?.trim() || null, pwHash],
    );

    const roleId = uuid();
    await execute(
      "INSERT INTO user_roles (id, user_id, workspace_id, role) VALUES (?, ?, ?, ?)",
      [roleId, userId, workspace.id, data.role],
    );

    await execute(
      `INSERT INTO audit_logs (id, workspace_id, actor_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, ?, 'user.created', 'profile', ?, ?)`,
      [uuid(), workspace.id, context.userId, userId, JSON.stringify({ user_code: userCode, role: data.role })],
    );

    return { userId, userCode, workspaceCode: workspace.code };
  });

/** Activate/deactivate a workspace user. Super Admin, or Owner/Manager of that workspace. */
export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { userId: string; isActive: boolean }) => {
    if (!input.userId) throw new Error("User is required.");
    return input;
  })
  .handler(async ({ data, context }) => {
    if (data.userId === context.userId) throw new Error("You cannot deactivate your own account.");

    const isAdmin = await isSuperAdmin(context.userId);
    const canManage = await canManageWorkspaceUsers(context.userId);
    const me = await queryOne<Profile>("SELECT workspace_id FROM profiles WHERE id = ?", [context.userId]);

    const target = await queryOne<Profile>("SELECT id, workspace_id FROM profiles WHERE id = ?", [data.userId]);
    if (!target) throw new Error("User not found.");

    if (!isAdmin && !(canManage && me?.workspace_id && me.workspace_id === target.workspace_id)) {
      throw new Error("You do not have permission to change this user.");
    }

    await execute("UPDATE profiles SET is_active = ? WHERE id = ?", [data.isActive ? 1 : 0, data.userId]);

    await execute(
      `INSERT INTO audit_logs (id, workspace_id, actor_id, action, entity_type, entity_id)
       VALUES (?, ?, ?, ?, 'profile', ?)`,
      [uuid(), target.workspace_id, context.userId, data.isActive ? "user.activated" : "user.deactivated", data.userId],
    );

    return { ok: true };
  });

/** Set a user's password. Super Admin, or Owner/Manager of that workspace. */
export const setUserPassword = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { userId: string; password: string }) => {
    if (!input.userId) throw new Error("User is required.");
    if ((input.password ?? "").length < 8) throw new Error("Password must be at least 8 characters.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const isAdmin = await isSuperAdmin(context.userId);
    const canManage = await canManageWorkspaceUsers(context.userId);
    const me = await queryOne<Profile>("SELECT workspace_id FROM profiles WHERE id = ?", [context.userId]);

    const target = await queryOne<Profile>("SELECT id, workspace_id FROM profiles WHERE id = ?", [data.userId]);
    if (!target) throw new Error("User not found.");

    if (!isAdmin && !(canManage && me?.workspace_id && me.workspace_id === target.workspace_id)) {
      throw new Error("You do not have permission to reset this password.");
    }

    const pwHash = await hashPassword(data.password);
    await execute("UPDATE profiles SET password_hash = ? WHERE id = ?", [pwHash, data.userId]);

    await execute(
      `INSERT INTO audit_logs (id, workspace_id, actor_id, action, entity_type, entity_id)
       VALUES (?, ?, ?, 'user.password_reset', 'profile', ?)`,
      [uuid(), target.workspace_id, context.userId, data.userId],
    );

    return { ok: true };
  });

/** Update workspace details. Super Admin only. */
export const adminUpdateWorkspace = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string; patch: Record<string, unknown> }) => {
    if (!input.workspaceId) throw new Error("Workspace is required.");
    return input;
  })
  .handler(async ({ data, context }) => {
    if (!(await isSuperAdmin(context.userId))) {
      throw new Error("Only platform Super Admins can update workspaces.");
    }
    const allowed = ["name", "legal_name", "industry", "plan", "status", "currency", "timezone", "contact_email", "contact_phone", "address", "seat_limit"];
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [key, val] of Object.entries(data.patch)) {
      if (allowed.includes(key)) {
        sets.push(`\`${key}\` = ?`);
        vals.push(val);
      }
    }
    if (sets.length > 0) {
      vals.push(data.workspaceId);
      await execute(`UPDATE workspaces SET ${sets.join(", ")} WHERE id = ?`, vals);
    }
    return { ok: true };
  });
