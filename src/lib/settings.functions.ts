import { createServerFn } from "@tanstack/react-start";
import { requireMySqlAuth } from "./auth.functions";
import { query, queryOne, execute } from "./db";
import { hashPassword } from "./server-utils";
import type { Workspace, Profile, UserRole } from "./db-types";

export type WorkspaceSettingsData = {
  name: string;
  legal_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
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
      "SELECT name, legal_name, contact_email, contact_phone, address FROM workspaces WHERE id = ? LIMIT 1",
      [data.workspaceId],
    );
    if (!ws) return null;
    return {
      name: ws.name,
      legal_name: ws.legal_name,
      contact_email: ws.contact_email,
      contact_phone: ws.contact_phone,
      address: ws.address,
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
      };
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const p = data.patch;
    await execute(
      "UPDATE workspaces SET name = ?, legal_name = ?, contact_email = ?, contact_phone = ?, address = ? WHERE id = ?",
      [
        p.name.trim(),
        p.legalName?.trim() || null,
        p.contactEmail?.trim() || null,
        p.contactPhone?.trim() || null,
        p.address?.trim() || null,
        data.workspaceId,
      ],
    );
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
