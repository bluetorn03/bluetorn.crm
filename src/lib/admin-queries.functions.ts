import { createServerFn } from "@tanstack/react-start";
import { requireMySqlAuth } from "./auth.functions";
import { isSuperAdmin } from "./server-utils";
import { query, queryOne } from "./db";
import type { Workspace, Profile, UserRole, AuditLog } from "./db-types";

export type AdminWorkspaceRow = {
  id: string;
  code: string;
  name: string;
  industry: string;
  plan: string;
  status: string;
  currency: string;
  timezone: string;
  seatLimit: number;
  seatsUsed: number;
  contactEmail: string | null;
  contactPhone: string | null;
  legalName: string | null;
  createdAt: string;
};

export type AdminUserRow = {
  id: string;
  userCode: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  workspaceId: string | null;
  workspaceCode: string;
  workspaceName: string;
  role: "super_admin" | "owner" | "manager" | "employee" | null;
};

async function assertSuperAdmin(userId: string) {
  if (!(await isSuperAdmin(userId))) throw new Error("Platform Super Admin access required.");
}

/** All tenant workspaces with live seat usage. Super Admin only. */
export const adminListWorkspaces = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .handler(async ({ context }): Promise<AdminWorkspaceRow[]> => {
    await assertSuperAdmin(context.userId);

    const workspaces = await query<Workspace>(
      "SELECT * FROM workspaces ORDER BY created_at DESC",
    );

    const seatRows = await query<{ workspace_id: string; cnt: number }>(
      "SELECT workspace_id, COUNT(*) as cnt FROM profiles WHERE workspace_id IS NOT NULL GROUP BY workspace_id",
    );
    const seats = new Map(seatRows.map((r) => [r.workspace_id, r.cnt]));

    return workspaces.map((w) => ({
      id: w.id,
      code: w.code,
      name: w.name,
      industry: w.industry,
      plan: w.plan,
      status: w.status,
      currency: w.currency,
      timezone: w.timezone,
      seatLimit: w.seat_limit,
      seatsUsed: seats.get(w.id) ?? 0,
      contactEmail: w.contact_email,
      contactPhone: w.contact_phone,
      legalName: w.legal_name,
      createdAt: w.created_at,
    }));
  });

/** Platform-wide counters for the admin dashboard. Super Admin only. */
export const adminPlatformStats = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.userId);

    const [wsRow, activeWsRow, usersRow, activeUsersRow, audits] = await Promise.all([
      queryOne<{ cnt: number }>("SELECT COUNT(*) as cnt FROM workspaces"),
      queryOne<{ cnt: number }>("SELECT COUNT(*) as cnt FROM workspaces WHERE status = 'active'"),
      queryOne<{ cnt: number }>("SELECT COUNT(*) as cnt FROM profiles"),
      queryOne<{ cnt: number }>("SELECT COUNT(*) as cnt FROM profiles WHERE is_active = 1"),
      query<AuditLog>(
        "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 8",
      ),
    ]);

    return {
      workspaces: wsRow?.cnt ?? 0,
      activeWorkspaces: activeWsRow?.cnt ?? 0,
      users: usersRow?.cnt ?? 0,
      activeUsers: activeUsersRow?.cnt ?? 0,
      recentActivity: audits.map((a) => ({
        id: a.id,
        action: a.action,
        entityType: a.entity_type,
        actorLabel: a.actor_label,
        createdAt: a.created_at,
      })),
    };
  });

/** Users across the platform, or inside a single workspace. Super Admin only. */
export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId?: string } | undefined) => input ?? {})
  .handler(async ({ data, context }): Promise<AdminUserRow[]> => {
    await assertSuperAdmin(context.userId);

    let profiles: Profile[];
    if (data.workspaceId) {
      profiles = await query<Profile>(
        "SELECT * FROM profiles WHERE workspace_id = ? ORDER BY created_at DESC",
        [data.workspaceId],
      );
    } else {
      profiles = await query<Profile>(
        "SELECT * FROM profiles ORDER BY created_at DESC",
      );
    }

    const roles = await query<UserRole>("SELECT * FROM user_roles");
    const workspaces = await query<Workspace>("SELECT id, code, name FROM workspaces");

    const roleMap = new Map(roles.map((r) => [r.user_id, r.role]));
    const wsMap = new Map(workspaces.map((w) => [w.id, w]));

    return profiles.map((p) => {
      const ws = p.workspace_id ? wsMap.get(p.workspace_id) : undefined;
      return {
        id: p.id,
        userCode: p.user_code,
        fullName: p.full_name,
        email: p.email,
        phone: p.phone,
        jobTitle: p.job_title,
        isActive: !!p.is_active,
        lastLoginAt: p.last_login_at,
        createdAt: p.created_at,
        workspaceId: p.workspace_id,
        workspaceCode: ws?.code ?? "BLUETORN",
        workspaceName: ws?.name ?? "Platform",
        role: roleMap.get(p.id) ?? null,
      };
    });
  });

/** A single workspace with its members. Super Admin only. */
export const adminGetWorkspace = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string }) => {
    if (!input?.workspaceId) throw new Error("Workspace is required.");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);

    const workspace = await queryOne<Workspace>(
      "SELECT * FROM workspaces WHERE id = ?",
      [data.workspaceId],
    );
    if (!workspace) throw new Error("Workspace not found.");

    const [profiles, roles, audits] = await Promise.all([
      query<Profile>(
        "SELECT * FROM profiles WHERE workspace_id = ? ORDER BY created_at",
        [workspace.id],
      ),
      query<UserRole>(
        "SELECT * FROM user_roles WHERE workspace_id = ?",
        [workspace.id],
      ),
      query<AuditLog>(
        "SELECT * FROM audit_logs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 10",
        [workspace.id],
      ),
    ]);

    const roleMap = new Map(roles.map((r) => [r.user_id, r.role]));

    return {
      workspace: {
        id: workspace.id,
        code: workspace.code,
        name: workspace.name,
        legalName: workspace.legal_name,
        industry: workspace.industry,
        plan: workspace.plan,
        status: workspace.status,
        currency: workspace.currency,
        timezone: workspace.timezone,
        seatLimit: workspace.seat_limit,
        contactEmail: workspace.contact_email,
        contactPhone: workspace.contact_phone,
        address: workspace.address,
        createdAt: workspace.created_at,
      },
      members: profiles.map((p) => ({
        id: p.id,
        userCode: p.user_code,
        fullName: p.full_name,
        email: p.email,
        phone: p.phone,
        jobTitle: p.job_title,
        isActive: !!p.is_active,
        lastLoginAt: p.last_login_at,
        createdAt: p.created_at,
        role: roleMap.get(p.id) ?? null,
      })),
      activity: audits.map((a) => ({
        id: a.id,
        action: a.action,
        entityType: a.entity_type,
        actorLabel: a.actor_label,
        createdAt: a.created_at,
      })),
    };
  });
