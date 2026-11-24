/**
 * BLUETORN CRM — Bulk Import, Export & Duplicate Protection Server Functions
 *
 * Implements batch duplicate validation, workspace isolation,
 * role-aware reassignment, and bulk CSV ingestion.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireMySqlAuth, assertPermission } from "./auth-server";
import { query, execute, transaction, uuid } from "./db";
import { normalizePhoneForTel } from "./communication";

export interface DuplicateCheckItem {
  tempId: string;
  phone?: string | null;
  email?: string | null;
}

export interface ExistingContactMatch {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  assignedToId: string | null;
  assignedToName: string | null;
  assignedToRole: string | null;
}

export interface DuplicateCheckResult {
  matches: Record<string, ExistingContactMatch>;
}

/* ----------------------------- Duplicate Batch Check ----------------------- */

export const checkDuplicatesBatchFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator(
    (input: {
      workspaceId: string;
      entityType: "lead" | "customer";
      items: DuplicateCheckItem[];
    }) => input,
  )
  .handler(async ({ data, context }): Promise<DuplicateCheckResult> => {
    const wsId =
      context.role === "super_admin"
        ? data.workspaceId || context.workspaceId
        : context.workspaceId;
    if (!wsId) throw new Error("Workspace is required.");

    const items = data.items || [];
    if (items.length === 0) return { matches: {} };

    // Extract valid phones and emails
    const phoneMap = new Map<string, string[]>(); // normalizedPhone -> tempIds
    const emailMap = new Map<string, string[]>(); // lowercaseEmail -> tempIds

    for (const item of items) {
      if (item.phone) {
        const norm = normalizePhoneForTel(item.phone).replace(/^\+/, "").slice(-10); // Match last 10 digits
        if (norm.length >= 7) {
          const arr = phoneMap.get(norm) || [];
          arr.push(item.tempId);
          phoneMap.set(norm, arr);
        }
      }
      if (item.email && item.email.includes("@")) {
        const normEmail = item.email.trim().toLowerCase();
        const arr = emailMap.get(normEmail) || [];
        arr.push(item.tempId);
        emailMap.set(normEmail, arr);
      }
    }

    const matches: Record<string, ExistingContactMatch> = {};
    const table = data.entityType === "lead" ? "leads" : "customers";

    // Query active records with assigned profile info
    const existingRows = await query<any>(
      `SELECT t.id, t.name, t.phone, t.email, t.assigned_to,
              p.full_name as assigned_name, r.role as assigned_role
       FROM ${table} t
       LEFT JOIN profiles p ON t.assigned_to = p.id
       LEFT JOIN user_roles r ON p.id = r.user_id AND r.workspace_id = t.workspace_id
       WHERE t.workspace_id = ?`,
      [wsId],
    );

    for (const row of existingRows) {
      let matchedTempIds: string[] = [];

      if (row.phone) {
        const rowNorm = normalizePhoneForTel(row.phone).replace(/^\+/, "").slice(-10);
        if (rowNorm.length >= 7 && phoneMap.has(rowNorm)) {
          matchedTempIds.push(...(phoneMap.get(rowNorm) || []));
        }
      }

      if (row.email) {
        const rowEmail = row.email.trim().toLowerCase();
        if (emailMap.has(rowEmail)) {
          matchedTempIds.push(...(emailMap.get(rowEmail) || []));
        }
      }

      for (const tempId of matchedTempIds) {
        if (!matches[tempId]) {
          matches[tempId] = {
            id: row.id,
            name: row.name,
            phone: row.phone,
            email: row.email,
            assignedToId: row.assigned_to,
            assignedToName: row.assigned_name || "Unassigned",
            assignedToRole: row.assigned_role || null,
          };
        }
      }
    }

    return { matches };
  });

/* ----------------------------- Bulk Import Leads --------------------------- */

export interface ImportLeadItem {
  name: string;
  phone?: string | null;
  email?: string | null;
  source?: string | null;
  budget?: number | null;
  requirement?: string | null;
  notes?: string | null;
  assignedTo?: string | null;
  customFields?: Record<string, any> | null;
}

export const bulkImportLeadsFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string; leads: ImportLeadItem[] }) => input)
  .handler(async ({ data, context }): Promise<{ importedCount: number; errors: string[] }> => {
    const wsId =
      context.role === "super_admin"
        ? data.workspaceId || context.workspaceId
        : context.workspaceId;
    if (!wsId) throw new Error("Workspace is required.");

    await assertPermission(context, "create.lead", wsId);

    const leads = data.leads || [];
    if (leads.length === 0) return { importedCount: 0, errors: [] };

    let importedCount = 0;
    const errors: string[] = [];

    await transaction(async (conn) => {
      let rowIndex = 0;
      for (const item of leads) {
        rowIndex++;
        if (!item.name?.trim()) {
          errors.push(`Row ${rowIndex}: Name is required.`);
          continue;
        }

        const newId = uuid();
        const customJson = item.customFields ? JSON.stringify(item.customFields) : null;
        const assigned = item.assignedTo || context.userId;

        await conn.execute(
          `INSERT INTO leads 
            (id, workspace_id, name, phone, email, source, budget, requirement, notes, custom_fields, assigned_to, assigned_at, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
          [
            newId,
            wsId,
            item.name.trim(),
            item.phone?.trim() || null,
            item.email?.trim() || null,
            item.source?.trim() || "CSV Import",
            item.budget ? Number(item.budget) : 0,
            item.requirement?.trim() || null,
            item.notes?.trim() || null,
            customJson,
            assigned,
            context.userId,
          ],
        );

        // Activity log
        await conn.execute(
          `INSERT INTO lead_activities (id, workspace_id, lead_id, type, note, actor_id, actor_label)
           VALUES (?, ?, ?, 'Import', 'Lead imported via CSV batch', ?, ?)`,
          [uuid(), wsId, newId, context.userId, context.role],
        );

        importedCount++;
      }
    });

    return { importedCount, errors };
  });

/* --------------------------- Bulk Import Customers ------------------------- */

export interface ImportCustomerItem {
  name: string;
  phone?: string | null;
  email?: string | null;
  type?: string | null;
  status?: string | null;
  city?: string | null;
  value?: number | null;
  notes?: string | null;
  assignedTo?: string | null;
  customFields?: Record<string, any> | null;
}

export const bulkImportCustomersFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string; customers: ImportCustomerItem[] }) => input)
  .handler(async ({ data, context }): Promise<{ importedCount: number; errors: string[] }> => {
    const wsId =
      context.role === "super_admin"
        ? data.workspaceId || context.workspaceId
        : context.workspaceId;
    if (!wsId) throw new Error("Workspace is required.");

    await assertPermission(context, "create.customer", wsId);

    const customers = data.customers || [];
    if (customers.length === 0) return { importedCount: 0, errors: [] };

    let importedCount = 0;
    const errors: string[] = [];

    await transaction(async (conn) => {
      let rowIndex = 0;
      for (const item of customers) {
        rowIndex++;
        if (!item.name?.trim()) {
          errors.push(`Row ${rowIndex}: Name is required.`);
          continue;
        }

        const newId = uuid();
        const customJson = item.customFields ? JSON.stringify(item.customFields) : null;
        const assigned = item.assignedTo || context.userId;

        await conn.execute(
          `INSERT INTO customers 
            (id, workspace_id, name, phone, email, type, status, city, value, notes, custom_fields, assigned_to, assigned_at, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
          [
            newId,
            wsId,
            item.name.trim(),
            item.phone?.trim() || null,
            item.email?.trim() || null,
            item.type?.trim() || "Buyer",
            item.status?.trim() || "Prospect",
            item.city?.trim() || null,
            item.value ? Number(item.value) : 0,
            item.notes?.trim() || null,
            customJson,
            assigned,
            context.userId,
          ],
        );

        importedCount++;
      }
    });

    return { importedCount, errors };
  });

/* -------------------------- Reassign Existing Contact --------------------- */

export const reassignContactFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator(
    (input: {
      workspaceId: string;
      entityType: "lead" | "customer";
      entityId: string;
      targetUserId: string;
    }) => input,
  )
  .handler(async ({ data, context }): Promise<{ success: boolean }> => {
    const wsId =
      context.role === "super_admin"
        ? data.workspaceId || context.workspaceId
        : context.workspaceId;
    if (!wsId) throw new Error("Workspace is required.");

    // Reassignment requires manager or owner permission
    await assertPermission(context, "manage.team", wsId);

    const table = data.entityType === "lead" ? "leads" : "customers";
    await execute(
      `UPDATE ${table} 
       SET assigned_to = ?, assigned_at = NOW() 
       WHERE id = ? AND workspace_id = ?`,
      [data.targetUserId, data.entityId, wsId],
    );

    if (data.entityType === "lead") {
      await execute(
        `INSERT INTO lead_activities (id, workspace_id, lead_id, type, note, actor_id, actor_label)
         VALUES (?, ?, ?, 'Assignment', 'Lead reassigned to new member', ?, ?)`,
        [uuid(), wsId, data.entityId, context.userId, context.role],
      );
    }

    return { success: true };
  });
