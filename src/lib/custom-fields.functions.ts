/**
 * BLUETORN CRM — Workspace Dynamic Custom Fields Server Functions
 *
 * Provides workspace-isolated dynamic custom fields for Leads and Customers.
 * Allows each workspace to define bespoke fields (Text, Number, Date, Select, Textarea)
 * with zero database schema alterations.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireMySqlAuth, assertPermission } from "./auth-server";
import { query, queryOne, execute, uuid } from "./db";

export type CustomFieldType = "text" | "number" | "date" | "select" | "textarea";
export type CustomFieldEntity = "lead" | "customer";

export interface WorkspaceCustomField {
  id: string;
  workspace_id: string;
  entity_type: CustomFieldEntity;
  field_key: string;
  field_label: string;
  field_type: CustomFieldType;
  options: string[] | null;
  is_required: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/* --------------------------------- List ----------------------------------- */

export const listWorkspaceCustomFieldsFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string; entityType?: CustomFieldEntity }) => input)
  .handler(async ({ data, context }): Promise<WorkspaceCustomField[]> => {
    const wsId =
      context.role === "super_admin"
        ? data.workspaceId || context.workspaceId
        : context.workspaceId;
    if (!wsId) throw new Error("Workspace is required.");

    const params: any[] = [wsId];
    let sql = `SELECT id, workspace_id, entity_type, field_key, field_label, field_type,
                      options, is_required, sort_order, created_at, updated_at
               FROM workspace_custom_fields
               WHERE workspace_id = ?`;

    if (data.entityType) {
      sql += ` AND entity_type = ?`;
      params.push(data.entityType);
    }

    sql += ` ORDER BY sort_order ASC, created_at ASC`;

    const rows = await query<any>(sql, params);
    return rows.map((r) => ({
      id: r.id,
      workspace_id: r.workspace_id,
      entity_type: r.entity_type,
      field_key: r.field_key,
      field_label: r.field_label,
      field_type: r.field_type,
      options: typeof r.options === "string" ? JSON.parse(r.options) : (r.options ?? null),
      is_required: Boolean(r.is_required),
      sort_order: Number(r.sort_order ?? 0),
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
  });

/* --------------------------------- Save ----------------------------------- */

export const saveWorkspaceCustomFieldFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator(
    (input: {
      workspaceId: string;
      fieldId?: string | null;
      entityType: CustomFieldEntity;
      fieldKey: string;
      fieldLabel: string;
      fieldType: CustomFieldType;
      options?: string[] | null;
      isRequired?: boolean;
      sortOrder?: number;
    }) => {
      if (!input.fieldLabel?.trim()) throw new Error("Field label is required.");
      if (!input.fieldKey?.trim()) throw new Error("Field key is required.");
      return input;
    },
  )
  .handler(async ({ data, context }): Promise<{ success: boolean; id: string }> => {
    const wsId =
      context.role === "super_admin"
        ? data.workspaceId || context.workspaceId
        : context.workspaceId;
    if (!wsId) throw new Error("Workspace is required.");

    await assertPermission(context, "manage.settings", wsId);

    // Normalize field key: lowercase alphanumeric and underscores only
    const normalizedKey = data.fieldKey
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 64);

    if (!normalizedKey) throw new Error("Invalid field key. Must contain alphanumeric characters.");

    const rawOptions =
      data.fieldType === "select" && Array.isArray(data.options)
        ? JSON.stringify(data.options.map((opt) => String(opt).trim()).filter(Boolean))
        : null;

    if (data.fieldId) {
      // Update existing field definition
      await execute(
        `UPDATE workspace_custom_fields
         SET field_label = ?, field_type = ?, options = ?, is_required = ?, sort_order = ?
         WHERE id = ? AND workspace_id = ?`,
        [
          data.fieldLabel.trim(),
          data.fieldType,
          rawOptions,
          data.isRequired ? 1 : 0,
          data.sortOrder ?? 0,
          data.fieldId,
          wsId,
        ],
      );
      return { success: true, id: data.fieldId };
    }

    // Check duplicate key
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM workspace_custom_fields WHERE workspace_id = ? AND entity_type = ? AND field_key = ?`,
      [wsId, data.entityType, normalizedKey],
    );
    if (existing) {
      throw new Error(`A custom field with key '${normalizedKey}' already exists for ${data.entityType}s.`);
    }

    const newId = uuid();
    await execute(
      `INSERT INTO workspace_custom_fields 
        (id, workspace_id, entity_type, field_key, field_label, field_type, options, is_required, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId,
        wsId,
        data.entityType,
        normalizedKey,
        data.fieldLabel.trim(),
        data.fieldType,
        rawOptions,
        data.isRequired ? 1 : 0,
        data.sortOrder ?? 0,
      ],
    );

    return { success: true, id: newId };
  });

/* -------------------------------- Delete ---------------------------------- */

export const deleteWorkspaceCustomFieldFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string; fieldId: string }) => input)
  .handler(async ({ data, context }): Promise<{ success: boolean }> => {
    const wsId =
      context.role === "super_admin"
        ? data.workspaceId || context.workspaceId
        : context.workspaceId;
    if (!wsId) throw new Error("Workspace is required.");

    await assertPermission(context, "manage.settings", wsId);

    await execute(
      `DELETE FROM workspace_custom_fields WHERE id = ? AND workspace_id = ?`,
      [data.fieldId, wsId],
    );

    return { success: true };
  });
