import { createServerFn } from "@tanstack/react-start";
import { requireMySqlAuth, assertNotViewingAs } from "./auth-server";
import { query, queryOne, execute } from "./db";
import { hashPassword } from "./server-utils";
import type { Workspace, Profile, UserRole } from "./db-types";

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

    // Only workspace Owner or Super Admin can edit workspace company profile
    const realRole = context.realRole || context.role;
    if (realRole !== "owner" && realRole !== "super_admin") {
      throw new Error("FORBIDDEN: Only workspace Owner can update workspace settings.");
    }
    if (realRole !== "super_admin" && context.workspaceId !== data.workspaceId) {
      throw new Error("FORBIDDEN: Cross-workspace update denied.");
    }

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

    const { transaction, uuid } = await import("./db");

    await transaction(async (conn) => {
      // 1. Delete existing permissions for this user
      await conn.execute("DELETE FROM user_permissions WHERE workspace_id = ? AND user_id = ?", [
        data.workspaceId,
        data.userId,
      ]);

      // 2. Insert new granted permissions
      for (const perm of data.permissions) {
        if (perm?.trim()) {
          await conn.execute(
            "INSERT INTO user_permissions (id, workspace_id, user_id, permission) VALUES (?, ?, ?, ?)",
            [uuid(), data.workspaceId, data.userId, perm.trim()],
          );
        }
      }

      // 3. Log audit event
      await conn.execute(
        `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuid(),
          data.workspaceId,
          context.realUserId || context.userId,
          realRole,
          "finance.permission_change",
          "user_permissions",
          data.userId,
          JSON.stringify({ permissions: data.permissions }),
        ],
      );
    });

    return { ok: true };
  });

export const getWorkspaceMembersFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string }) => input)
  .handler(async ({ data, context }): Promise<WorkspaceMemberItem[]> => {
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
    assertNotViewingAs(context, "Editing employee profile");

    const realRole = context.realRole || context.role;
    if (realRole !== "owner" && realRole !== "super_admin") {
      throw new Error("FORBIDDEN: Only workspace Owner can edit employees.");
    }

    const { queryOne, execute, uuid } = await import("./db");
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

    // Audit log
    await execute(
      `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata)
       VALUES (?, ?, ?, ?, 'employee.updated', 'profile', ?, ?)`,
      [
        uuid(),
        employee.workspace_id,
        context.realUserId || context.userId,
        realRole,
        employee.id,
        JSON.stringify({
          user_code: employee.user_code,
          before: {
            full_name: employee.full_name,
            email: employee.email,
            phone: employee.phone,
            job_title: employee.job_title,
          },
          after: {
            full_name: data.fullName.trim(),
            email: data.email?.trim() || null,
            phone: data.phone?.trim() || null,
            job_title: data.jobTitle?.trim() || null,
          },
        }),
      ],
    );

    return { ok: true };
  });
