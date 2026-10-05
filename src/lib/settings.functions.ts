import { createServerFn } from "@tanstack/react-start";
import { requireMySqlAuth, assertNotViewingAs, assertPermission } from "./auth-server";
import { query, queryOne, execute, uuid } from "./db";
import { hashPassword } from "./server-utils";
import { recordAuditEvent } from "./audit-logger";
import type { Workspace, Profile, UserRole } from "./db-types";

export type WorkspaceSeatSummary = {
  seatLimit: number;
  seatsUsed: number;
  seatsAvailable: number;
  totalMembers: number;
  inactiveMembers: number;
};

export const getWorkspaceSeatSummaryFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string }) => input)
  .handler(async ({ data, context }): Promise<WorkspaceSeatSummary> => {
    const wsId = context.role === "super_admin" ? (data.workspaceId || context.workspaceId) : context.workspaceId;
    if (!wsId) throw new Error("Workspace is required.");
    await assertPermission(context, "manage.team", wsId);

    const workspace = await queryOne<Workspace>(
      "SELECT id, seat_limit FROM workspaces WHERE id = ?",
      [wsId],
    );
    if (!workspace) throw new Error("Workspace not found.");

    const seatLimit = workspace.seat_limit || 10;

    const [activeRow, totalRow] = await Promise.all([
      queryOne<{ c: number }>("SELECT COUNT(*) as c FROM profiles WHERE workspace_id = ? AND is_active = 1", [wsId]),
      queryOne<{ c: number }>("SELECT COUNT(*) as c FROM profiles WHERE workspace_id = ?", [wsId]),
    ]);

    const seatsUsed = activeRow?.c ?? 0;
    const totalMembers = totalRow?.c ?? 0;
    const seatsAvailable = Math.max(0, seatLimit - seatsUsed);
    const inactiveMembers = Math.max(0, totalMembers - seatsUsed);

    return {
      seatLimit,
      seatsUsed,
      seatsAvailable,
      totalMembers,
      inactiveMembers,
    };
  });

export type WorkspaceSettingsData = {
  name: string;
  legal_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  logo_url: string | null;
  gstin: string | null;
  pan: string | null;
  state: string | null;
  state_code: string | null;
  website: string | null;
  bank_name: string | null;
  bank_account_no: string | null;
  bank_account_name: string | null;
  bank_ifsc: string | null;
  invoice_prefix: string;
  default_payment_terms_days: number;
  default_invoice_notes: string | null;
  default_invoice_terms: string | null;
  chat_retention_days?: number;
  audit_retention_days?: number;
};

export type WorkspaceMemberItem = {
  id: string;
  user_code: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  is_active: boolean;
  last_login_at: string | null;
  role: string | null;
};

export const getWorkspaceSettingsFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string }) => input)
  .handler(async ({ data, context }): Promise<WorkspaceSettingsData | null> => {
    await assertPermission(context, "manage.settings", data.workspaceId);
    const ws = await queryOne<Workspace>(
      `SELECT name, legal_name, contact_email, contact_phone, address, logo_url,
              gstin, pan, state, state_code, website, bank_name, bank_account_no, bank_account_name, bank_ifsc,
              invoice_prefix, default_payment_terms_days, default_invoice_notes, default_invoice_terms, chat_retention_days,
              audit_retention_days
       FROM workspaces WHERE id = ? LIMIT 1`,
      [data.workspaceId],
    );
    if (!ws) return null;
    return {
      name: ws.name,
      legal_name: ws.legal_name,
      contact_email: ws.contact_email,
      contact_phone: ws.contact_phone,
      address: ws.address,
      logo_url: ws.logo_url,
      gstin: (ws as any).gstin ?? null,
      pan: (ws as any).pan ?? null,
      state: (ws as any).state ?? null,
      state_code: (ws as any).state_code ?? null,
      website: (ws as any).website ?? null,
      bank_name: (ws as any).bank_name ?? null,
      bank_account_no: (ws as any).bank_account_no ?? null,
      bank_account_name: (ws as any).bank_account_name ?? null,
      bank_ifsc: (ws as any).bank_ifsc ?? null,
      invoice_prefix: (ws as any).invoice_prefix ?? "INV",
      default_payment_terms_days: Number((ws as any).default_payment_terms_days ?? 14),
      default_invoice_notes: (ws as any).default_invoice_notes ?? null,
      default_invoice_terms: (ws as any).default_invoice_terms ?? null,
      chat_retention_days: Number(ws.chat_retention_days ?? 15),
      audit_retention_days: Number((ws as any).audit_retention_days ?? 180),
    };
  });

export const updateWorkspaceSettingsFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator(
    (input: {
      workspaceId: string;
      patch: {
        name: string;
        legalName?: string | null;
        contactEmail?: string | null;
        contactPhone?: string | null;
        address?: string | null;
        logoUrl?: string | null;
        gstin?: string | null;
        pan?: string | null;
        state?: string | null;
        stateCode?: string | null;
        website?: string | null;
        bankName?: string | null;
        bankAccountNo?: string | null;
        bankAccountName?: string | null;
        bankIfsc?: string | null;
        invoicePrefix?: string;
        defaultPaymentTermsDays?: number;
        defaultInvoiceNotes?: string | null;
        defaultInvoiceTerms?: string | null;
        auditRetentionDays?: number;
      };
    }) => input,
  )
  .handler(async ({ data, context }) => {
    assertNotViewingAs(context, "Updating workspace settings");
    await assertPermission(context, "manage.settings", data.workspaceId);

    const p = data.patch;
    const auditRetention = p.auditRetentionDays !== undefined ? Number(p.auditRetentionDays) : 180;
    const allowedAuditDays = [90, 180, 365, 730];
    if (!allowedAuditDays.includes(auditRetention)) {
      throw new Error("Invalid audit retention policy. Allowed values: 90, 180, 365, or 730 days.");
    }

    await execute(
      `UPDATE workspaces SET 
        name = ?, legal_name = ?, contact_email = ?, contact_phone = ?, address = ?, logo_url = ?,
        gstin = ?, pan = ?, state = ?, state_code = ?, website = ?, bank_name = ?,
        bank_account_no = ?, bank_account_name = ?, bank_ifsc = ?, invoice_prefix = ?,
        default_payment_terms_days = ?, default_invoice_notes = ?, default_invoice_terms = ?,
        audit_retention_days = ?
       WHERE id = ?`,
      [
        p.name.trim(),
        p.legalName?.trim() || null,
        p.contactEmail?.trim() || null,
        p.contactPhone?.trim() || null,
        p.address?.trim() || null,
        p.logoUrl?.trim() || null,
        p.gstin?.trim() || null,
        p.pan?.trim() || null,
        p.state?.trim() || null,
        p.stateCode?.trim() || null,
        p.website?.trim() || null,
        p.bankName?.trim() || null,
        p.bankAccountNo?.trim() || null,
        p.bankAccountName?.trim() || null,
        p.bankIfsc?.trim() || null,
        p.invoicePrefix?.trim() || "INV",
        p.defaultPaymentTermsDays ?? 14,
        p.defaultInvoiceNotes?.trim() || null,
        p.defaultInvoiceTerms?.trim() || null,
        auditRetention,
        data.workspaceId,
      ],
    );

    // Audit log
    await execute(
      `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'success')`,
      [
        (await import("./db")).uuid(),
        data.workspaceId,
        context.userId,
        context.role,
        "workspace.profile_update",
        "workspace",
        data.workspaceId,
        JSON.stringify({ name: p.name, gstin: p.gstin, auditRetentionDays: auditRetention }),
      ],
    );

    return { ok: true };
  });

export const getUserPermissionsFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string; userId: string }) => input)
  .handler(async ({ data, context }): Promise<string[]> => {
    if (context.role !== "owner" && context.role !== "super_admin" && context.userId !== data.userId) {
      throw new Error("FORBIDDEN: Permission denied.");
    }
    const rows = await query<{ permission: string }>(
      "SELECT permission FROM user_permissions WHERE workspace_id = ? AND user_id = ?",
      [data.workspaceId, data.userId],
    );
    return rows.map((r) => r.permission);
  });

export const setUserPermissionsFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string; userId: string; permissions: string[] }) => input)
  .handler(async ({ data, context }) => {
    assertNotViewingAs(context, "Configuring employee permissions");

    // Only Owner or Super Admin can manage employee permissions
    const realRole = context.realRole || context.role;
    if (realRole !== "owner" && realRole !== "super_admin") {
      throw new Error("FORBIDDEN: Only workspace Owner can configure employee permissions.");
    }
    if (realRole !== "super_admin" && context.workspaceId !== data.workspaceId) {
      throw new Error("FORBIDDEN: Cross-workspace permission update denied.");
    }
    if (context.userId === data.userId && realRole !== "super_admin") {
      throw new Error("FORBIDDEN: You cannot alter your own permissions.");
    }

    const { transaction, uuid } = await import("./db");

    let grantedList: string[] = [];
    let revokedList: string[] = [];

    await transaction(async (conn) => {
      // 1. Fetch current permissions for meaningful diff
      const [existingRows] = await conn.execute(
        "SELECT permission FROM user_permissions WHERE workspace_id = ? AND user_id = ?",
        [data.workspaceId, data.userId],
      );
      const oldPerms = (existingRows as { permission: string }[]).map((r) => r.permission);
      const newPerms = data.permissions.filter(Boolean).map((p) => p.trim());
      grantedList = newPerms.filter((p) => !oldPerms.includes(p));
      revokedList = oldPerms.filter((p) => !newPerms.includes(p));

      // 2. Delete existing permissions for this user
      await conn.execute("DELETE FROM user_permissions WHERE workspace_id = ? AND user_id = ?", [
        data.workspaceId,
        data.userId,
      ]);

      // 3. Insert new granted permissions
      for (const perm of newPerms) {
        await conn.execute(
          "INSERT INTO user_permissions (id, workspace_id, user_id, permission) VALUES (?, ?, ?, ?)",
          [uuid(), data.workspaceId, data.userId, perm],
        );
      }
    });

    // 4. Log audit event
    await recordAuditEvent({
      action: "user.permission_change",
      status: "success",
      workspaceId: data.workspaceId,
      actorId: context.realUserId || context.userId,
      actorLabel: realRole,
      entityType: "user_permissions",
      entityId: data.userId,
      summary: `User permissions updated (${grantedList.length} granted, ${revokedList.length} revoked)`,
      metadata: {
        target_user_id: data.userId,
        granted: grantedList,
        revoked: revokedList,
        total_permissions: data.permissions.length,
      },
    });

    // 5. Notify the employee of access update
    if (grantedList.length > 0 || revokedList.length > 0) {
      const grantedFormatted = grantedList.map((p) => p.replace(/_/g, " ").replace(/\./g, " → ")).join(", ");
      const revokedFormatted = revokedList.map((p) => `${p.replace(/_/g, " ").replace(/\./g, " → ")} removed`).join(", ");
      const messageParts = [
        grantedList.length > 0 ? `Granted: ${grantedFormatted}` : null,
        revokedList.length > 0 ? `Revoked: ${revokedFormatted}` : null,
      ].filter(Boolean);

      try {
        const notifId = uuid();
        await execute(
          `INSERT INTO notifications (id, workspace_id, user_id, type, title, message, entity_type, entity_id, created_by, created_at)
           VALUES (?, ?, ?, 'permission_updated', 'Your access was updated', ?, 'user_permissions', ?, ?, UTC_TIMESTAMP())`,
          [
            notifId,
            data.workspaceId,
            data.userId,
            messageParts.join(" · "),
            data.userId,
            "Workspace Owner",
          ],
        );
      } catch (err: any) {
        console.warn("[Notifications] Failed to notify employee of permission update:", err?.message);
      }
    }

    return { ok: true };
  });

export const getWorkspaceMembersFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string }) => input)
  .handler(async ({ data, context }): Promise<WorkspaceMemberItem[]> => {
    await assertPermission(context, "manage.team", data.workspaceId);
    const [profiles, roles] = await Promise.all([
      query<Profile>(
        "SELECT id, user_code, full_name, email, phone, job_title, is_active, last_login_at FROM profiles WHERE workspace_id = ? ORDER BY created_at ASC",
        [data.workspaceId],
      ),
      query<UserRole>("SELECT user_id, role FROM user_roles WHERE workspace_id = ?", [
        data.workspaceId,
      ]),
    ]);

    const roleMap = new Map(roles.map((r) => [r.user_id, r.role]));
    return profiles.map((p) => ({
      id: p.id,
      user_code: p.user_code,
      full_name: p.full_name,
      email: p.email,
      phone: p.phone,
      job_title: p.job_title,
      is_active: Boolean(p.is_active),
      last_login_at: p.last_login_at ? String(p.last_login_at) : null,
      role: roleMap.get(p.id) ?? null,
    }));
  });

export const updateSelfProfileFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator(
    (input: {
      fullName: string;
      email?: string | null;
      phone?: string | null;
      whatsappPhone?: string | null;
      jobTitle?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const existing = await queryOne<Profile>(
      "SELECT id, full_name, email, phone, whatsapp_phone, job_title FROM profiles WHERE id = ?",
      [context.userId],
    );

    await execute(
      "UPDATE profiles SET full_name = ?, email = ?, phone = ?, whatsapp_phone = ?, job_title = ? WHERE id = ?",
      [
        data.fullName.trim(),
        data.email?.trim() || null,
        data.phone?.trim() || null,
        data.whatsappPhone?.trim() || null,
        data.jobTitle?.trim() || null,
        context.userId,
      ],
    );

    const updated = await queryOne<Profile>(
      "SELECT id, full_name, email, phone, whatsapp_phone, job_title FROM profiles WHERE id = ?",
      [context.userId],
    );

    await recordAuditEvent({
      action: "user.profile_update",
      status: "success",
      workspaceId: context.workspaceId,
      actorId: context.userId,
      actorLabel: context.role,
      entityType: "profile",
      entityId: context.userId,
      summary: `User "${data.fullName.trim()}" updated their account profile`,
      before: existing,
      after: updated,
      metadata: {
        full_name: data.fullName.trim(),
        email: data.email?.trim() || null,
      },
    });

    return { ok: true };
  });

export const changeSelfPasswordFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { password: string }) => {
    if ((input.password ?? "").length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const pwHash = await hashPassword(data.password);
    await execute("UPDATE profiles SET password_hash = ? WHERE id = ?", [pwHash, context.userId]);

    await recordAuditEvent({
      action: "user.password_change",
      status: "success",
      workspaceId: context.workspaceId,
      actorId: context.userId,
      actorLabel: context.role,
      entityType: "profile",
      entityId: context.userId,
      summary: "User updated their account password",
      metadata: { target_user_id: context.userId },
    });

    return { ok: true };
  });

/**
 * Edit an employee's profile. Owner-only, scoped strictly to the current workspace.
 * Editable: fullName, email, phone, jobTitle.
 */
export const updateWorkspaceEmployeeFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator(
    (input: {
      userId: string;
      fullName: string;
      email?: string | null;
      phone?: string | null;
      jobTitle?: string | null;
    }) => {
      if (!input.userId) throw new Error("Employee ID is required.");
      if (!input.fullName?.trim()) throw new Error("Full name is required.");
      if (input.email?.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim())) {
        throw new Error("Invalid email format.");
      }
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context, "manage.team");
    const realRole = context.realRole || context.role;

    const { queryOne, execute } = await import("./db");
    const employee = await queryOne<Profile>(
      "SELECT id, workspace_id, user_code, full_name, email, phone, job_title FROM profiles WHERE id = ? LIMIT 1",
      [data.userId],
    );
    if (!employee) throw new Error("Employee not found.");

    if (realRole !== "super_admin" && employee.workspace_id !== context.workspaceId) {
      throw new Error("FORBIDDEN: Cross-workspace access denied.");
    }

    // Role cannot be owner (Owners edit their own profile in My Account)
    const empRole = await queryOne<UserRole>(
      "SELECT role FROM user_roles WHERE user_id = ? LIMIT 1",
      [employee.id],
    );
    if (empRole?.role === "owner" && realRole !== "super_admin") {
      throw new Error("FORBIDDEN: Owner profile should be updated via My Account.");
    }

    await execute(
      "UPDATE profiles SET full_name = ?, email = ?, phone = ?, job_title = ? WHERE id = ? AND workspace_id = ?",
      [
        data.fullName.trim(),
        data.email?.trim() || null,
        data.phone?.trim() || null,
        data.jobTitle?.trim() || null,
        employee.id,
        employee.workspace_id,
      ],
    );

    const updated = await queryOne<Profile>(
      "SELECT id, workspace_id, user_code, full_name, email, phone, job_title FROM profiles WHERE id = ? LIMIT 1",
      [data.userId],
    );

    // Audit log
    await recordAuditEvent({
      action: "employee.updated",
      status: "success",
      workspaceId: employee.workspace_id,
      actorId: context.realUserId || context.userId,
      actorLabel: realRole,
      entityType: "profile",
      entityId: employee.id,
      summary: `Employee profile "${employee.full_name}" (${employee.user_code}) updated`,
      before: employee,
      after: updated,
      metadata: {
        user_code: employee.user_code,
      },
    });

    return { ok: true };
  });
