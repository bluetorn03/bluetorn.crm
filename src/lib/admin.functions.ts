import { createServerFn } from "@tanstack/react-start";
import { requireMySqlAuth, assertNotViewingAs, assertPermission } from "./auth-server";
import { hashPassword, isSuperAdmin, canManageWorkspaceUsers } from "./server-utils";
import { query, queryOne, execute, transaction, uuid } from "./db";
import { recordAuditEvent } from "./audit-logger";
import type { Profile, UserRole, Workspace } from "./db-types";
import {
  authIdentifierFor,
  canonicalUserCode,
  canonicalWorkspaceCode,
  isValidUserCode,
  isValidWorkspaceCode,
  PLATFORM_WORKSPACE_CODE,
} from "@/lib/auth-identity";
import { ensureDefaultLeadOptionsInternal } from "./crm.functions";

type BootstrapInput = {
  userCode: string;
  fullName: string;
  email: string;
  password: string;
};

type WorkspaceInput = {
  code: string;
  name: string;
  legalName?: string | null | undefined;
  industry?: string | null | undefined;
  plan?: string | undefined;
  status?: ("active" | "trial" | "suspended" | "inactive") | undefined;
  currency?: string | undefined;
  timezone?: string | undefined;
  contactEmail?: string | null | undefined;
  contactPhone?: string | null | undefined;
  seatLimit?: number | undefined;
  logoUrl?: string | null | undefined;
  owner: {
    userCode: string;
    fullName: string;
    email?: string | null | undefined;
    phone?: string | null | undefined;
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
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email ?? ""))
      throw new Error("A valid email is required.");
    if ((input.password ?? "").length < 10)
      throw new Error("Password must be at least 10 characters.");
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
    let platformWs = await queryOne<Workspace>("SELECT * FROM workspaces WHERE code = ? LIMIT 1", [
      PLATFORM_WORKSPACE_CODE,
    ]);
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

    // Seed default lead options for platform workspace
    await ensureDefaultLeadOptionsInternal(platformWs.id, userId);

    return { ok: true, workspaceCode: PLATFORM_WORKSPACE_CODE, userCode };
  });

/** Super Admin creates a client workspace together with its Owner account. */
export const adminCreateWorkspace = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: WorkspaceInput) => {
    if (!isValidWorkspaceCode(input.code))
      throw new Error("Workspace code must be 3-31 letters, digits or dashes.");
    if (!input.name?.trim()) throw new Error("Company name is required.");
    if (!isValidUserCode(input.owner?.userCode ?? "")) throw new Error("Invalid owner user ID.");
    if (!input.owner?.fullName?.trim()) throw new Error("Owner name is required.");
    if ((input.owner?.password ?? "").length < 8)
      throw new Error("Owner password must be at least 8 characters.");
    return input;
  })
  .handler(async ({ data, context }) => {
    if (!(await isSuperAdmin(context.userId))) {
      throw new Error("Only platform Super Admins can create workspaces.");
    }

    const code = canonicalWorkspaceCode(data.code);

    // Check duplicate
    const existing = await queryOne<Workspace>("SELECT id FROM workspaces WHERE code = ? LIMIT 1", [
      code,
    ]);
    if (existing) throw new Error(`Workspace code ${code} is already in use.`);

    const wsId = uuid();
    await execute(
      `INSERT INTO workspaces (id, code, name, legal_name, industry, plan, status, currency, timezone, contact_email, contact_phone, seat_limit, chat_retention_days, logo_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        wsId,
        code,
        data.name.trim(),
        data.legalName?.trim() || null,
        data.industry?.trim() || "Real Estate",
        data.plan || "Starter",
        data.status || "trial",
        data.currency || "INR",
        data.timezone || "Asia/Kolkata",
        data.contactEmail?.trim() || null,
        data.contactPhone?.trim() || null,
        data.seatLimit ?? 10,
        15,
        data.logoUrl?.trim() || null,
      ],
    );

    const ownerCode = canonicalUserCode(data.owner.userCode);
    const ownerId = uuid();
    const ownerPwHash = await hashPassword(data.owner.password);

    await execute(
      `INSERT INTO profiles (id, workspace_id, user_code, full_name, email, phone, password_hash, job_title)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Owner')`,
      [
        ownerId,
        wsId,
        ownerCode,
        data.owner.fullName.trim(),
        data.owner.email?.trim() || null,
        data.owner.phone?.trim() || null,
        ownerPwHash,
      ],
    );

    const roleId = uuid();
    await execute(
      "INSERT INTO user_roles (id, user_id, workspace_id, role) VALUES (?, ?, ?, 'owner')",
      [roleId, ownerId, wsId],
    );

    await execute(
      `INSERT INTO audit_logs (id, workspace_id, actor_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, ?, 'workspace.created', 'workspace', ?, ?)`,
      [
        uuid(),
        wsId,
        context.userId,
        wsId,
        JSON.stringify({
          code,
          owner_user_code: ownerCode,
          name: data.name.trim(),
          logo_url: data.logoUrl?.trim() || null,
        }),
      ],
    );

    // Seed default lead options automatically for new workspace
    await ensureDefaultLeadOptionsInternal(wsId, context.userId);

    return { workspaceId: wsId, code, ownerUserCode: ownerCode };
  });

/** Create a user inside a workspace. Owner (or platform Super Admin). */
export const createWorkspaceUser = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: WorkspaceUserInput) => {
    if (!isValidUserCode(input.userCode))
      throw new Error("User ID must be 2-31 lowercase letters, digits, dot, dash or underscore.");
    if (!input.fullName?.trim()) throw new Error("Full name is required.");
    if (!["manager", "employee"].includes(input.role)) {
      throw new Error("Invalid role. Role must be Employee or Manager.");
    }
    if (input.email?.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim())) {
      throw new Error("Invalid email format.");
    }
    if ((input.password ?? "").length < 8)
      throw new Error("Password must be at least 8 characters.");
    return input;
  })
  .handler(async ({ data, context }) => {
    assertNotViewingAs(context, "Adding team member");

    const realRole = context.realRole || context.role;
    const realUserId = context.realUserId || context.userId;
    const isAdmin = realRole === "super_admin" || (await isSuperAdmin(realUserId));
    const isOwner = realRole === "owner";

    if (!isAdmin && !isOwner) {
      await assertPermission(context, "manage.team");
    }

    // Role escalation prevention
    if (!isAdmin && (data.role as string) === "owner") {
      throw new Error("FORBIDDEN: Only a platform Super Admin can assign the Owner role.");
    }
    if (!isAdmin && !isOwner && data.role !== "employee") {
      throw new Error("FORBIDDEN: You can only assign the Employee role.");
    }

    // Workspace ID: ALWAYS take from authenticated session for workspace owners
    const targetWorkspaceId = isAdmin ? (data.workspaceId || context.workspaceId) : context.workspaceId;
    if (!targetWorkspaceId) throw new Error("Workspace is required.");

    const userCode = canonicalUserCode(data.userCode);
    const userId = uuid();
    const pwHash = await hashPassword(data.password);
    const roleId = uuid();

    const result = await transaction(async (conn) => {
      // Row-level lock on workspace to prevent concurrent creation exceeding seat limit
      const [wsRows] = await conn.execute<any[]>(
        "SELECT id, code, seat_limit FROM workspaces WHERE id = ? FOR UPDATE",
        [targetWorkspaceId],
      );
      const ws = wsRows[0];
      if (!ws) throw new Error("Workspace not found.");

      const [seatRows] = await conn.execute<any[]>(
        "SELECT COUNT(*) as cnt FROM profiles WHERE workspace_id = ? AND is_active = 1",
        [ws.id],
      );
      const activeCount = Number(seatRows[0]?.cnt ?? 0);
      if (activeCount >= ws.seat_limit) {
        throw new Error(
          `Seat limit reached (${ws.seat_limit}). Ask Bluetorn to raise the plan limit.`,
        );
      }

      // Check duplicate user_code in this workspace
      const [dupRows] = await conn.execute<any[]>(
        "SELECT id FROM profiles WHERE workspace_id = ? AND user_code = ? LIMIT 1",
        [ws.id, userCode],
      );
      if (dupRows.length > 0) throw new Error(`User ID "${userCode}" already exists in this workspace.`);

      await conn.execute(
        `INSERT INTO profiles (id, workspace_id, user_code, full_name, email, phone, job_title, password_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          ws.id,
          userCode,
          data.fullName.trim(),
          data.email?.trim() || null,
          data.phone?.trim() || null,
          data.jobTitle?.trim() || null,
          pwHash,
        ],
      );

      await conn.execute("INSERT INTO user_roles (id, user_id, workspace_id, role) VALUES (?, ?, ?, ?)", [
        roleId,
        userId,
        ws.id,
        data.role,
      ]);

      return {
        workspaceId: ws.id,
        workspaceCode: ws.code,
        seatLimit: ws.seat_limit,
        activeCount: activeCount + 1,
      };
    });

    await recordAuditEvent({
      action: "user.created",
      status: "success",
      workspaceId: result.workspaceId,
      actorId: realUserId,
      actorLabel: realRole,
      entityType: "profile",
      entityId: userId,
      summary: `User "${data.fullName.trim()}" (${userCode}) added with role "${data.role}"`,
      metadata: {
        user_code: userCode,
        role: data.role,
        full_name: data.fullName.trim(),
        seats_used: result.activeCount,
        seat_limit: result.seatLimit,
      },
    });

    return { userId, userCode, workspaceCode: result.workspaceCode };
  });

/** Activate/deactivate a workspace user. Super Admin, or Owner of that workspace. */
export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { userId: string; isActive: boolean }) => {
    if (!input.userId) throw new Error("User is required.");
    return input;
  })
  .handler(async ({ data, context }) => {
    assertNotViewingAs(context, "Changing user status");

    const realRole = context.realRole || context.role;
    const realUserId = context.realUserId || context.userId;

    if (data.userId === realUserId) throw new Error("You cannot deactivate your own account.");

    const isAdmin = realRole === "super_admin" || (await isSuperAdmin(realUserId));
    const isOwner = realRole === "owner";

    const target = await queryOne<Profile>(
      "SELECT id, workspace_id, user_code, full_name, is_active FROM profiles WHERE id = ?",
      [data.userId],
    );
    if (!target) throw new Error("User not found.");

    if (!isAdmin && !isOwner) {
      await assertPermission(context, "manage.team", target.workspace_id ?? undefined);
    } else if (!isAdmin && context.workspaceId !== target.workspace_id) {
      throw new Error("FORBIDDEN: Cross-workspace access denied.");
    }

    // Cannot deactivate an owner unless super_admin
    const targetRole = await queryOne<UserRole>("SELECT role FROM user_roles WHERE user_id = ?", [
      target.id,
    ]);
    if (!isAdmin && targetRole?.role === "owner") {
      throw new Error("FORBIDDEN: Workspace Owner accounts cannot be deactivated here.");
    }

    // If reactivating an inactive user, verify workspace seat limit atomically with row lock
    if (data.isActive && !target.is_active && target.workspace_id) {
      await transaction(async (conn) => {
        const [wsRows] = await conn.execute<any[]>(
          "SELECT id, seat_limit FROM workspaces WHERE id = ? FOR UPDATE",
          [target.workspace_id],
        );
        const ws = wsRows[0];
        if (ws) {
          const [cntRows] = await conn.execute<any[]>(
            "SELECT COUNT(*) as cnt FROM profiles WHERE workspace_id = ? AND is_active = 1",
            [target.workspace_id],
          );
          const activeCount = Number(cntRows[0]?.cnt ?? 0);
          if (activeCount >= ws.seat_limit) {
            throw new Error(
              `Seat limit reached (${ws.seat_limit}). Cannot reactivate user. Ask Bluetorn to raise the plan limit.`,
            );
          }
        }
        await conn.execute("UPDATE profiles SET is_active = 1 WHERE id = ?", [data.userId]);
      });
    } else {
      await execute("UPDATE profiles SET is_active = ? WHERE id = ?", [
        data.isActive ? 1 : 0,
        data.userId,
      ]);
    }

    await recordAuditEvent({
      action: data.isActive ? "user.reactivated" : "user.deactivated",
      status: "success",
      workspaceId: target.workspace_id,
      actorId: realUserId,
      actorLabel: realRole,
      entityType: "profile",
      entityId: data.userId,
      summary: `User "${target.full_name || target.user_code}" (${target.user_code}) ${data.isActive ? "reactivated" : "deactivated"}`,
      metadata: {
        user_code: target.user_code,
        is_active: data.isActive,
      },
    });

    return { ok: true };
  });

/** Set a user's password. Super Admin, or Owner of that workspace. */
export const setUserPassword = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { userId: string; password: string }) => {
    if (!input.userId) throw new Error("User is required.");
    if ((input.password ?? "").length < 8)
      throw new Error("Password must be at least 8 characters.");
    return input;
  })
  .handler(async ({ data, context }) => {
    assertNotViewingAs(context, "Resetting password");

    const realRole = context.realRole || context.role;
    const realUserId = context.realUserId || context.userId;
    const isAdmin = realRole === "super_admin" || (await isSuperAdmin(realUserId));
    const isOwner = realRole === "owner";

    const target = await queryOne<Profile>(
      "SELECT id, workspace_id, user_code, full_name FROM profiles WHERE id = ?",
      [data.userId],
    );
    if (!target) throw new Error("User not found.");

    if (!isAdmin && !isOwner) {
      await assertPermission(context, "manage.team", target.workspace_id ?? undefined);
    } else if (!isAdmin && context.workspaceId !== target.workspace_id) {
      throw new Error("FORBIDDEN: Cross-workspace access denied.");
    }

    // Target cannot be an Owner unless caller is super_admin
    const targetRole = await queryOne<UserRole>("SELECT role FROM user_roles WHERE user_id = ?", [
      target.id,
    ]);
    if (!isAdmin && targetRole?.role === "owner") {
      throw new Error("FORBIDDEN: Owner password should be changed via My Account.");
    }

    const pwHash = await hashPassword(data.password);
    await execute("UPDATE profiles SET password_hash = ? WHERE id = ?", [pwHash, data.userId]);

    await recordAuditEvent({
      action: "user.password_reset",
      status: "success",
      workspaceId: target.workspace_id,
      actorId: realUserId,
      actorLabel: realRole,
      entityType: "profile",
      entityId: data.userId,
      summary: `Password reset for user "${target.full_name || target.user_code}" (${target.user_code})`,
      metadata: { target_user_id: data.userId, user_code: target.user_code },
    });

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
    const allowed = [
      "name",
      "legal_name",
      "industry",
      "plan",
      "status",
      "currency",
      "timezone",
      "contact_email",
      "contact_phone",
      "address",
      "seat_limit",
    ];
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

/** Super Admin updates workspace seat limit with server-side validation and audit logging. */
export const adminUpdateSeatLimit = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string; seatLimit: number }) => {
    if (!input.workspaceId) throw new Error("Workspace is required.");
    const limit = Number(input.seatLimit);
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error("Seat limit must be a positive whole number.");
    }
    return { workspaceId: input.workspaceId, seatLimit: limit };
  })
  .handler(async ({ data, context }) => {
    const realRole = context.realRole || context.role;
    const realUserId = context.realUserId || context.userId;
    const isAdmin = realRole === "super_admin" || (await isSuperAdmin(realUserId));
    if (!isAdmin) {
      throw new Error("FORBIDDEN: Only platform Super Admins can modify workspace seat limits.");
    }

    return await transaction(async (conn) => {
      const [wsRows] = await conn.execute<any[]>(
        "SELECT id, name, code, seat_limit FROM workspaces WHERE id = ? FOR UPDATE",
        [data.workspaceId],
      );
      const ws = wsRows[0];
      if (!ws) throw new Error("Workspace not found.");

      const [activeRows] = await conn.execute<any[]>(
        "SELECT COUNT(*) as cnt FROM profiles WHERE workspace_id = ? AND is_active = 1",
        [data.workspaceId],
      );
      const activeCount = Number(activeRows[0]?.cnt ?? 0);
      const oldLimit = Number(ws.seat_limit);

      if (data.seatLimit < activeCount) {
        throw new Error(
          `Cannot reduce seat limit to ${data.seatLimit}. Workspace currently has ${activeCount} active users.`,
        );
      }

      await conn.execute("UPDATE workspaces SET seat_limit = ? WHERE id = ?", [
        data.seatLimit,
        data.workspaceId,
      ]);

      await recordAuditEvent({
        action: "workspace.seat_limit_changed",
        status: "success",
        workspaceId: data.workspaceId,
        actorId: realUserId,
        actorLabel: "Super Admin",
        entityType: "workspace",
        entityId: data.workspaceId,
        summary: `Seat limit changed from ${oldLimit} to ${data.seatLimit} for ${ws.name} (${ws.code})`,
        before: { seat_limit: oldLimit, active_users: activeCount },
        after: { seat_limit: data.seatLimit, active_users: activeCount },
        metadata: {
          workspace_code: ws.code,
          active_users: activeCount,
        },
      });

      return {
        ok: true,
        workspaceId: data.workspaceId,
        seatLimit: data.seatLimit,
        activeUsers: activeCount,
      };
    });
  });
