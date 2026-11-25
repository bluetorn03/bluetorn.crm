/**
 * BLUETORN CRM — Workspace Dynamic Custom Fields & System Fields Server Functions
 *
 * Provides workspace-isolated dynamic fields management for Leads, Customers, and Properties.
 * Enables workspaces to customize default fields (labels, placeholders, dropdown choices, show/hide)
 * and create bespoke custom columns with zero schema modifications and zero data loss.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireMySqlAuth, assertPermission } from "./auth-server";
import { query, queryOne, execute, uuid } from "./db";

export type CustomFieldType = "text" | "number" | "date" | "select" | "textarea";
export type CustomFieldEntity = "lead" | "customer" | "property";

export interface WorkspaceCustomField {
  id: string;
  workspace_id: string;
  entity_type: CustomFieldEntity;
  field_key: string;
  field_label: string;
  placeholder: string | null;
  field_type: CustomFieldType;
  options: string[] | null;
  is_required: boolean;
  is_unique: boolean;
  is_system: boolean;
  is_visible: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/* ----------------------- Built-in Default System Fields -------------------- */

export const DEFAULT_SYSTEM_FIELDS: Record<
  CustomFieldEntity,
  Array<Omit<WorkspaceCustomField, "id" | "workspace_id" | "created_at" | "updated_at">>
> = {
  lead: [
    {
      entity_type: "lead",
      field_key: "name",
      field_label: "Full Name",
      placeholder: "Full name",
      field_type: "text",
      options: null,
      is_required: true,
      is_unique: false,
      is_system: true,
      is_visible: true,
      sort_order: 10,
    },
    {
      entity_type: "lead",
      field_key: "phone",
      field_label: "Phone Number",
      placeholder: "+91 98200 00000",
      field_type: "text",
      options: null,
      is_required: false,
      is_unique: true,
      is_system: true,
      is_visible: true,
      sort_order: 20,
    },
    {
      entity_type: "lead",
      field_key: "email",
      field_label: "Email Address",
      placeholder: "name@example.com",
      field_type: "text",
      options: null,
      is_required: false,
      is_unique: false,
      is_system: true,
      is_visible: true,
      sort_order: 30,
    },
    {
      entity_type: "lead",
      field_key: "source",
      field_label: "Lead Source",
      placeholder: "Select source",
      field_type: "select",
      options: [
        "Meta Ads",
        "Google Ads",
        "Website Forms",
        "Landing Pages",
        "WhatsApp",
        "Instagram Ads",
        "Manual Entry",
        "Referral",
      ],
      is_required: true,
      is_unique: false,
      is_system: true,
      is_visible: true,
      sort_order: 40,
    },
    {
      entity_type: "lead",
      field_key: "budget",
      field_label: "Budget",
      placeholder: "e.g. 50,00,000",
      field_type: "number",
      options: null,
      is_required: false,
      is_unique: false,
      is_system: true,
      is_visible: true,
      sort_order: 50,
    },
    {
      entity_type: "lead",
      field_key: "requirement",
      field_label: "Requirement",
      placeholder: "e.g. 3 BHK, sea facing, Bandra",
      field_type: "text",
      options: null,
      is_required: false,
      is_unique: false,
      is_system: true,
      is_visible: true,
      sort_order: 60,
    },
    {
      entity_type: "lead",
      field_key: "location",
      field_label: "Location",
      placeholder: "Select location",
      field_type: "select",
      options: null,
      is_required: false,
      is_unique: false,
      is_system: true,
      is_visible: true,
      sort_order: 70,
    },
    {
      entity_type: "lead",
      field_key: "purpose",
      field_label: "Purpose",
      placeholder: "Select purpose",
      field_type: "select",
      options: ["End-use", "Investment", "Rental"],
      is_required: false,
      is_unique: false,
      is_system: true,
      is_visible: true,
      sort_order: 80,
    },
    {
      entity_type: "lead",
      field_key: "possession_timeline",
      field_label: "Possession Timeline",
      placeholder: "Select possession",
      field_type: "select",
      options: ["Ready to Move", "Under Construction", "1-2 Years", "3+ Years"],
      is_required: false,
      is_unique: false,
      is_system: true,
      is_visible: true,
      sort_order: 90,
    },
    {
      entity_type: "lead",
      field_key: "transaction_timeline",
      field_label: "Transaction Timeline",
      placeholder: "Select timeline",
      field_type: "select",
      options: ["Immediate", "Within 15 days", "1 Month", "3 Months"],
      is_required: false,
      is_unique: false,
      is_system: true,
      is_visible: true,
      sort_order: 100,
    },
    {
      entity_type: "lead",
      field_key: "phase",
      field_label: "Project Phase",
      placeholder: "Select phase",
      field_type: "select",
      options: null,
      is_required: false,
      is_unique: false,
      is_system: true,
      is_visible: true,
      sort_order: 110,
    },
    {
      entity_type: "lead",
      field_key: "assigned_to",
      field_label: "Assigned Employee",
      placeholder: "Select agent",
      field_type: "select",
      options: null,
      is_required: false,
      is_unique: false,
      is_system: true,
      is_visible: true,
      sort_order: 120,
    },
    {
      entity_type: "lead",
      field_key: "notes",
      field_label: "Notes",
      placeholder: "Client conversation notes...",
      field_type: "textarea",
      options: null,
      is_required: false,
      is_unique: false,
      is_system: true,
      is_visible: true,
      sort_order: 130,
    },
  ],
  customer: [
    {
      entity_type: "customer",
      field_key: "name",
      field_label: "Full Name",
      placeholder: "Full name",
      field_type: "text",
      options: null,
      is_required: true,
      is_unique: false,
      is_system: true,
      is_visible: true,
      sort_order: 10,
    },
    {
      entity_type: "customer",
      field_key: "phone",
      field_label: "Phone Number",
      placeholder: "+91 98200 00000",
      field_type: "text",
      options: null,
      is_required: false,
      is_unique: true,
      is_system: true,
      is_visible: true,
      sort_order: 20,
    },
    {
      entity_type: "customer",
      field_key: "email",
      field_label: "Email Address",
      placeholder: "name@example.com",
      field_type: "text",
      options: null,
      is_required: false,
      is_unique: false,
      is_system: true,
      is_visible: true,
      sort_order: 30,
    },
    {
      entity_type: "customer",
      field_key: "type",
      field_label: "Customer Type",
      placeholder: "Select type",
      field_type: "select",
      options: ["Buyer", "Seller", "Investor", "Tenant"],
      is_required: false,
      is_unique: false,
      is_system: true,
      is_visible: true,
      sort_order: 40,
    },
    {
      entity_type: "customer",
      field_key: "status",
      field_label: "Status",
      placeholder: "Select status",
      field_type: "select",
      options: ["Prospect", "Active", "Inactive"],
      is_required: false,
      is_unique: false,
      is_system: true,
      is_visible: true,
      sort_order: 50,
    },
    {
      entity_type: "customer",
      field_key: "city",
      field_label: "City",
      placeholder: "e.g. Mumbai",
      field_type: "text",
      options: null,
      is_required: false,
      is_unique: false,
      is_system: true,
      is_visible: true,
      sort_order: 60,
    },
    {
      entity_type: "customer",
      field_key: "value",
      field_label: "Deal Value",
      placeholder: "e.g. 50,00,000",
      field_type: "number",
      options: null,
      is_required: false,
      is_unique: false,
      is_system: true,
      is_visible: true,
      sort_order: 70,
    },
    {
      entity_type: "customer",
      field_key: "assigned_to",
      field_label: "Assigned Employee",
      placeholder: "Select agent",
      field_type: "select",
      options: null,
      is_required: false,
      is_unique: false,
      is_system: true,
      is_visible: true,
      sort_order: 80,
    },
    {
      entity_type: "customer",
      field_key: "notes",
      field_label: "Notes",
      placeholder: "Customer notes...",
      field_type: "textarea",
      options: null,
      is_required: false,
      is_unique: false,
      is_system: true,
      is_visible: true,
      sort_order: 90,
    },
  ],
  property: [
    {
      entity_type: "property",
      field_key: "name",
      field_label: "Property Name",
      placeholder: "e.g. Azure Heights — 1204",
      field_type: "text",
      options: null,
      is_required: true,
      is_unique: false,
      is_system: true,
      is_visible: true,
      sort_order: 10,
    },
    {
      entity_type: "property",
      field_key: "location",
      field_label: "Location",
      placeholder: "e.g. Bandra West, Mumbai",
      field_type: "text",
      options: null,
      is_required: false,
      is_unique: false,
      is_system: true,
      is_visible: true,
      sort_order: 20,
    },
    {
      entity_type: "property",
      field_key: "type",
      field_label: "Property Type",
      placeholder: "Select type",
      field_type: "select",
      options: ["Apartment", "Villa", "Plot", "Commercial", "Penthouse"],
      is_required: false,
      is_unique: false,
      is_system: true,
      is_visible: true,
      sort_order: 30,
    },
    {
      entity_type: "property",
      field_key: "status",
      field_label: "Property Status",
      placeholder: "Select status",
      field_type: "select",
      options: ["Available", "Under Offer", "Sold", "Rented"],
      is_required: false,
      is_unique: false,
      is_system: true,
      is_visible: true,
      sort_order: 40,
    },
    {
      entity_type: "property",
      field_key: "price",
      field_label: "Price",
      placeholder: "e.g. 1,50,00,000",
      field_type: "number",
      options: null,
      is_required: false,
      is_unique: false,
      is_system: true,
      is_visible: true,
      sort_order: 50,
    },
    {
      entity_type: "property",
      field_key: "area_sqft",
      field_label: "Area (sq.ft)",
      placeholder: "0",
      field_type: "number",
      options: null,
      is_required: false,
      is_unique: false,
      is_system: true,
      is_visible: true,
      sort_order: 60,
    },
    {
      entity_type: "property",
      field_key: "bedrooms",
      field_label: "Bedrooms",
      placeholder: "0",
      field_type: "number",
      options: null,
      is_required: false,
      is_unique: false,
      is_system: true,
      is_visible: true,
      sort_order: 70,
    },
    {
      entity_type: "property",
      field_key: "assigned_to",
      field_label: "Assigned Employee",
      placeholder: "Unassigned (No agent)",
      field_type: "select",
      options: null,
      is_required: false,
      is_unique: false,
      is_system: true,
      is_visible: true,
      sort_order: 80,
    },
    {
      entity_type: "property",
      field_key: "image_url",
      field_label: "Property Photo",
      placeholder: "Upload photo or paste URL",
      field_type: "text",
      options: null,
      is_required: false,
      is_unique: false,
      is_system: true,
      is_visible: true,
      sort_order: 90,
    },
    {
      entity_type: "property",
      field_key: "description",
      field_label: "Description",
      placeholder: "Key highlights, e.g. Sea facing, ready possession",
      field_type: "textarea",
      options: null,
      is_required: false,
      is_unique: false,
      is_system: true,
      is_visible: true,
      sort_order: 100,
    },
  ],
};

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
    let sql = `SELECT id, workspace_id, entity_type, field_key, field_label, placeholder,
                      field_type, options, is_required, is_unique, is_system, is_visible,
                      sort_order, created_at, updated_at
               FROM workspace_custom_fields
               WHERE workspace_id = ?`;

    if (data.entityType) {
      sql += ` AND entity_type = ?`;
      params.push(data.entityType);
    }

    sql += ` ORDER BY sort_order ASC, created_at ASC`;

    const storedRows = await query<any>(sql, params);
    const storedMap = new Map<string, any>();
    storedRows.forEach((r) => {
      const key = `${r.entity_type}:${r.field_key}`;
      storedMap.set(key, r);
    });

    const entities: CustomFieldEntity[] = data.entityType
      ? [data.entityType]
      : ["lead", "customer", "property"];

    const combined: WorkspaceCustomField[] = [];

    for (const ent of entities) {
      const defaults = DEFAULT_SYSTEM_FIELDS[ent] || [];
      const handledDefaultKeys = new Set<string>();

      // 1. Process default system fields (apply workspace overrides if present)
      for (const def of defaults) {
        handledDefaultKeys.add(def.field_key);
        const override = storedMap.get(`${ent}:${def.field_key}`);
        if (override) {
          combined.push({
            id: override.id,
            workspace_id: override.workspace_id,
            entity_type: override.entity_type,
            field_key: override.field_key,
            field_label: override.field_label || def.field_label,
            placeholder: override.placeholder ?? def.placeholder,
            field_type: override.field_type || def.field_type,
            options: override.options
              ? typeof override.options === "string"
                ? JSON.parse(override.options)
                : override.options
              : def.options,
            is_required: def.field_key === "name" ? true : Boolean(override.is_required),
            is_unique: Boolean(override.is_unique ?? def.is_unique),
            is_system: true,
            is_visible: def.field_key === "name" ? true : Boolean(override.is_visible ?? 1),
            sort_order: Number(override.sort_order ?? def.sort_order),
            created_at: override.created_at,
            updated_at: override.updated_at,
          });
        } else {
          combined.push({
            id: `system_${ent}_${def.field_key}`,
            workspace_id: wsId,
            entity_type: ent,
            field_key: def.field_key,
            field_label: def.field_label,
            placeholder: def.placeholder,
            field_type: def.field_type,
            options: def.options,
            is_required: def.is_required,
            is_unique: def.is_unique,
            is_system: true,
            is_visible: def.is_visible,
            sort_order: def.sort_order,
            created_at: new Date(0).toISOString(),
            updated_at: new Date(0).toISOString(),
          });
        }
      }

      // 2. Process custom fields (is_system = 0 or non-default keys)
      for (const r of storedRows) {
        if (r.entity_type === ent && !handledDefaultKeys.has(r.field_key)) {
          combined.push({
            id: r.id,
            workspace_id: r.workspace_id,
            entity_type: r.entity_type,
            field_key: r.field_key,
            field_label: r.field_label,
            placeholder: r.placeholder ?? null,
            field_type: r.field_type,
            options: typeof r.options === "string" ? JSON.parse(r.options) : (r.options ?? null),
            is_required: Boolean(r.is_required),
            is_unique: Boolean(r.is_unique),
            is_system: Boolean(r.is_system),
            is_visible: Boolean(r.is_visible ?? 1),
            sort_order: Number(r.sort_order ?? 0),
            created_at: r.created_at,
            updated_at: r.updated_at,
          });
        }
      }
    }

    return combined.sort((a, b) => a.sort_order - b.sort_order);
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
      placeholder?: string | null;
      fieldType: CustomFieldType;
      options?: string[] | null;
      isRequired?: boolean;
      isUnique?: boolean;
      isSystem?: boolean;
      isVisible?: boolean;
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

    const isSystem = Boolean(data.isSystem);
    const isVisible = data.isVisible !== false ? 1 : 0;
    const isRequired = data.isRequired ? 1 : 0;
    const isUnique = data.isUnique ? 1 : 0;
    const sortOrder = Number(data.sortOrder ?? 0);
    const placeholder = data.placeholder?.trim() || null;

    // Check if an existing database entry already exists for this (ws, entity, key)
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM workspace_custom_fields WHERE workspace_id = ? AND entity_type = ? AND field_key = ?`,
      [wsId, data.entityType, normalizedKey],
    );

    if (existing) {
      // Update existing record
      await execute(
        `UPDATE workspace_custom_fields
         SET field_label = ?, placeholder = ?, field_type = ?, options = ?,
             is_required = ?, is_unique = ?, is_system = ?, is_visible = ?, sort_order = ?
         WHERE id = ? AND workspace_id = ?`,
        [
          data.fieldLabel.trim(),
          placeholder,
          data.fieldType,
          rawOptions,
          isRequired,
          isUnique,
          isSystem ? 1 : 0,
          isVisible,
          sortOrder,
          existing.id,
          wsId,
        ],
      );
      return { success: true, id: existing.id };
    }

    // Insert new record
    const newId = uuid();
    await execute(
      `INSERT INTO workspace_custom_fields 
        (id, workspace_id, entity_type, field_key, field_label, placeholder, field_type,
         options, is_required, is_unique, is_system, is_visible, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId,
        wsId,
        data.entityType,
        normalizedKey,
        data.fieldLabel.trim(),
        placeholder,
        data.fieldType,
        rawOptions,
        isRequired,
        isUnique,
        isSystem ? 1 : 0,
        isVisible,
        sortOrder,
      ],
    );

    return { success: true, id: newId };
  });

/* -------------------------------- Delete ---------------------------------- */

export const deleteWorkspaceCustomFieldFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string; fieldId: string; entityType?: CustomFieldEntity }) => input)
  .handler(async ({ data, context }): Promise<{ success: boolean }> => {
    const wsId =
      context.role === "super_admin"
        ? data.workspaceId || context.workspaceId
        : context.workspaceId;
    if (!wsId) throw new Error("Workspace is required.");

    await assertPermission(context, "manage.settings", wsId);

    // If virtual system id like `system_lead_phone`
    if (data.fieldId.startsWith("system_")) {
      const parts = data.fieldId.split("_");
      const entity = parts[1] as CustomFieldEntity;
      const key = parts.slice(2).join("_");
      if (key === "name") throw new Error("Core name column cannot be hidden or deleted.");

      // Insert soft-disable entry (is_visible = 0) so it hides for this workspace without data loss
      const newId = uuid();
      await execute(
        `INSERT INTO workspace_custom_fields
          (id, workspace_id, entity_type, field_key, field_label, field_type, is_system, is_visible)
         VALUES (?, ?, ?, ?, ?, 'text', 1, 0)
         ON DUPLICATE KEY UPDATE is_visible = 0`,
        [newId, wsId, entity, key, key],
      );
      return { success: true };
    }

    // Check if the record is a system field override
    const target = await queryOne<{ id: string; is_system: number; field_key: string }>(
      `SELECT id, is_system, field_key FROM workspace_custom_fields WHERE id = ? AND workspace_id = ?`,
      [data.fieldId, wsId],
    );

    if (!target) return { success: true };

    if (target.is_system) {
      if (target.field_key === "name") throw new Error("Core name column cannot be hidden or deleted.");
      // Toggle visibility off (hide) or delete override to restore system default
      await execute(
        `DELETE FROM workspace_custom_fields WHERE id = ? AND workspace_id = ?`,
        [data.fieldId, wsId],
      );
    } else {
      // Custom field: delete metadata
      await execute(
        `DELETE FROM workspace_custom_fields WHERE id = ? AND workspace_id = ?`,
        [data.fieldId, wsId],
      );
    }

    return { success: true };
  });

/* ----------------------- Uniqueness Validation Helper ---------------------- */

export async function assertCustomFieldsUnique(
  wsId: string,
  entityType: CustomFieldEntity,
  customFieldsInput: Record<string, any> | string | null | undefined,
  excludeId?: string | null,
): Promise<void> {
  let customFields: Record<string, any> | null = null;
  if (typeof customFieldsInput === "string") {
    try {
      customFields = JSON.parse(customFieldsInput);
    } catch {
      customFields = null;
    }
  } else if (customFieldsInput && typeof customFieldsInput === "object") {
    customFields = customFieldsInput;
  }
  if (!customFields || Object.keys(customFields).length === 0) return;

  const uniqueFields = await query<{ field_key: string; field_label: string }>(
    `SELECT field_key, field_label FROM workspace_custom_fields
     WHERE workspace_id = ? AND entity_type = ? AND is_unique = 1 AND is_system = 0`,
    [wsId, entityType],
  );

  if (uniqueFields.length === 0) return;

  const table = entityType === "lead" ? "leads" : entityType === "customer" ? "customers" : "properties";

  for (const field of uniqueFields) {
    const val = customFields[field.field_key];
    if (val !== undefined && val !== null && String(val).trim().length > 0) {
      const trimmedVal = String(val).trim();
      const params: any[] = [wsId, trimmedVal];
      let sql = `SELECT id FROM ${table} WHERE workspace_id = ? AND JSON_UNQUOTE(JSON_EXTRACT(custom_fields, '$.${field.field_key}')) = ?`;
      if (excludeId) {
        sql += ` AND id != ?`;
        params.push(excludeId);
      }
      sql += ` LIMIT 1`;

      const match = await queryOne<{ id: string }>(sql, params);
      if (match) {
        throw new Error(
          `Field "${field.field_label}" must be unique. Value "${trimmedVal}" is already registered in this workspace.`,
        );
      }
    }
  }
}
