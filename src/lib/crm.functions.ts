import { createServerFn } from "@tanstack/react-start";
import { requireMySqlAuth, assertPermission } from "./auth-server.ts";
import { query, queryOne, execute, transaction, uuid } from "./db.ts";
import { getDefaultQuickAddDueDateTime } from "./date-utils.ts";
import { calculateLeadScore } from "./lead-scoring.ts";
import { type InvoiceLineInput, invoiceTotals, computeInvoiceTotals } from "./invoice-calculations.ts";
import type {
  Customer,
  Property,
  Lead,
  LeadOption,
  LeadOptionType,
  LeadActivity,
  Task,
  CalendarEvent,
  Invoice,
  InvoiceItem,
  Payment,
  Plan,
  PromoMedia,
  AuditLog,
  Notification,
} from "./db-types";

export type { InvoiceLineInput, LeadOption, LeadOptionType };
export type Member = { id: string; full_name: string; email: string | null; is_active: boolean };

/* -------------------------------- members --------------------------------- */

export const listMembersFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string }) => input)
  .handler(async ({ data }): Promise<Member[]> => {
    return query<Member>(
      "SELECT id, full_name, email, is_active FROM profiles WHERE workspace_id = ? ORDER BY full_name",
      [data.workspaceId],
    );
  });

/* -------------------------------- helpers --------------------------------- */

export type CrmServerAuthContext = {
  userId: string;
  workspaceId: string | null;
  role: string;
  isViewingAs?: boolean;
  realUserId?: string;
  realRole?: string;
};

function getTargetWorkspaceId(
  inputWsId: string | undefined,
  context: { workspaceId: string | null; role: string },
): string {
  if (context.role === "super_admin" && inputWsId) {
    return inputWsId;
  }
  if (!context.workspaceId) {
    throw new Error("Unauthorized: Session is not associated with an active workspace.");
  }
  return context.workspaceId;
}

function checkDeleteRole(context: { role: string }) {
  if (context.role === "employee") {
    throw new Error("Unauthorized: Only owners or managers can delete core CRM records.");
  }
}

/** Returns true if the user is an employee (not owner/manager/super_admin). */
function isEmployee(context: { role: string }): boolean {
  return context.role === "employee";
}

/**
 * Builds the SQL WHERE clause fragment and params for employee data isolation.
 * Employees can only see records they are assigned to or created.
 * Owners/managers/super_admins see all records in the workspace.
 */
function employeeFilter(
  context: { role: string; userId: string },
  assignedCol = "assigned_to",
  createdCol = "created_by",
): { sql: string; params: unknown[] } {
  if (!isEmployee(context)) return { sql: "", params: [] };
  return {
    sql: ` AND (${assignedCol} = ? OR ${createdCol} = ?)`,
    params: [context.userId, context.userId],
  };
}

/**
 * Internal helper to create a targeted notification.
 * Notifications are always scoped to workspace + specific user.
 */
async function createNotificationInternal(opts: {
  workspaceId: string;
  userId: string;
  type: string;
  title: string;
  message?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  createdBy?: string | null;
}): Promise<void> {
  try {
    const id = uuid();
    await execute(
      `INSERT INTO notifications (id, workspace_id, user_id, type, title, message, entity_type, entity_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        opts.workspaceId,
        opts.userId,
        opts.type,
        opts.title,
        opts.message ?? null,
        opts.entityType ?? null,
        opts.entityId ?? null,
        opts.createdBy ?? null,
      ],
    );
  } catch (err) {
    console.warn("Failed to create notification:", err instanceof Error ? err.message : err);
  }
}

/* -------------------------------- customers ------------------------------- */

export const listCustomersFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string }) => input)
  .handler(async ({ data, context }): Promise<Customer[]> => {
    const wsId = getTargetWorkspaceId(data.workspaceId, context);
    const ef = employeeFilter(context);
    return query<Customer>(
      `SELECT * FROM customers WHERE workspace_id = ?${ef.sql} ORDER BY created_at DESC`,
      [wsId, ...ef.params],
    );
  });

export const getCustomerFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data, context }): Promise<Customer | null> => {
    if (context.role === "super_admin") {
      return queryOne<Customer>("SELECT * FROM customers WHERE id = ?", [data.id]);
    }
    const wsId = getTargetWorkspaceId(undefined, context);
    const ef = employeeFilter(context);
    return queryOne<Customer>(
      `SELECT * FROM customers WHERE id = ? AND workspace_id = ?${ef.sql}`,
      [data.id, wsId, ...ef.params],
    );
  });

export const createCustomerFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: Partial<Customer> & { workspace_id: string; name: string }) => input)
  .handler(async ({ data, context }): Promise<Customer> => {
    const wsId = getTargetWorkspaceId(data.workspace_id, context);
    const id = uuid();
    const creatorId = context.userId || data.created_by || null;
    let assignedTo = data.assigned_to ?? null;
    // When employee creates customer: Created By = Employee, Assigned To = Employee (persisted in MySQL)
    if (isEmployee(context) && creatorId) {
      assignedTo = creatorId;
    }

    await execute(
      `INSERT INTO customers (id, workspace_id, name, phone, email, type, status, city, currency, value, tags, notes, assigned_to, assigned_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        wsId,
        data.name,
        data.phone ?? null,
        data.email ?? null,
        data.type ?? "Buyer",
        data.status ?? "Prospect",
        data.city ?? null,
        data.currency ?? "INR",
        data.value ?? 0,
        data.tags ? JSON.stringify(data.tags) : null,
        data.notes ?? null,
        assignedTo,
        assignedTo ? new Date().toISOString().slice(0, 19).replace("T", " ") : null,
        creatorId,
      ],
    );
    const newCustomer = (await queryOne<Customer>("SELECT * FROM customers WHERE id = ?", [id]))!;

    // Notify assigned employee (if not the creator)
    if (assignedTo && assignedTo !== context.userId) {
      await createNotificationInternal({
        workspaceId: wsId,
        userId: assignedTo,
        type: "customer_assigned",
        title: `Customer "${data.name}" assigned to you`,
        message: data.notes ? `Notes: ${data.notes}` : null,
        entityType: "customer",
        entityId: id,
        createdBy: context.userId,
      });
    }

    // Audit log
    await execute(
      `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata, status)
       VALUES (?, ?, ?, ?, 'customer.created', 'customer', ?, ?, 'success')`,
      [
        uuid(),
        wsId,
        context.userId,
        context.role,
        id,
        JSON.stringify({ name: data.name, type: data.type, status: data.status, value: data.value }),
      ],
    );

    return newCustomer;
  });

export const updateCustomerFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string; patch: Partial<Customer> }) => input)
  .handler(async ({ data, context }): Promise<Customer> => {
    const wsId = getTargetWorkspaceId(undefined, context);

    // 1. Fetch existing to detect assignment change & check permissions
    const existing = await queryOne<Customer>("SELECT * FROM customers WHERE id = ?", [data.id]);
    if (!existing) throw new Error("Customer not found");

    // Employee isolation check
    if (isEmployee(context)) {
      if (existing.assigned_to !== context.userId && existing.created_by !== context.userId) {
        throw new Error("Unauthorized: You do not have access to update this customer.");
      }
    }

    // If assigned_to is changing, verify authorization & inject assigned_at
    if (data.patch.assigned_to !== undefined && data.patch.assigned_to !== existing.assigned_to) {
      if (isEmployee(context)) {
        throw new Error("Unauthorized: Only owners or managers can assign or reassign customers.");
      }
      (data.patch as any).assigned_at = data.patch.assigned_to
        ? new Date().toISOString().slice(0, 19).replace("T", " ")
        : null;
    }

    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [key, val] of Object.entries(data.patch)) {
      if (key === "id" || key === "created_at" || key === "workspace_id") continue;
      sets.push(`\`${key}\` = ?`);
      vals.push(key === "tags" && val !== null ? JSON.stringify(val) : val);
    }
    if (sets.length === 0) return existing;

    vals.push(data.id);
    if (context.role !== "super_admin") {
      vals.push(wsId);
      await execute(
        `UPDATE customers SET ${sets.join(", ")} WHERE id = ? AND workspace_id = ?`,
        vals,
      );
    } else {
      await execute(`UPDATE customers SET ${sets.join(", ")} WHERE id = ?`, vals);
    }
    const updated = (await queryOne<Customer>("SELECT * FROM customers WHERE id = ?", [data.id]))!;

    // Audit log
    await execute(
      `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata, status)
       VALUES (?, ?, ?, ?, 'customer.updated', 'customer', ?, ?, 'success')`,
      [
        uuid(),
        wsId,
        context.userId,
        context.role,
        data.id,
        JSON.stringify({
          name: updated.name,
          changes: data.patch,
          before: { status: existing.status, value: existing.value, assigned_to: existing.assigned_to },
          after: { status: updated.status, value: updated.value, assigned_to: updated.assigned_to },
        }),
      ],
    );

    // Notify if assignment changed
    if (data.patch.assigned_to && data.patch.assigned_to !== existing.assigned_to) {
      if (data.patch.assigned_to !== context.userId) {
        await createNotificationInternal({
          workspaceId: wsId,
          userId: data.patch.assigned_to as string,
          type: "customer_assigned",
          title: `Customer "${updated.name}" assigned to you`,
          message: updated.notes ? `Notes: ${updated.notes}` : null,
          entityType: "customer",
          entityId: data.id,
          createdBy: context.userId,
        });
      }
    }

    return updated;
  });

export const deleteCustomerFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    checkDeleteRole(context);
    const wsId = getTargetWorkspaceId(undefined, context);
    const existing = await queryOne<Customer>("SELECT id, name FROM customers WHERE id = ?", [data.id]);
    if (context.role !== "super_admin") {
      await execute("DELETE FROM customers WHERE id = ? AND workspace_id = ?", [data.id, wsId]);
    } else {
      await execute("DELETE FROM customers WHERE id = ?", [data.id]);
    }

    // Audit log
    await execute(
      `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata, status)
       VALUES (?, ?, ?, ?, 'customer.deleted', 'customer', ?, ?, 'success')`,
      [
        uuid(),
        wsId,
        context.userId,
        context.role,
        data.id,
        JSON.stringify({ name: existing?.name ?? data.id }),
      ],
    );

    return { ok: true };
  });

/* -------------------------------- properties ------------------------------ */

export const listPropertiesFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string }) => input)
  .handler(async ({ data, context }): Promise<Property[]> => {
    const wsId = getTargetWorkspaceId(data.workspaceId, context);
    const ef = employeeFilter(context);
    return query<Property>(
      `SELECT * FROM properties WHERE workspace_id = ?${ef.sql} ORDER BY created_at DESC`,
      [wsId, ...ef.params],
    );
  });

export const getPropertyFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data, context }): Promise<Property | null> => {
    if (context.role === "super_admin") {
      return queryOne<Property>("SELECT * FROM properties WHERE id = ?", [data.id]);
    }
    const wsId = getTargetWorkspaceId(undefined, context);
    const ef = employeeFilter(context);
    return queryOne<Property>(
      `SELECT * FROM properties WHERE id = ? AND workspace_id = ?${ef.sql}`,
      [data.id, wsId, ...ef.params],
    );
  });

export const createPropertyFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: Partial<Property> & { workspace_id: string; name: string }) => input)
  .handler(async ({ data, context }): Promise<Property> => {
    const wsId = getTargetWorkspaceId(data.workspace_id, context);
    const id = uuid();
    const creatorId = context.userId || data.created_by || null;
    let assignedTo = data.assigned_to ?? null;
    // When employee creates property: Created By = Employee, Assigned To = Employee (persisted in MySQL)
    if (isEmployee(context) && creatorId) {
      assignedTo = creatorId;
    }

    await execute(
      `INSERT INTO properties (id, workspace_id, name, location, type, status, price, currency, bedrooms, area_sqft, image_url, description, assigned_to, assigned_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        wsId,
        data.name,
        data.location ?? null,
        data.type ?? "Apartment",
        data.status ?? "Available",
        data.price ?? 0,
        data.currency ?? "INR",
        data.bedrooms ?? null,
        data.area_sqft ?? null,
        data.image_url ?? null,
        data.description ?? null,
        assignedTo,
        assignedTo ? new Date().toISOString().slice(0, 19).replace("T", " ") : null,
        creatorId,
      ],
    );
    const newProperty = (await queryOne<Property>("SELECT * FROM properties WHERE id = ?", [id]))!;

    // Notify assigned employee (if not the creator)
    if (assignedTo && assignedTo !== context.userId) {
      await createNotificationInternal({
        workspaceId: wsId,
        userId: assignedTo,
        type: "property_assigned",
        title: `Property "${data.name}" assigned to you`,
        message: data.location ? `Location: ${data.location}` : null,
        entityType: "property",
        entityId: id,
        createdBy: context.userId,
      });
    }

    // Audit log
    await execute(
      `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata, status)
       VALUES (?, ?, ?, ?, 'property.created', 'property', ?, ?, 'success')`,
      [
        uuid(),
        wsId,
        context.userId,
        context.role,
        id,
        JSON.stringify({ name: data.name, location: data.location, type: data.type, status: data.status, price: data.price }),
      ],
    );

    return newProperty;
  });

export const updatePropertyFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string; patch: Partial<Property> }) => input)
  .handler(async ({ data, context }): Promise<Property> => {
    const wsId = getTargetWorkspaceId(undefined, context);

    // 1. Fetch existing to detect assignment change & check permissions
    const existing = await queryOne<Property>("SELECT * FROM properties WHERE id = ?", [data.id]);
    if (!existing) throw new Error("Property not found");

    // Employee isolation check
    if (isEmployee(context)) {
      if (existing.assigned_to !== context.userId && existing.created_by !== context.userId) {
        throw new Error("Unauthorized: You do not have access to update this property.");
      }
    }

    // If assigned_to is changing, verify authorization & inject assigned_at
    if (data.patch.assigned_to !== undefined && data.patch.assigned_to !== existing.assigned_to) {
      if (isEmployee(context)) {
        throw new Error("Unauthorized: Only owners or managers can assign or reassign properties.");
      }
      (data.patch as any).assigned_at = data.patch.assigned_to
        ? new Date().toISOString().slice(0, 19).replace("T", " ")
        : null;
    }

    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [key, val] of Object.entries(data.patch)) {
      if (key === "id" || key === "created_at" || key === "workspace_id") continue;
      sets.push(`\`${key}\` = ?`);
      vals.push(val);
    }
    if (sets.length === 0) return existing;

    vals.push(data.id);
    if (context.role !== "super_admin") {
      vals.push(wsId);
      await execute(
        `UPDATE properties SET ${sets.join(", ")} WHERE id = ? AND workspace_id = ?`,
        vals,
      );
    } else {
      await execute(`UPDATE properties SET ${sets.join(", ")} WHERE id = ?`, vals);
    }
    const updated = (await queryOne<Property>("SELECT * FROM properties WHERE id = ?", [data.id]))!;

    // Audit log
    await execute(
      `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata, status)
       VALUES (?, ?, ?, ?, 'property.updated', 'property', ?, ?, 'success')`,
      [
        uuid(),
        wsId,
        context.userId,
        context.role,
        data.id,
        JSON.stringify({
          name: updated.name,
          changes: data.patch,
          before: { status: existing.status, price: existing.price, assigned_to: existing.assigned_to },
          after: { status: updated.status, price: updated.price, assigned_to: updated.assigned_to },
        }),
      ],
    );

    // Notify if assignment changed
    if (data.patch.assigned_to && data.patch.assigned_to !== existing.assigned_to) {
      if (data.patch.assigned_to !== context.userId) {
        await createNotificationInternal({
          workspaceId: wsId,
          userId: data.patch.assigned_to as string,
          type: "property_assigned",
          title: `Property "${updated.name}" assigned to you`,
          message: updated.location ? `Location: ${updated.location}` : null,
          entityType: "property",
          entityId: data.id,
          createdBy: context.userId,
        });
      }
    }

    return updated;
  });

export const deletePropertyFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    checkDeleteRole(context);
    const wsId = getTargetWorkspaceId(undefined, context);
    const existing = await queryOne<Property>("SELECT id, name FROM properties WHERE id = ?", [data.id]);
    if (context.role !== "super_admin") {
      await execute("DELETE FROM properties WHERE id = ? AND workspace_id = ?", [data.id, wsId]);
    } else {
      await execute("DELETE FROM properties WHERE id = ?", [data.id]);
    }

    // Audit log
    await execute(
      `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata, status)
       VALUES (?, ?, ?, ?, 'property.deleted', 'property', ?, ?, 'success')`,
      [
        uuid(),
        wsId,
        context.userId,
        context.role,
        data.id,
        JSON.stringify({ name: existing?.name ?? data.id }),
      ],
    );

    return { ok: true };
  });

/* ----------------------------------- leads -------------------------------- */

const LEAD_SELECT_COLS = `
  l.*,
  so.name AS source_option_name,
  so.stable_key AS source_stable_key,
  lo.name AS location_name,
  po.name AS purpose_name,
  pt.name AS possession_timeline_name,
  tt.name AS transaction_timeline_name,
  ph.name AS phase_name
`;

const LEAD_FROM_JOINS = `
  leads l
  LEFT JOIN lead_options so ON l.source_option_id = so.id
  LEFT JOIN lead_options lo ON l.location_option_id = lo.id
  LEFT JOIN lead_options po ON l.purpose_option_id = po.id
  LEFT JOIN lead_options pt ON l.possession_timeline_option_id = pt.id
  LEFT JOIN lead_options tt ON l.transaction_timeline_option_id = tt.id
  LEFT JOIN lead_options ph ON l.phase_option_id = ph.id
`;

const VALID_OPTION_TYPES: LeadOptionType[] = [
  "source",
  "location",
  "purpose",
  "possession_timeline",
  "transaction_timeline",
  "phase",
];

export const DEFAULT_LEAD_OPTIONS: Record<
  LeadOptionType,
  { name: string; stable_key?: string; is_system?: boolean; sort_order: number }[]
> = {
  source: [
    { name: "Meta Ads", stable_key: "meta_ads", is_system: true, sort_order: 1 },
    { name: "Google Ads", stable_key: "google_ads", is_system: true, sort_order: 2 },
    { name: "Website Forms", stable_key: "website_forms", is_system: true, sort_order: 3 },
    { name: "Landing Pages", stable_key: "landing_pages", is_system: true, sort_order: 4 },
    { name: "WhatsApp", stable_key: "whatsapp", is_system: true, sort_order: 5 },
    { name: "Instagram Ads", stable_key: "instagram_ads", is_system: true, sort_order: 6 },
    { name: "Manual Entry", stable_key: "manual_entry", is_system: true, sort_order: 7 },
    { name: "Referral", stable_key: "referral", is_system: false, sort_order: 8 },
  ],
  location: [
    { name: "Nerul-Seawoods", sort_order: 1 },
    { name: "Juinagar", sort_order: 2 },
    { name: "Ulwe", sort_order: 3 },
    { name: "Panvel", sort_order: 4 },
    { name: "Palaspe", sort_order: 5 },
  ],
  purpose: [
    { name: "Self Use", sort_order: 1 },
    { name: "Investment", sort_order: 2 },
  ],
  possession_timeline: [
    { name: "Immediate", sort_order: 1 },
    { name: "Within 6 months", sort_order: 2 },
    { name: "Within a year", sort_order: 3 },
    { name: "Within 2 years", sort_order: 4 },
    { name: "Within 3 years", sort_order: 5 },
    { name: "More than 3 years", sort_order: 6 },
  ],
  transaction_timeline: [
    { name: "Immediate", sort_order: 1 },
    { name: "Within a Month", sort_order: 2 },
    { name: "Within 3 Months", sort_order: 3 },
    { name: "Within 6 Months", sort_order: 4 },
    { name: "Just Exploring", sort_order: 5 },
  ],
  phase: [
    { name: "Pre launch", sort_order: 1 },
    { name: "Under Construction", sort_order: 2 },
    { name: "Nearby Possession", sort_order: 3 },
    { name: "Ready to move in", sort_order: 4 },
  ],
};

export async function ensureDefaultLeadOptionsInternal(
  workspaceId: string,
  actorId: string | null = null,
): Promise<void> {
  if (!workspaceId) return;

  for (const [type, items] of Object.entries(DEFAULT_LEAD_OPTIONS)) {
    for (const item of items) {
      const existing = await queryOne<LeadOption>(
        "SELECT id, stable_key FROM lead_options WHERE workspace_id = ? AND type = ? AND LOWER(name) = LOWER(?) LIMIT 1",
        [workspaceId, type, item.name],
      );

      if (existing) {
        if (item.stable_key && !existing.stable_key) {
          await execute(
            "UPDATE lead_options SET stable_key = ?, is_system = ? WHERE id = ?",
            [item.stable_key, item.is_system ? 1 : 0, existing.id],
          );
        }
      } else {
        const id = uuid();
        await execute(
          `INSERT INTO lead_options (id, workspace_id, type, name, stable_key, is_system, is_active, sort_order, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
          [
            id,
            workspaceId,
            type,
            item.name,
            item.stable_key || null,
            item.is_system ? 1 : 0,
            item.sort_order || 0,
            actorId,
            actorId,
          ],
        );
      }
    }
  }
}

async function validateLeadOptionReference(
  wsId: string,
  optionId: string | null | undefined,
  expectedType: LeadOptionType,
  requireActive: boolean = true,
): Promise<LeadOption | null> {
  if (!optionId || optionId === "none" || optionId === "unassigned") return null;
  const opt = await queryOne<LeadOption>(
    "SELECT * FROM lead_options WHERE id = ? LIMIT 1",
    [optionId],
  );
  if (!opt) {
    throw new Error(`Invalid ${expectedType} option selected (not found).`);
  }
  if (opt.workspace_id !== wsId) {
    throw new Error(`Unauthorized: Cross-workspace ${expectedType} option tampering rejected.`);
  }
  if (opt.type !== expectedType) {
    throw new Error(`Option mismatch: expected type '${expectedType}' but got '${opt.type}'.`);
  }
  if (requireActive && !opt.is_active) {
    throw new Error(`Cannot select inactive ${expectedType} option "${opt.name}" for a lead.`);
  }
  return opt;
}

export async function listLeadsCore(
  context: CrmServerAuthContext,
  data: { workspaceId: string },
): Promise<Lead[]> {
  const wsId = getTargetWorkspaceId(data.workspaceId, context);
  const ef = employeeFilter(context, "l.assigned_to", "l.created_by");
  return query<Lead>(
    `SELECT ${LEAD_SELECT_COLS} FROM ${LEAD_FROM_JOINS} WHERE l.workspace_id = ?${ef.sql} ORDER BY l.received_at DESC`,
    [wsId, ...ef.params],
  );
}

export const listLeadsFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string }) => input)
  .handler(async ({ data, context }) => listLeadsCore(context, data));

export async function getLeadCore(
  context: CrmServerAuthContext,
  data: { id: string },
): Promise<Lead | null> {
  if (context.role === "super_admin") {
    return queryOne<Lead>(
      `SELECT ${LEAD_SELECT_COLS} FROM ${LEAD_FROM_JOINS} WHERE l.id = ?`,
      [data.id],
    );
  }
  const wsId = getTargetWorkspaceId(undefined, context);
  const ef = employeeFilter(context, "l.assigned_to", "l.created_by");
  return queryOne<Lead>(
    `SELECT ${LEAD_SELECT_COLS} FROM ${LEAD_FROM_JOINS} WHERE l.id = ? AND l.workspace_id = ?${ef.sql}`,
    [data.id, wsId, ...ef.params],
  );
}

export const getLeadFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data, context }) => getLeadCore(context, data));

export async function createLeadCore(
  context: CrmServerAuthContext,
  data: Partial<Lead> & { workspace_id: string; name: string },
): Promise<Lead> {
  const wsId = getTargetWorkspaceId(data.workspace_id, context);
  const id = uuid();

  const creatorId = context.userId || data.created_by || null;
  let assignedTo = data.assigned_to ?? null;
  if (assignedTo === "unassigned") assignedTo = null;
  // When employee creates lead: Created By = Employee, Assigned To = Employee (persisted in MySQL)
  if (isEmployee(context) && creatorId) {
    assignedTo = creatorId;
  }

  // Validate configurable option references
  const sourceOpt = data.source_option_id
    ? await validateLeadOptionReference(wsId, data.source_option_id, "source", true)
    : null;
  const locationOpt = data.location_option_id
    ? await validateLeadOptionReference(wsId, data.location_option_id, "location", true)
    : null;
  const purposeOpt = data.purpose_option_id
    ? await validateLeadOptionReference(wsId, data.purpose_option_id, "purpose", true)
    : null;
  const possessionOpt = data.possession_timeline_option_id
    ? await validateLeadOptionReference(wsId, data.possession_timeline_option_id, "possession_timeline", true)
    : null;
  const transactionOpt = data.transaction_timeline_option_id
    ? await validateLeadOptionReference(wsId, data.transaction_timeline_option_id, "transaction_timeline", true)
    : null;
  const phaseOpt = data.phase_option_id
    ? await validateLeadOptionReference(wsId, data.phase_option_id, "phase", true)
    : null;

  let sourceOptionId = sourceOpt?.id ?? null;
  let sourceName = sourceOpt?.name ?? data.source ?? "Manual Entry";

  // Auto-match source option ID if name provided without explicit ID
  if (!sourceOptionId && sourceName) {
    const matched = await queryOne<LeadOption>(
      "SELECT id, name FROM lead_options WHERE workspace_id = ? AND type = 'source' AND LOWER(name) = LOWER(?) AND is_active = 1 LIMIT 1",
      [wsId, sourceName],
    );
    if (matched) {
      sourceOptionId = matched.id;
      sourceName = matched.name;
    }
  }

  const candidateLead: Lead = {
    id,
    workspace_id: wsId,
    name: data.name.trim(),
    phone: data.phone ?? null,
    email: data.email ?? null,
    source: sourceName,
    source_option_id: sourceOptionId,
    location_option_id: locationOpt?.id ?? null,
    purpose_option_id: purposeOpt?.id ?? null,
    possession_timeline_option_id: possessionOpt?.id ?? null,
    transaction_timeline_option_id: transactionOpt?.id ?? null,
    phase_option_id: phaseOpt?.id ?? null,
    campaign: data.campaign ?? null,
    external_id: data.external_id ?? null,
    status: data.status ?? "New",
    requirement: data.requirement ?? null,
    budget: Number(data.budget) || 0,
    currency: data.currency ?? "INR",
    score: 0,
    next_follow_up: data.next_follow_up ?? null,
    received_at: data.received_at ?? new Date().toISOString().slice(0, 19).replace("T", " "),
    assigned_to: assignedTo,
    assigned_at: assignedTo ? new Date().toISOString().slice(0, 19).replace("T", " ") : null,
    property_id: data.property_id === "none" ? null : (data.property_id ?? null),
    customer_id: data.customer_id === "none" ? null : (data.customer_id ?? null),
    converted_at: null,
    notes: data.notes ?? null,
    created_by: creatorId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const calculatedScore = calculateLeadScore(candidateLead).total;

  await execute(
    `INSERT INTO leads (
      id, workspace_id, name, phone, email, source, source_option_id,
      location_option_id, purpose_option_id, possession_timeline_option_id,
      transaction_timeline_option_id, phase_option_id, campaign, external_id,
      status, requirement, budget, currency, score, next_follow_up, received_at,
      assigned_to, assigned_at, property_id, customer_id, notes, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      wsId,
      candidateLead.name,
      candidateLead.phone,
      candidateLead.email,
      candidateLead.source,
      candidateLead.source_option_id,
      candidateLead.location_option_id,
      candidateLead.purpose_option_id,
      candidateLead.possession_timeline_option_id,
      candidateLead.transaction_timeline_option_id,
      candidateLead.phase_option_id,
      candidateLead.campaign,
      candidateLead.external_id,
      candidateLead.status,
      candidateLead.requirement,
      candidateLead.budget,
      candidateLead.currency,
      calculatedScore,
      candidateLead.next_follow_up,
      candidateLead.received_at,
      candidateLead.assigned_to,
      candidateLead.assigned_at,
      candidateLead.property_id,
      candidateLead.customer_id,
      candidateLead.notes,
      candidateLead.created_by,
    ],
  );

  const newLead = (await queryOne<Lead>(
    `SELECT ${LEAD_SELECT_COLS} FROM ${LEAD_FROM_JOINS} WHERE l.id = ?`,
    [id],
  ))!;

  // Notify assigned employee (if not the creator)
  if (assignedTo && assignedTo !== context.userId) {
    await createNotificationInternal({
      workspaceId: wsId,
      userId: assignedTo,
      type: "lead_assigned",
      title: `New lead "${data.name}" assigned to you`,
      message: data.requirement ? `Requirement: ${data.requirement}` : null,
      entityType: "lead",
      entityId: id,
      createdBy: context.userId,
    });
  }
  // Notify owner(s) when employee creates a lead
  if (isEmployee(context)) {
    const owners = await query<{ id: string }>(
      "SELECT ur.user_id as id FROM user_roles ur WHERE ur.workspace_id = ? AND ur.role IN ('owner', 'manager')",
      [wsId],
    );
    for (const o of owners) {
      if (o.id !== context.userId) {
        await createNotificationInternal({
          workspaceId: wsId,
          userId: o.id,
          type: "lead_created",
          title: `New lead "${data.name}" created by team member`,
          entityType: "lead",
          entityId: id,
          createdBy: context.userId,
        });
      }
    }
  }

  // Audit log
  await execute(
    `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata, status)
     VALUES (?, ?, ?, ?, 'lead.created', 'lead', ?, ?, 'success')`,
    [
      uuid(),
      wsId,
      context.userId,
      context.role,
      id,
      JSON.stringify({ name: data.name, status: candidateLead.status, budget: candidateLead.budget, source: candidateLead.source }),
    ],
  );

  return newLead;
}

export const createLeadFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: Partial<Lead> & { workspace_id: string; name: string }) => input)
  .handler(async ({ data, context }) => createLeadCore(context, data));

export async function updateLeadCore(
  context: CrmServerAuthContext,
  data: { id: string; patch: Partial<Lead> },
): Promise<Lead> {
  const wsId = getTargetWorkspaceId(undefined, context);

  // 1. Fetch current lead
  const existingLead = await queryOne<Lead>("SELECT * FROM leads WHERE id = ?", [data.id]);
  if (!existingLead) throw new Error("Lead not found");

  // Employee isolation check
  if (isEmployee(context)) {
    if (
      existingLead.assigned_to !== context.userId &&
      existingLead.created_by !== context.userId
    ) {
      throw new Error("Unauthorized: You do not have access to update this lead.");
    }
  }

  // Validate configurable option references in patch
  if (
    data.patch.source_option_id !== undefined &&
    data.patch.source_option_id !== existingLead.source_option_id
  ) {
    const opt = await validateLeadOptionReference(wsId, data.patch.source_option_id, "source", true);
    if (opt) {
      data.patch.source = opt.name;
    }
  }
  if (
    data.patch.location_option_id !== undefined &&
    data.patch.location_option_id !== existingLead.location_option_id
  ) {
    await validateLeadOptionReference(wsId, data.patch.location_option_id, "location", true);
  }
  if (
    data.patch.purpose_option_id !== undefined &&
    data.patch.purpose_option_id !== existingLead.purpose_option_id
  ) {
    await validateLeadOptionReference(wsId, data.patch.purpose_option_id, "purpose", true);
  }
  if (
    data.patch.possession_timeline_option_id !== undefined &&
    data.patch.possession_timeline_option_id !== existingLead.possession_timeline_option_id
  ) {
    await validateLeadOptionReference(wsId, data.patch.possession_timeline_option_id, "possession_timeline", true);
  }
  if (
    data.patch.transaction_timeline_option_id !== undefined &&
    data.patch.transaction_timeline_option_id !== existingLead.transaction_timeline_option_id
  ) {
    await validateLeadOptionReference(wsId, data.patch.transaction_timeline_option_id, "transaction_timeline", true);
  }
  if (
    data.patch.phase_option_id !== undefined &&
    data.patch.phase_option_id !== existingLead.phase_option_id
  ) {
    await validateLeadOptionReference(wsId, data.patch.phase_option_id, "phase", true);
  }

  // If assigned_to is changing, verify authorization & inject assigned_at
  if (
    data.patch.assigned_to !== undefined &&
    data.patch.assigned_to !== existingLead.assigned_to
  ) {
    if (isEmployee(context)) {
      throw new Error("Unauthorized: Only owners or managers can assign or reassign leads.");
    }
    (data.patch as any).assigned_at = data.patch.assigned_to
      ? new Date().toISOString().slice(0, 19).replace("T", " ")
      : null;
  }

  // 2. Merge patch with existing lead
  const mergedLead: Lead = {
    ...existingLead,
    ...data.patch,
  };

  // 3. Recalculate deterministic lead score from real lead data
  const calculatedScore = calculateLeadScore(mergedLead).total;

  const patchWithScore: Record<string, any> = {
    ...data.patch,
    score: calculatedScore,
  };

  // Clean up virtual join fields that shouldn't be updated on leads table directly
  delete patchWithScore["source_option_name"];
  delete patchWithScore["source_stable_key"];
  delete patchWithScore["location_name"];
  delete patchWithScore["purpose_name"];
  delete patchWithScore["possession_timeline_name"];
  delete patchWithScore["transaction_timeline_name"];
  delete patchWithScore["phase_name"];

  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [key, val] of Object.entries(patchWithScore)) {
    if (key === "id" || key === "created_at" || key === "workspace_id") continue;
    sets.push(`\`${key}\` = ?`);
    vals.push(val);
  }
  if (sets.length === 0) {
    return (await queryOne<Lead>(
      `SELECT ${LEAD_SELECT_COLS} FROM ${LEAD_FROM_JOINS} WHERE l.id = ?`,
      [data.id],
    ))!;
  }

  vals.push(data.id);
  if (context.role !== "super_admin") {
    vals.push(wsId);
    await execute(`UPDATE leads SET ${sets.join(", ")} WHERE id = ? AND workspace_id = ?`, vals);
  } else {
    await execute(`UPDATE leads SET ${sets.join(", ")} WHERE id = ?`, vals);
  }

  const updatedLead = (await queryOne<Lead>(
    `SELECT ${LEAD_SELECT_COLS} FROM ${LEAD_FROM_JOINS} WHERE l.id = ?`,
    [data.id],
  ))!;

  // Notify if assignment changed
  if (
    data.patch.assigned_to &&
    data.patch.assigned_to !== existingLead.assigned_to &&
    updatedLead
  ) {
    if (data.patch.assigned_to !== context.userId) {
      await createNotificationInternal({
        workspaceId: wsId,
        userId: data.patch.assigned_to as string,
        type: "lead_assigned",
        title: `Lead "${updatedLead.name}" assigned to you`,
        message: updatedLead.requirement ? `Requirement: ${updatedLead.requirement}` : null,
        entityType: "lead",
        entityId: data.id,
        createdBy: context.userId,
      });
    }
  }

  // Audit log
  await execute(
    `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata, status)
     VALUES (?, ?, ?, ?, 'lead.updated', 'lead', ?, ?, 'success')`,
    [
      uuid(),
      wsId,
      context.userId,
      context.role,
      data.id,
      JSON.stringify({
        name: updatedLead.name,
        changes: data.patch,
        before: { status: existingLead.status, budget: existingLead.budget, assigned_to: existingLead.assigned_to },
        after: { status: updatedLead.status, budget: updatedLead.budget, assigned_to: updatedLead.assigned_to },
      }),
    ],
  );

  return updatedLead;
}

export const updateLeadFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string; patch: Partial<Lead> }) => input)
  .handler(async ({ data, context }) => updateLeadCore(context, data));

/* ------------------------------- lead_options ------------------------------ */

export async function listLeadOptionsCore(
  context: CrmServerAuthContext,
  data: { workspaceId?: string | undefined; type?: LeadOptionType | undefined; includeInactive?: boolean | undefined },
): Promise<LeadOption[]> {
  const wsId = getTargetWorkspaceId(data.workspaceId, context);
  // Employees can ONLY ever receive active options
  const onlyActive = isEmployee(context) || !data.includeInactive;

  const conditions: string[] = ["workspace_id = ?"];
  const params: unknown[] = [wsId];

  if (data.type) {
    if (!VALID_OPTION_TYPES.includes(data.type)) {
      throw new Error(`Invalid option type: ${data.type}`);
    }
    conditions.push("type = ?");
    params.push(data.type);
  }

  if (onlyActive) {
    conditions.push("is_active = 1");
  }

  return query<LeadOption>(
    `SELECT * FROM lead_options WHERE ${conditions.join(" AND ")} ORDER BY sort_order ASC, name ASC`,
    params,
  );
}

export const listLeadOptionsFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator(
    (input: { workspaceId?: string | undefined; type?: LeadOptionType | undefined; includeInactive?: boolean | undefined }) => input,
  )
  .handler(async ({ data, context }) => listLeadOptionsCore(context, data));

export async function createLeadOptionCore(
  context: CrmServerAuthContext,
  data: { workspaceId?: string | undefined; type: LeadOptionType; name: string },
): Promise<LeadOption> {
  if (context.role !== "owner" && context.role !== "super_admin") {
    throw new Error("Unauthorized: Only workspace Owners can create lead options.");
  }
  const wsId = getTargetWorkspaceId(data.workspaceId, context);

  if (!VALID_OPTION_TYPES.includes(data.type)) {
    throw new Error(`Invalid lead option type: ${data.type}`);
  }

  const name = (data.name || "").trim();
  if (!name) {
    throw new Error("Option name cannot be empty.");
  }
  if (name.length > 128) {
    throw new Error("Option name cannot exceed 128 characters.");
  }

  // Unique name within workspace + type (case-insensitive)
  const existing = await queryOne<LeadOption>(
    "SELECT id FROM lead_options WHERE workspace_id = ? AND type = ? AND LOWER(name) = LOWER(?) LIMIT 1",
    [wsId, data.type, name],
  );
  if (existing) {
    throw new Error(`An option named "${name}" already exists for this category.`);
  }

  const sortOrderRow = await queryOne<{ next_order: number }>(
    "SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM lead_options WHERE workspace_id = ? AND type = ?",
    [wsId, data.type],
  );
  const sortOrder = sortOrderRow?.next_order ?? 1;

  const id = uuid();
  await execute(
    `INSERT INTO lead_options (id, workspace_id, type, name, stable_key, is_system, is_active, sort_order, created_by, updated_by)
     VALUES (?, ?, ?, ?, NULL, 0, 1, ?, ?, ?)`,
    [id, wsId, data.type, name, sortOrder, context.userId, context.userId],
  );

  await execute(
    `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata)
     VALUES (?, ?, ?, ?, 'LEAD_OPTION_CREATED', 'lead_option', ?, ?)`,
    [
      uuid(),
      wsId,
      context.userId,
      context.role,
      id,
      JSON.stringify({ type: data.type, name, sort_order: sortOrder }),
    ],
  );

  return (await queryOne<LeadOption>("SELECT * FROM lead_options WHERE id = ?", [id]))!;
}

export const createLeadOptionFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId?: string | undefined; type: LeadOptionType; name: string }) => input)
  .handler(async ({ data, context }) => createLeadOptionCore(context, data));

export async function updateLeadOptionCore(
  context: CrmServerAuthContext,
  data: { id: string; name?: string; sort_order?: number },
): Promise<LeadOption> {
  if (context.role !== "owner" && context.role !== "super_admin") {
    throw new Error("Unauthorized: Only workspace Owners can edit lead options.");
  }
  const wsId = getTargetWorkspaceId(undefined, context);

  const option = await queryOne<LeadOption>("SELECT * FROM lead_options WHERE id = ?", [data.id]);
  if (!option) throw new Error("Lead option not found.");
  if (context.role !== "super_admin" && option.workspace_id !== wsId) {
    throw new Error("FORBIDDEN: Cross-workspace access denied.");
  }

  let newName = option.name;
  if (data.name !== undefined) {
    newName = data.name.trim();
    if (!newName) throw new Error("Option name cannot be empty.");
    if (newName.length > 128) throw new Error("Option name cannot exceed 128 characters.");

    const dup = await queryOne<LeadOption>(
      "SELECT id FROM lead_options WHERE workspace_id = ? AND type = ? AND LOWER(name) = LOWER(?) AND id != ? LIMIT 1",
      [option.workspace_id, option.type, newName, option.id],
    );
    if (dup) {
      throw new Error(`An option named "${newName}" already exists for this category.`);
    }
  }

  const newSortOrder = data.sort_order !== undefined ? Number(data.sort_order) : option.sort_order;

  await execute(
    "UPDATE lead_options SET name = ?, sort_order = ?, updated_by = ? WHERE id = ?",
    [newName, newSortOrder, context.userId, option.id],
  );

  await execute(
    `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata)
     VALUES (?, ?, ?, ?, 'LEAD_OPTION_UPDATED', 'lead_option', ?, ?)`,
    [
      uuid(),
      option.workspace_id,
      context.userId,
      context.role,
      option.id,
      JSON.stringify({
        type: option.type,
        old_name: option.name,
        new_name: newName,
        old_sort_order: option.sort_order,
        new_sort_order: newSortOrder,
      }),
    ],
  );

  return (await queryOne<LeadOption>("SELECT * FROM lead_options WHERE id = ?", [option.id]))!;
}

export const updateLeadOptionFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string; name?: string; sort_order?: number }) => input)
  .handler(async ({ data, context }) => updateLeadOptionCore(context, data));

export async function setLeadOptionActiveCore(
  context: CrmServerAuthContext,
  data: { id: string; isActive: boolean },
): Promise<LeadOption> {
  if (context.role !== "owner" && context.role !== "super_admin") {
    throw new Error("Unauthorized: Only workspace Owners can activate/deactivate lead options.");
  }
  const wsId = getTargetWorkspaceId(undefined, context);

  const option = await queryOne<LeadOption>("SELECT * FROM lead_options WHERE id = ?", [data.id]);
  if (!option) throw new Error("Lead option not found.");
  if (context.role !== "super_admin" && option.workspace_id !== wsId) {
    throw new Error("FORBIDDEN: Cross-workspace access denied.");
  }

  const newActive = data.isActive ? 1 : 0;
  await execute("UPDATE lead_options SET is_active = ?, updated_by = ? WHERE id = ?", [
    newActive,
    context.userId,
    option.id,
  ]);

  const action = data.isActive ? "LEAD_OPTION_REACTIVATED" : "LEAD_OPTION_DEACTIVATED";
  await execute(
    `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata)
     VALUES (?, ?, ?, ?, ?, 'lead_option', ?, ?)`,
    [
      uuid(),
      option.workspace_id,
      context.userId,
      context.role,
      action,
      option.id,
      JSON.stringify({ type: option.type, name: option.name, is_active: Boolean(newActive) }),
    ],
  );

  return (await queryOne<LeadOption>("SELECT * FROM lead_options WHERE id = ?", [option.id]))!;
}

export const setLeadOptionActiveFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string; isActive: boolean }) => input)
  .handler(async ({ data, context }) => setLeadOptionActiveCore(context, data));

export async function deleteLeadOptionCore(
  context: CrmServerAuthContext,
  data: { id: string },
): Promise<{ ok: boolean }> {
  if (context.role !== "owner" && context.role !== "super_admin") {
    throw new Error("Unauthorized: Only workspace Owners can delete lead options.");
  }
  const wsId = getTargetWorkspaceId(undefined, context);

  const option = await queryOne<LeadOption>("SELECT * FROM lead_options WHERE id = ?", [data.id]);
  if (!option) throw new Error("Lead option not found.");
  if (context.role !== "super_admin" && option.workspace_id !== wsId) {
    throw new Error("FORBIDDEN: Cross-workspace access denied.");
  }

  if (option.is_system) {
    throw new Error("System options cannot be deleted. You can deactivate them instead.");
  }

  // Check if any leads reference this option
  const refCount = await queryOne<{ total: number }>(
    `SELECT COUNT(*) AS total FROM leads WHERE workspace_id = ? AND (
      source_option_id = ? OR
      location_option_id = ? OR
      purpose_option_id = ? OR
      possession_timeline_option_id = ? OR
      transaction_timeline_option_id = ? OR
      phase_option_id = ?
    )`,
    [option.workspace_id, option.id, option.id, option.id, option.id, option.id, option.id],
  );

  if (refCount && refCount.total > 0) {
    throw new Error(
      `This option is referenced by ${refCount.total} lead(s) and cannot be deleted. Please deactivate it instead to preserve historical records.`,
    );
  }

  await execute("DELETE FROM lead_options WHERE id = ?", [option.id]);

  await execute(
    `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata)
     VALUES (?, ?, ?, ?, 'LEAD_OPTION_DELETED', 'lead_option', ?, ?)`,
    [
      uuid(),
      option.workspace_id,
      context.userId,
      context.role,
      option.id,
      JSON.stringify({ type: option.type, name: option.name }),
    ],
  );

  return { ok: true };
}

export const deleteLeadOptionFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data, context }) => deleteLeadOptionCore(context, data));

export async function deleteLeadCore(
  context: CrmServerAuthContext,
  data: { id: string },
): Promise<{ ok: boolean }> {
  checkDeleteRole(context);
  const wsId = getTargetWorkspaceId(undefined, context);
  const existing = await queryOne<Lead>("SELECT id, name FROM leads WHERE id = ?", [data.id]);
  if (context.role !== "super_admin") {
    await execute("DELETE FROM leads WHERE id = ? AND workspace_id = ?", [data.id, wsId]);
  } else {
    await execute("DELETE FROM leads WHERE id = ?", [data.id]);
  }

  // Audit log
  await execute(
    `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata, status)
     VALUES (?, ?, ?, ?, 'lead.deleted', 'lead', ?, ?, 'success')`,
    [
      uuid(),
      wsId,
      context.userId,
      context.role,
      data.id,
      JSON.stringify({ name: existing?.name ?? data.id }),
    ],
  );

  return { ok: true };
}

export const deleteLeadFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data, context }) => deleteLeadCore(context, data));

export const convertLeadToCustomerFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { leadId: string }) => input)
  .handler(
    async ({
      data,
      context,
    }): Promise<{ customer: Customer; alreadyConverted: boolean; isNew: boolean }> => {
      const wsId = getTargetWorkspaceId(undefined, context);

      const lead =
        context.role === "super_admin"
          ? await queryOne<Lead>("SELECT * FROM leads WHERE id = ?", [data.leadId])
          : await queryOne<Lead>("SELECT * FROM leads WHERE id = ? AND workspace_id = ?", [
              data.leadId,
              wsId,
            ]);

      if (!lead) {
        throw new Error("Lead not found.");
      }

      if (lead.customer_id) {
        const existingCustomer = await queryOne<Customer>("SELECT * FROM customers WHERE id = ?", [
          lead.customer_id,
        ]);
        if (existingCustomer) {
          return { customer: existingCustomer, alreadyConverted: true, isNew: false };
        }
      }

      return transaction(async (conn) => {
        let matchingCustomer: Customer | null = null;
        const leadPhone = lead.phone ? lead.phone.trim() : null;
        const leadEmail = lead.email ? lead.email.trim().toLowerCase() : null;

        if (leadPhone || leadEmail) {
          const [rows] = await conn.execute(
            `SELECT * FROM customers 
             WHERE workspace_id = ? 
               AND (
                 (? IS NOT NULL AND phone IS NOT NULL AND phone != '' AND phone = ?)
                 OR
                 (? IS NOT NULL AND email IS NOT NULL AND email != '' AND LOWER(email) = ?)
               )
             LIMIT 1`,
            [lead.workspace_id, leadPhone, leadPhone, leadEmail, leadEmail],
          );
          const customers = rows as Customer[];
          if (customers.length > 0) {
            matchingCustomer = customers[0]!;
          }
        }

        let customer: Customer;
        let isNew = false;

        if (matchingCustomer) {
          customer = matchingCustomer;
          // Backfill customer fields if empty/default
          const updateSets: string[] = [];
          const updateVals: any[] = [];
          if ((!customer.value || customer.value === 0) && lead.budget && lead.budget > 0) {
            updateSets.push("value = ?");
            updateVals.push(lead.budget);
          }
          if (!customer.assigned_to && lead.assigned_to) {
            updateSets.push("assigned_to = ?");
            updateVals.push(lead.assigned_to);
          }
          if (updateSets.length > 0) {
            updateSets.push("updated_at = NOW()");
            updateVals.push(customer.id);
            await conn.execute(
              `UPDATE customers SET ${updateSets.join(", ")} WHERE id = ?`,
              updateVals,
            );
            const [refreshed] = await conn.execute("SELECT * FROM customers WHERE id = ?", [
              customer.id,
            ]);
            customer = (refreshed as Customer[])[0]!;
          }
        } else {
          const newCustId = uuid();
          isNew = true;

          // Attempt to extract city/location from interested property if present
          let cityLocation: string | null = null;
          if (lead.property_id) {
            const [propRows] = await conn.execute("SELECT location FROM properties WHERE id = ?", [
              lead.property_id,
            ]);
            const props = propRows as { location: string | null }[];
            if (props.length > 0 && props[0]?.location) {
              cityLocation = props[0].location;
            }
          }

          const notesParts: string[] = [];
          notesParts.push(`Converted from Lead: ${lead.name}`);
          if (lead.requirement) notesParts.push(`Requirement: ${lead.requirement}`);
          if (lead.source) notesParts.push(`Source: ${lead.source}`);
          if (lead.campaign) notesParts.push(`Campaign: ${lead.campaign}`);
          if (lead.score) notesParts.push(`Lead Score: ${lead.score}/100`);
          if (lead.notes) notesParts.push(`Lead Notes: ${lead.notes}`);
          const noteStr = notesParts.join(" | ");

          const tagsArr = [lead.source, "Converted Lead"].filter(Boolean);

          await conn.execute(
            `INSERT INTO customers (id, workspace_id, name, phone, email, type, status, city, currency, value, tags, notes, assigned_to, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              newCustId,
              lead.workspace_id,
              lead.name,
              lead.phone ?? null,
              lead.email ?? null,
              "Buyer",
              "Active",
              cityLocation,
              lead.currency ?? "INR",
              lead.budget ?? 0,
              JSON.stringify(tagsArr),
              noteStr,
              lead.assigned_to ?? null,
              context.userId ?? null,
            ],
          );

          const [newRows] = await conn.execute("SELECT * FROM customers WHERE id = ?", [newCustId]);
          customer = (newRows as Customer[])[0]!;
        }

        const candidateWonLead = {
          ...lead,
          status: "Won",
          customer_id: customer.id,
        };
        const wonScore = calculateLeadScore(candidateWonLead as Lead).total;

        await conn.execute(
          "UPDATE leads SET customer_id = ?, status = 'Won', score = ?, converted_at = NOW(), updated_at = NOW() WHERE id = ?",
          [customer.id, wonScore, lead.id],
        );

        await conn.execute(
          "UPDATE tasks SET customer_id = ? WHERE lead_id = ? AND customer_id IS NULL",
          [customer.id, lead.id],
        );
        await conn.execute(
          "UPDATE calendar_events SET customer_id = ? WHERE lead_id = ? AND customer_id IS NULL",
          [customer.id, lead.id],
        );

        const actId = uuid();
        const activityNote = isNew
          ? `Lead converted into new Customer profile "${customer.name}".`
          : `Lead linked to existing Customer "${customer.name}".`;

        await conn.execute(
          `INSERT INTO lead_activities (id, workspace_id, lead_id, type, note, actor_id, actor_label)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            actId,
            lead.workspace_id,
            lead.id,
            "Converted to Customer",
            activityNote,
            context.userId ?? null,
            context.role ?? "User",
          ],
        );

        // Fire notifications after conversion (outside transaction is fine — best-effort)
        // We do it inside the transaction callback but after the main writes
        if (lead.assigned_to && lead.assigned_to !== context.userId) {
          await createNotificationInternal({
            workspaceId: lead.workspace_id,
            userId: lead.assigned_to,
            type: "lead_converted",
            title: `Lead "${lead.name}" converted to Customer`,
            message: activityNote,
            entityType: "customer",
            entityId: customer.id,
            createdBy: context.userId,
          }).catch(() => {});
        }

        // Audit log
        await conn.execute(
          `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata, status)
           VALUES (?, ?, ?, ?, 'lead.converted', 'lead', ?, ?, 'success')`,
          [
            uuid(),
            lead.workspace_id,
            context.userId ?? "system",
            context.role ?? "user",
            lead.id,
            JSON.stringify({ lead_name: lead.name, customer_id: customer.id, customer_name: customer.name, is_new: isNew }),
          ],
        );

        return { customer, alreadyConverted: false, isNew };
      });
    },
  );

export const listLeadActivityFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { leadId: string }) => input)
  .handler(async ({ data }): Promise<LeadActivity[]> => {
    return query<LeadActivity>(
      "SELECT * FROM lead_activities WHERE lead_id = ? ORDER BY created_at DESC",
      [data.leadId],
    );
  });

export const logLeadActivityFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator(
    (input: Partial<LeadActivity> & { workspace_id: string; lead_id: string; type: string }) =>
      input,
  )
  .handler(async ({ data, context }): Promise<LeadActivity> => {
    const wsId = getTargetWorkspaceId(data.workspace_id, context);
    const id = uuid();
    await execute(
      `INSERT INTO lead_activities (id, workspace_id, lead_id, type, note, actor_id, actor_label)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        wsId,
        data.lead_id,
        data.type,
        data.note ?? null,
        data.actor_id ?? null,
        data.actor_label ?? null,
      ],
    );
    return (await queryOne<LeadActivity>("SELECT * FROM lead_activities WHERE id = ?", [id]))!;
  });

export const deleteLeadActivityFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    checkDeleteRole(context);
    await execute("DELETE FROM lead_activities WHERE id = ?", [data.id]);
    return { ok: true };
  });

/* ----------------------------------- tasks -------------------------------- */

export const listTasksFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string }) => input)
  .handler(async ({ data, context }): Promise<Task[]> => {
    const wsId = getTargetWorkspaceId(data.workspaceId, context);
    const ef = employeeFilter(context);
    return query<Task>(
      `SELECT * FROM tasks WHERE workspace_id = ?${ef.sql} ORDER BY CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at ASC`,
      [wsId, ...ef.params],
    );
  });

export const createTaskFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: Partial<Task> & { workspace_id: string; title: string }) => input)
  .handler(async ({ data, context }): Promise<Task> => {
    const wsId = getTargetWorkspaceId(data.workspace_id, context);
    const id = uuid();
    const dueAt = data.due_at ?? getDefaultQuickAddDueDateTime();
    const creatorId = context.userId || data.created_by || null;
    let assignedTo = data.assigned_to ?? null;
    // When employee creates task: Created By = Employee, Assigned To = Employee (persisted in MySQL)
    if (isEmployee(context) && creatorId) {
      assignedTo = creatorId;
    }

    await execute(
      `INSERT INTO tasks (id, workspace_id, title, description, due_at, priority, status, assigned_to, assigned_at, lead_id, customer_id, property_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        wsId,
        data.title,
        data.description ?? null,
        dueAt,
        data.priority ?? "Medium",
        data.status ?? "Open",
        assignedTo,
        assignedTo ? new Date().toISOString().slice(0, 19).replace("T", " ") : null,
        data.lead_id ?? null,
        data.customer_id ?? null,
        data.property_id ?? null,
        creatorId,
      ],
    );
    const newTask = (await queryOne<Task>("SELECT * FROM tasks WHERE id = ?", [id]))!;

    // Notify assigned employee when a task is assigned to them
    if (assignedTo && assignedTo !== context.userId) {
      await createNotificationInternal({
        workspaceId: wsId,
        userId: assignedTo,
        type: "task_assigned",
        title: `Task "${data.title}" assigned to you`,
        message: data.description ?? null,
        entityType: "task",
        entityId: id,
        createdBy: context.userId,
      });
    }

    return newTask;
  });

export const updateTaskFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string; patch: Partial<Task> }) => input)
  .handler(async ({ data, context }): Promise<Task> => {
    const wsId = getTargetWorkspaceId(undefined, context);

    // 1. Fetch existing to detect assignment change & check permissions
    const existing = await queryOne<Task>("SELECT * FROM tasks WHERE id = ?", [data.id]);
    if (!existing) throw new Error("Task not found");

    // Employee isolation check
    if (isEmployee(context)) {
      if (existing.assigned_to !== context.userId && existing.created_by !== context.userId) {
        throw new Error("Unauthorized: You do not have access to update this task.");
      }
    }

    // If assigned_to is changing, verify authorization & inject assigned_at
    if (data.patch.assigned_to !== undefined && data.patch.assigned_to !== existing.assigned_to) {
      if (isEmployee(context)) {
        throw new Error("Unauthorized: Only owners or managers can assign or reassign tasks.");
      }
      (data.patch as any).assigned_at = data.patch.assigned_to
        ? new Date().toISOString().slice(0, 19).replace("T", " ")
        : null;
    }

    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [key, val] of Object.entries(data.patch)) {
      if (key === "id" || key === "created_at" || key === "workspace_id") continue;
      sets.push(`\`${key}\` = ?`);
      vals.push(val);
    }
    if (sets.length === 0) return existing;

    vals.push(data.id);
    if (context.role !== "super_admin") {
      vals.push(wsId);
      await execute(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ? AND workspace_id = ?`, vals);
    } else {
      await execute(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`, vals);
    }
    const updated = (await queryOne<Task>("SELECT * FROM tasks WHERE id = ?", [data.id]))!;

    // Notify if assignment changed
    if (data.patch.assigned_to && data.patch.assigned_to !== existing.assigned_to) {
      if (data.patch.assigned_to !== context.userId) {
        await createNotificationInternal({
          workspaceId: wsId,
          userId: data.patch.assigned_to as string,
          type: "task_assigned",
          title: `Task "${updated.title}" assigned to you`,
          message: updated.description ?? null,
          entityType: "task",
          entityId: data.id,
          createdBy: context.userId,
        });
      }
    }

    return updated;
  });

export const deleteTaskFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    checkDeleteRole(context);
    const wsId = getTargetWorkspaceId(undefined, context);
    if (context.role !== "super_admin") {
      await execute("DELETE FROM tasks WHERE id = ? AND workspace_id = ?", [data.id, wsId]);
    } else {
      await execute("DELETE FROM tasks WHERE id = ?", [data.id]);
    }
    return { ok: true };
  });

/* -------------------------------- calendar -------------------------------- */

export const listEventsFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string }) => input)
  .handler(async ({ data, context }): Promise<CalendarEvent[]> => {
    const wsId = getTargetWorkspaceId(data.workspaceId, context);
    const ef = employeeFilter(context);
    return query<CalendarEvent>(
      `SELECT * FROM calendar_events WHERE workspace_id = ?${ef.sql} ORDER BY start_at ASC`,
      [wsId, ...ef.params],
    );
  });

export const createEventFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator(
    (
      input: Partial<CalendarEvent> & {
        workspace_id: string;
        title: string;
        start_at: string;
      },
    ) => input,
  )
  .handler(async ({ data }): Promise<CalendarEvent> => {
    const id = uuid();
    await execute(
      `INSERT INTO calendar_events (id, workspace_id, title, type, status, start_at, end_at, location, notes, lead_id, customer_id, property_id, assigned_to, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.workspace_id,
        data.title,
        data.type ?? "Meeting",
        data.status ?? "Scheduled",
        data.start_at,
        data.end_at ?? null,
        data.location ?? null,
        data.notes ?? null,
        data.lead_id ?? null,
        data.customer_id ?? null,
        data.property_id ?? null,
        data.assigned_to ?? null,
        data.created_by ?? null,
      ],
    );
    return (await queryOne<CalendarEvent>("SELECT * FROM calendar_events WHERE id = ?", [id]))!;
  });

export const updateEventFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string; patch: Partial<CalendarEvent> }) => input)
  .handler(async ({ data }): Promise<CalendarEvent> => {
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [key, val] of Object.entries(data.patch)) {
      if (key === "id" || key === "created_at" || key === "workspace_id") continue;
      sets.push(`\`${key}\` = ?`);
      vals.push(val);
    }
    if (sets.length === 0)
      return (await queryOne<CalendarEvent>("SELECT * FROM calendar_events WHERE id = ?", [
        data.id,
      ]))!;
    vals.push(data.id);
    await execute(`UPDATE calendar_events SET ${sets.join(", ")} WHERE id = ?`, vals);
    return (await queryOne<CalendarEvent>("SELECT * FROM calendar_events WHERE id = ?", [
      data.id,
    ]))!;
  });

export const deleteEventFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    await execute("DELETE FROM calendar_events WHERE id = ?", [data.id]);
    return { ok: true };
  }); /* --------------------------------- finance -------------------------------- */

export const listInvoicesFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string }) => input)
  .handler(async ({ data, context }): Promise<Invoice[]> => {
    const wsId = getTargetWorkspaceId(data.workspaceId, context);
    await assertPermission(context, "finance.view", wsId);

    return query<Invoice>(
      `SELECT i.*, 
              c.name as customer_name, c.email as customer_email, c.phone as customer_phone, c.city as customer_city,
              l.name as lead_name,
              p.name as property_name,
              cb.full_name as created_by_name,
              cb.full_name as creator_name,
              at.full_name as assigned_to_name,
              at.full_name as assignee_name,
              ub.full_name as updated_by_name
       FROM invoices i
       LEFT JOIN customers c ON i.customer_id = c.id
       LEFT JOIN leads l ON i.lead_id = l.id
       LEFT JOIN properties p ON i.property_id = p.id
       LEFT JOIN profiles cb ON i.created_by = cb.id
       LEFT JOIN profiles at ON i.assigned_to = at.id
       LEFT JOIN profiles ub ON i.updated_by = ub.id
       WHERE i.workspace_id = ?
       ORDER BY i.issue_date DESC, i.created_at DESC`,
      [wsId],
    );
  });

export const getInvoiceFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string }) => input)
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      invoice: Invoice;
      items: InvoiceItem[];
      payments: Payment[];
      activities: AuditLog[];
    } | null> => {
      const invoice = await queryOne<Invoice>(
        `SELECT i.*, 
                c.name as customer_name, c.email as customer_email, c.phone as customer_phone, c.city as customer_city,
                l.name as lead_name,
                p.name as property_name,
                cb.full_name as created_by_name,
                cb.full_name as creator_name,
                at.full_name as assigned_to_name,
                at.full_name as assignee_name,
                ub.full_name as updated_by_name,
                cl.full_name as cancelled_by_name
         FROM invoices i
         LEFT JOIN customers c ON i.customer_id = c.id
         LEFT JOIN leads l ON i.lead_id = l.id
         LEFT JOIN properties p ON i.property_id = p.id
         LEFT JOIN profiles cb ON i.created_by = cb.id
         LEFT JOIN profiles at ON i.assigned_to = at.id
         LEFT JOIN profiles ub ON i.updated_by = ub.id
         LEFT JOIN profiles cl ON i.cancelled_by = cl.id
         WHERE i.id = ? LIMIT 1`,
        [data.id],
      );
      if (!invoice) return null;

      await assertPermission(context, "finance.view", invoice.workspace_id);

      const items = await query<InvoiceItem>(
        "SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY position ASC",
        [data.id],
      );

      const payments = await query<Payment>(
        `SELECT p.*,
                cb.full_name as created_by_name,
                cb.full_name as creator_name,
                at.full_name as assigned_to_name,
                at.full_name as assignee_name,
                rb.full_name as reversed_by_name
         FROM payments p
         LEFT JOIN profiles cb ON p.created_by = cb.id
         LEFT JOIN profiles at ON p.assigned_to = at.id
         LEFT JOIN profiles rb ON p.reversed_by = rb.id
         WHERE p.invoice_id = ?
         ORDER BY p.paid_at DESC`,
        [data.id],
      );

      const activities = await query<AuditLog>(
        `SELECT * FROM audit_logs 
         WHERE workspace_id = ? AND entity_type = 'invoice' AND entity_id = ? 
         ORDER BY created_at DESC LIMIT 20`,
        [invoice.workspace_id, data.id],
      );

      return { invoice, items, payments, activities };
    },
  );

export const nextInvoiceNumberFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string }) => input)
  .handler(
    async ({
      data,
      context,
    }): Promise<{ invoiceNumber: string; prefix: string; financialYear: string }> => {
      const wsId = getTargetWorkspaceId(data.workspaceId, context);
      await assertPermission(context, "finance.invoices.create", wsId);

      // Concurrency-safe: run inside a transaction with SELECT FOR UPDATE
      return transaction(async (conn) => {
        const [wsRows] = await conn.execute(
          "SELECT invoice_prefix FROM workspaces WHERE id = ? LIMIT 1",
          [wsId],
        );
        const ws = (wsRows as any[])[0];
        const prefix = ws?.invoice_prefix?.trim() || "INV";

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const fyStart = currentMonth >= 4 ? currentYear : currentYear - 1;
        const fyEnd = (fyStart + 1) % 100;
        const financialYear = `${fyStart}-${String(fyEnd).padStart(2, "0")}`;

        // Lock the invoices table rows for this workspace to prevent race conditions
        const [rows] = await conn.execute(
          "SELECT invoice_number FROM invoices WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100 FOR UPDATE",
          [wsId],
        );

        let maxSeq = 0;
        for (const r of rows as any[]) {
          const num = r.invoice_number ?? "";
          const m = /(\d+)\s*$/.exec(num);
          if (m?.[1]) {
            maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
          }
        }

        const nextSeq = String(maxSeq + 1).padStart(4, "0");
        const invoiceNumber = `${prefix}-${currentYear}-${nextSeq}`;

        return { invoiceNumber, prefix, financialYear };
      });
    },
  );

export const saveInvoiceFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator(
    (input: {
      id?: string;
      workspaceId: string;
      invoice: {
        invoice_number: string;
        financial_year?: string | null;
        invoice_type?: string;
        customer_id?: string | null;
        lead_id?: string | null;
        property_id?: string | null;
        assigned_to?: string | null;
        status?: string;
        issue_date: string;
        due_date?: string | null;
        currency?: string;
        tax_rate?: number;
        place_of_supply?: string | null;
        notes?: string | null;
        terms?: string | null;
      };
      lines: InvoiceLineInput[];
    }) => input,
  )
  .handler(async ({ data, context }): Promise<Invoice> => {
    const wsId = getTargetWorkspaceId(data.workspaceId, context);
    const isNew = !data.id;
    await assertPermission(
      context,
      isNew ? "finance.invoices.create" : "finance.invoices.edit",
      wsId,
    );

    // Multi-tenant object ownership checks
    if (data.invoice.customer_id) {
      const cust = await queryOne<{ id: string }>(
        "SELECT id FROM customers WHERE id = ? AND workspace_id = ? LIMIT 1",
        [data.invoice.customer_id, wsId],
      );
      if (!cust) throw new Error("Validation error: Customer does not belong to this workspace.");
    }
    if (data.invoice.lead_id) {
      const ld = await queryOne<{ id: string }>(
        "SELECT id FROM leads WHERE id = ? AND workspace_id = ? LIMIT 1",
        [data.invoice.lead_id, wsId],
      );
      if (!ld) throw new Error("Validation error: Lead does not belong to this workspace.");
    }
    if (data.invoice.property_id) {
      const prop = await queryOne<{ id: string }>(
        "SELECT id FROM properties WHERE id = ? AND workspace_id = ? LIMIT 1",
        [data.invoice.property_id, wsId],
      );
      if (!prop) throw new Error("Validation error: Property does not belong to this workspace.");
    }
    if (data.invoice.assigned_to) {
      const assignee = await queryOne<{ id: string }>(
        "SELECT id FROM profiles WHERE id = ? AND workspace_id = ? LIMIT 1",
        [data.invoice.assigned_to, wsId],
      );
      if (!assignee)
        throw new Error("Validation error: Assigned employee does not belong to this workspace.");
    }

    // Phase 6: Server-side GST inter-state detection.
    // Load workspace state_code to determine CGST/SGST vs IGST.
    const wsData = await queryOne<{ state_code: string | null }>(
      "SELECT state_code FROM workspaces WHERE id = ? LIMIT 1",
      [wsId],
    );
    const wsStateCode = wsData?.state_code?.trim().toUpperCase() || "";
    const posStateCode = (data.invoice.place_of_supply || "").trim().toUpperCase();
    // Inter-state if: both codes present and they differ, OR place_of_supply starts with different digits than ws state
    const isInterState =
      !!wsStateCode &&
      !!posStateCode &&
      posStateCode !== wsStateCode &&
      !posStateCode.startsWith(wsStateCode);

    const calc = computeInvoiceTotals(data.lines, data.invoice.tax_rate ?? 18, isInterState);

    return transaction(async (conn) => {
      let invoiceId: string;

      if (data.id) {
        invoiceId = data.id;
        const [existingRows] = await conn.execute(
          "SELECT id, status, workspace_id FROM invoices WHERE id = ? LIMIT 1",
          [invoiceId],
        );
        const existing = (existingRows as any[])[0];
        if (!existing) throw new Error("Invoice not found.");
        if (existing.workspace_id !== wsId) throw new Error("Unauthorized invoice access.");
        if (existing.status !== "Draft") {
          throw new Error(
            "Only draft invoices can be edited directly. Historical financial values are protected.",
          );
        }

        await conn.execute(
          `UPDATE invoices SET 
            invoice_number = ?, financial_year = ?, invoice_type = ?,
            customer_id = ?, lead_id = ?, property_id = ?, assigned_to = ?, updated_by = ?,
            status = ?, issue_date = ?, due_date = ?, currency = ?,
            tax_rate = ?, subtotal = ?, discount = ?, taxable_amount = ?,
            cgst = ?, sgst = ?, igst = ?, cess = ?, tax_amount = ?, total = ?,
            place_of_supply = ?, notes = ?, terms = ?
           WHERE id = ?`,
          [
            data.invoice.invoice_number,
            data.invoice.financial_year || null,
            data.invoice.invoice_type || "Tax Invoice",
            data.invoice.customer_id || null,
            data.invoice.lead_id || null,
            data.invoice.property_id || null,
            data.invoice.assigned_to || null,
            context.userId,
            data.invoice.status || existing.status,
            data.invoice.issue_date,
            data.invoice.due_date || null,
            data.invoice.currency || "INR",
            calc.effectiveTaxRate,
            calc.subtotal,
            calc.discount,
            calc.taxableAmount,
            calc.cgst,
            calc.sgst,
            calc.igst,
            calc.cess,
            calc.taxAmount,
            calc.total,
            data.invoice.place_of_supply || null,
            data.invoice.notes || null,
            data.invoice.terms || null,
            invoiceId,
          ],
        );

        await conn.execute("DELETE FROM invoice_items WHERE invoice_id = ?", [invoiceId]);

        await conn.execute(
          `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            uuid(),
            wsId,
            context.userId,
            context.role,
            "invoice.update",
            "invoice",
            invoiceId,
            JSON.stringify({ invoice_number: data.invoice.invoice_number, total: calc.total }),
          ],
        );
      } else {
        invoiceId = uuid();
        await conn.execute(
          `INSERT INTO invoices (
            id, workspace_id, invoice_number, financial_year, invoice_type,
            customer_id, lead_id, property_id, created_by, assigned_to, updated_by,
            status, issue_date, due_date, currency,
            tax_rate, subtotal, discount, taxable_amount,
            cgst, sgst, igst, cess, tax_amount, total,
            place_of_supply, notes, terms
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            invoiceId,
            wsId,
            data.invoice.invoice_number,
            data.invoice.financial_year || null,
            data.invoice.invoice_type || "Tax Invoice",
            data.invoice.customer_id || null,
            data.invoice.lead_id || null,
            data.invoice.property_id || null,
            context.userId,
            data.invoice.assigned_to || null,
            context.userId,
            data.invoice.status || "Draft",
            data.invoice.issue_date,
            data.invoice.due_date || null,
            data.invoice.currency || "INR",
            calc.effectiveTaxRate,
            calc.subtotal,
            calc.discount,
            calc.taxableAmount,
            calc.cgst,
            calc.sgst,
            calc.igst,
            calc.cess,
            calc.taxAmount,
            calc.total,
            data.invoice.place_of_supply || null,
            data.invoice.notes || null,
            data.invoice.terms || null,
          ],
        );

        await conn.execute(
          `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            uuid(),
            wsId,
            context.userId,
            context.role,
            "invoice.create",
            "invoice",
            invoiceId,
            JSON.stringify({ invoice_number: data.invoice.invoice_number, total: calc.total }),
          ],
        );
      }

      for (let i = 0; i < data.lines.length; i++) {
        const l = data.lines[i]!;
        const qty = Number(l.quantity) || 1;
        const rate = Number(l.rate ?? l.unit_amount ?? 0);
        const disc = Number(l.discount) || 0;
        const lineTaxRate = Number(l.tax_rate ?? data.invoice.tax_rate ?? 0);
        const lineTaxable = Math.max(0, qty * rate - disc);
        const lineTaxAmt = Math.round(lineTaxable * lineTaxRate) / 100;
        const lineTotal = lineTaxable + lineTaxAmt;

        await conn.execute(
          `INSERT INTO invoice_items (
            id, workspace_id, invoice_id, description, hsn_sac,
            quantity, unit, rate, unit_amount, discount,
            tax_rate, tax_type, tax_amount, line_total, amount, position
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            uuid(),
            wsId,
            invoiceId,
            l.description,
            l.hsn_sac || null,
            qty,
            l.unit || "Units",
            rate,
            rate,
            disc,
            lineTaxRate,
            l.tax_type || "GST",
            lineTaxAmt,
            lineTotal,
            lineTotal,
            i,
          ],
        );
      }

      const [rows] = await conn.execute("SELECT * FROM invoices WHERE id = ? LIMIT 1", [invoiceId]);
      return (rows as Invoice[])[0]!;
    });
  });

export const updateInvoiceStatusFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string; status: string }) => input)
  .handler(async ({ data, context }): Promise<Invoice> => {
    const invoice = await queryOne<Invoice>("SELECT * FROM invoices WHERE id = ? LIMIT 1", [
      data.id,
    ]);
    if (!invoice) throw new Error("Invoice not found.");

    const wsId = invoice.workspace_id;
    if (context.role !== "super_admin" && context.workspaceId !== wsId) {
      throw new Error("FORBIDDEN: Cross-workspace access denied.");
    }

    // Normalize legacy "Sent" to canonical "Issued"
    const targetStatus = data.status === "Sent" ? "Issued" : data.status;

    if (invoice.status === "Cancelled") {
      throw new Error("Cancelled invoices cannot be transitioned to another status.");
    }

    if (targetStatus === "Paid" || targetStatus === "Partially Paid") {
      throw new Error(
        "Invoices can only transition to Paid or Partially Paid through payment recording and reconciliation.",
      );
    }

    if (targetStatus === "Issued") {
      if (invoice.status !== "Draft") {
        throw new Error(
          `Cannot issue an invoice with status '${invoice.status}'. Only Draft invoices can be issued.`,
        );
      }
      await assertPermission(context, "finance.invoices.issue", wsId);
    } else if (targetStatus === "Cancelled") {
      await assertPermission(context, "finance.invoices.cancel", wsId);
    } else if (targetStatus === "Draft") {
      if (invoice.status !== "Draft") {
        throw new Error("Issued or active invoices cannot be reverted to Draft.");
      }
      await assertPermission(context, "finance.invoices.edit", wsId);
    } else {
      await assertPermission(context, "finance.invoices.edit", wsId);
    }

    await execute("UPDATE invoices SET status = ?, updated_by = ? WHERE id = ?", [
      targetStatus,
      context.userId,
      data.id,
    ]);

    await execute(
      `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        wsId,
        context.userId,
        context.role,
        targetStatus === "Issued" ? "invoice.issue" : "invoice.status_change",
        "invoice",
        data.id,
        JSON.stringify({ from: invoice.status, to: targetStatus }),
      ],
    );

    return (await queryOne<Invoice>("SELECT * FROM invoices WHERE id = ?", [data.id]))!;
  });

export const cancelInvoiceFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string; reason: string }) => input)
  .handler(async ({ data, context }): Promise<Invoice> => {
    if (!data.reason?.trim()) {
      throw new Error("A cancellation reason is required.");
    }
    const invoice = await queryOne<Invoice>("SELECT * FROM invoices WHERE id = ? LIMIT 1", [
      data.id,
    ]);
    if (!invoice) throw new Error("Invoice not found.");

    await assertPermission(context, "finance.invoices.cancel", invoice.workspace_id);

    if (invoice.status === "Cancelled") {
      throw new Error("Invoice is already cancelled.");
    }

    await execute(
      `UPDATE invoices SET 
        status = 'Cancelled', cancellation_reason = ?, cancelled_at = NOW(), cancelled_by = ?, updated_by = ?
       WHERE id = ?`,
      [data.reason.trim(), context.userId, context.userId, data.id],
    );

    await execute(
      `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        invoice.workspace_id,
        context.userId,
        context.role,
        "invoice.cancel",
        "invoice",
        data.id,
        JSON.stringify({ reason: data.reason }),
      ],
    );

    return (await queryOne<Invoice>("SELECT * FROM invoices WHERE id = ?", [data.id]))!;
  });

export const deleteInvoiceFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const invoice = await queryOne<Invoice>("SELECT * FROM invoices WHERE id = ? LIMIT 1", [
      data.id,
    ]);
    if (!invoice) throw new Error("Invoice not found.");

    await assertPermission(context, "finance.invoices.delete", invoice.workspace_id);

    // Strictly enforce: ONLY Draft invoices may be deleted
    if (invoice.status !== "Draft") {
      throw new Error(
        `Financial safety policy: Only Draft invoices may be permanently deleted. Invoice '${invoice.invoice_number}' has status '${invoice.status}'. Please use Cancel/Void instead.`,
      );
    }

    await transaction(async (conn) => {
      await conn.execute("DELETE FROM invoice_items WHERE invoice_id = ?", [data.id]);
      await conn.execute("DELETE FROM invoices WHERE id = ?", [data.id]);

      await conn.execute(
        `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuid(),
          invoice.workspace_id,
          context.userId,
          context.role,
          "invoice.delete",
          "invoice",
          data.id,
          JSON.stringify({ invoice_number: invoice.invoice_number }),
        ],
      );
    });

    return { ok: true };
  });

export const listPaymentsFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string }) => input)
  .handler(async ({ data, context }): Promise<Payment[]> => {
    const wsId = getTargetWorkspaceId(data.workspaceId, context);
    await assertPermission(context, "finance.view", wsId);

    return query<Payment>(
      `SELECT p.*,
              i.invoice_number,
              c.name as customer_name,
              cb.full_name as created_by_name,
              cb.full_name as creator_name,
              at.full_name as assigned_to_name,
              at.full_name as assignee_name,
              rb.full_name as reversed_by_name
       FROM payments p
       LEFT JOIN invoices i ON p.invoice_id = i.id
       LEFT JOIN customers c ON p.customer_id = c.id
       LEFT JOIN profiles cb ON p.created_by = cb.id
       LEFT JOIN profiles at ON p.assigned_to = at.id
       LEFT JOIN profiles rb ON p.reversed_by = rb.id
       WHERE p.workspace_id = ?
       ORDER BY p.paid_at DESC`,
      [wsId],
    );
  });

export const createPaymentFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator(
    (input: {
      workspace_id: string;
      invoice_id?: string | null;
      customer_id?: string | null;
      assigned_to?: string | null;
      amount: number;
      currency?: string;
      method: string;
      status?: string;
      paid_at?: string;
      reference?: string | null;
      notes?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }): Promise<Payment> => {
    const wsId = getTargetWorkspaceId(data.workspace_id, context);
    await assertPermission(context, "finance.payments.record", wsId);

    const amount = Number(data.amount);
    if (!amount || amount <= 0) {
      throw new Error("Payment amount must be greater than zero.");
    }

    // Tenant and ownership validation
    if (data.customer_id) {
      const cust = await queryOne<{ id: string }>(
        "SELECT id FROM customers WHERE id = ? AND workspace_id = ? LIMIT 1",
        [data.customer_id, wsId],
      );
      if (!cust) throw new Error("Validation error: Customer does not belong to this workspace.");
    }

    if (data.assigned_to) {
      const assignee = await queryOne<{ id: string }>(
        "SELECT id FROM profiles WHERE id = ? AND workspace_id = ? LIMIT 1",
        [data.assigned_to, wsId],
      );
      if (!assignee)
        throw new Error("Validation error: Assigned user does not belong to this workspace.");
    }

    const id = uuid();
    const paidAt = data.paid_at || new Date().toISOString().slice(0, 19).replace("T", " ");

    return transaction(async (conn) => {
      let resolvedCustomerId = data.customer_id || null;

      if (data.invoice_id) {
        // Lock invoice row for concurrency safety and validate workspace
        const [invRows] = await conn.execute(
          "SELECT id, workspace_id, customer_id, status, total FROM invoices WHERE id = ? LIMIT 1 FOR UPDATE",
          [data.invoice_id],
        );
        const inv = (invRows as any[])[0];
        if (!inv) throw new Error("Invoice not found.");
        if (inv.workspace_id !== wsId) {
          throw new Error("Unauthorized: Invoice does not belong to this workspace.");
        }
        if (inv.status === "Cancelled") {
          throw new Error("Cannot record payment against a Cancelled invoice.");
        }
        if (!resolvedCustomerId && inv.customer_id) {
          resolvedCustomerId = inv.customer_id;
        } else if (
          resolvedCustomerId &&
          inv.customer_id &&
          resolvedCustomerId !== inv.customer_id
        ) {
          throw new Error(
            "Validation error: Payment customer does not match linked invoice customer.",
          );
        }
      }

      await conn.execute(
        `INSERT INTO payments (
          id, workspace_id, invoice_id, customer_id, assigned_to,
          amount, currency, method, status, paid_at, reference, notes, created_by, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          wsId,
          data.invoice_id || null,
          resolvedCustomerId,
          data.assigned_to || null,
          amount,
          data.currency || "INR",
          data.method || "Bank Transfer",
          data.status || "Received",
          paidAt,
          data.reference?.trim() || null,
          data.notes?.trim() || null,
          context.userId,
          context.userId,
        ],
      );

      await conn.execute(
        `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuid(),
          wsId,
          context.userId,
          context.role,
          "payment.create",
          "payment",
          id,
          JSON.stringify({ amount, method: data.method, invoice_id: data.invoice_id }),
        ],
      );

      if (data.invoice_id) {
        await reconcileInvoiceWithConn(conn, data.invoice_id);
      }

      const [rows] = await conn.execute(
        `SELECT p.*, i.invoice_number, c.name as customer_name 
         FROM payments p 
         LEFT JOIN invoices i ON p.invoice_id = i.id 
         LEFT JOIN customers c ON p.customer_id = c.id 
         WHERE p.id = ? LIMIT 1`,
        [id],
      );
      return (rows as Payment[])[0]!;
    });
  });

export const updatePaymentFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string; patch: Partial<Payment> }) => input)
  .handler(async ({ data, context }): Promise<Payment> => {
    const existing = await queryOne<Payment>("SELECT * FROM payments WHERE id = ? LIMIT 1", [
      data.id,
    ]);
    if (!existing) throw new Error("Payment not found.");

    await assertPermission(context, "finance.payments.edit", existing.workspace_id);

    // Financial safety policy: Disallow silent modification of historical amount, invoice, or customer
    if (data.patch.amount !== undefined && Number(data.patch.amount) !== Number(existing.amount)) {
      throw new Error(
        "Financial safety policy: Historical payment amount cannot be modified directly. Please reverse this payment and record a new corrected payment.",
      );
    }
    if (data.patch.invoice_id !== undefined && data.patch.invoice_id !== existing.invoice_id) {
      throw new Error(
        "Financial safety policy: Linked invoice cannot be modified directly. Please reverse this payment and record a new one.",
      );
    }
    if (data.patch.customer_id !== undefined && data.patch.customer_id !== existing.customer_id) {
      throw new Error(
        "Financial safety policy: Linked customer cannot be modified directly. Please reverse this payment and record a new one.",
      );
    }

    if (data.patch.assigned_to) {
      const assignee = await queryOne<{ id: string }>(
        "SELECT id FROM profiles WHERE id = ? AND workspace_id = ? LIMIT 1",
        [data.patch.assigned_to, existing.workspace_id],
      );
      if (!assignee)
        throw new Error("Validation error: Assigned user does not belong to this workspace.");
    }

    // Whitelist only safe editable metadata fields
    const ALLOWED_KEYS = new Set(["method", "paid_at", "reference", "notes", "assigned_to"]);
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [key, val] of Object.entries(data.patch)) {
      if (!ALLOWED_KEYS.has(key)) continue;
      sets.push(`\`${key}\` = ?`);
      vals.push(val);
    }

    if (sets.length > 0) {
      sets.push("`updated_by` = ?");
      vals.push(context.userId);
      vals.push(data.id);
      await execute(`UPDATE payments SET ${sets.join(", ")} WHERE id = ?`, vals);
    }

    if (existing.invoice_id) {
      await reconcileInvoiceInternal(existing.invoice_id);
    }

    return (await queryOne<Payment>("SELECT * FROM payments WHERE id = ?", [data.id]))!;
  });

export const reversePaymentFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string; reason: string }) => input)
  .handler(async ({ data, context }): Promise<Payment> => {
    if (!data.reason?.trim()) {
      throw new Error("Reversal reason is required.");
    }
    const payment = await queryOne<Payment>("SELECT * FROM payments WHERE id = ? LIMIT 1", [
      data.id,
    ]);
    if (!payment) throw new Error("Payment not found.");

    await assertPermission(context, "finance.payments.reverse", payment.workspace_id);

    if (payment.status === "Reversed") {
      throw new Error("Payment is already reversed.");
    }

    return transaction(async (conn) => {
      await conn.execute(
        `UPDATE payments SET 
          status = 'Reversed', reversal_reason = ?, reversed_at = NOW(), reversed_by = ?, updated_by = ?
         WHERE id = ?`,
        [data.reason.trim(), context.userId, context.userId, data.id],
      );

      await conn.execute(
        `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuid(),
          payment.workspace_id,
          context.userId,
          context.role,
          "payment.reverse",
          "payment",
          data.id,
          JSON.stringify({ reason: data.reason, amount: payment.amount }),
        ],
      );

      if (payment.invoice_id) {
        await reconcileInvoiceWithConn(conn, payment.invoice_id);
      }

      const [rows] = await conn.execute("SELECT * FROM payments WHERE id = ?", [data.id]);
      return (rows as Payment[])[0]!;
    });
  });

export const deletePaymentFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const existing = await queryOne<Payment>("SELECT * FROM payments WHERE id = ? LIMIT 1", [
      data.id,
    ]);
    if (!existing) throw new Error("Payment not found.");

    await assertPermission(context, "finance.payments.reverse", existing.workspace_id);

    if (existing.status === "Received") {
      throw new Error(
        "Financial safety policy: Received payments cannot be hard-deleted. Please use Reverse Payment instead to keep financial records audited.",
      );
    }

    await execute("DELETE FROM payments WHERE id = ?", [data.id]);
    if (existing.invoice_id) await reconcileInvoiceInternal(existing.invoice_id);
    return { ok: true };
  });

async function reconcileInvoiceWithConn(conn: any, invoiceId: string) {
  const [invRows] = await conn.execute(
    "SELECT id, total, status, due_date FROM invoices WHERE id = ? LIMIT 1",
    [invoiceId],
  );
  const inv = (invRows as any[])[0];
  if (!inv || inv.status === "Cancelled") return;

  const [payRows] = await conn.execute(
    "SELECT amount FROM payments WHERE invoice_id = ? AND status = 'Received'",
    [invoiceId],
  );
  const paidTotal = (payRows as any[]).reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const invoiceTotal = Number(inv.total || 0);

  let newStatus = inv.status;
  if (paidTotal <= 0) {
    newStatus = inv.status === "Draft" ? "Draft" : "Issued";
  } else if (paidTotal + 0.01 < invoiceTotal) {
    newStatus = "Partially Paid";
  } else {
    newStatus = "Paid";
  }

  // Check overdue: if balance > 0 and due_date passed
  if (newStatus !== "Paid" && newStatus !== "Draft" && inv.due_date) {
    const due = new Date(inv.due_date);
    if (due < new Date()) {
      newStatus = "Overdue";
    }
  }

  if (newStatus !== inv.status) {
    await conn.execute("UPDATE invoices SET status = ? WHERE id = ?", [newStatus, invoiceId]);
  }
}

async function reconcileInvoiceInternal(invoiceId: string) {
  await transaction(async (conn) => {
    await reconcileInvoiceWithConn(conn, invoiceId);
  });
}

export const reconcileInvoiceFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { invoiceId: string }) => input)
  .handler(async ({ data }) => {
    await reconcileInvoiceInternal(data.invoiceId);
    return { ok: true };
  });

export type FinanceReportsData = {
  revenueMtd: number;
  revenueYtd: number;
  totalInvoiced: number;
  totalPaid: number;
  totalOutstanding: number;
  totalOverdue: number;
  invoiceCount: number;
  paymentCount: number;
  statusDistribution: { status: string; count: number; total: number }[];
  methodDistribution: { method: string; count: number; total: number }[];
  teamAttribution: {
    userId: string;
    userName: string;
    invoicesCreated: number;
    paymentsCollected: number;
  }[];
  recentActivity: {
    id: string;
    action: string;
    actor: string;
    target: string;
    at: string;
  }[];
};

export const getFinanceReportsFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string }) => input)
  .handler(async ({ data, context }): Promise<FinanceReportsData> => {
    const wsId = getTargetWorkspaceId(data.workspaceId, context);
    await assertPermission(context, "finance.reports.view", wsId);

    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const fyStart = currentMonth >= 4 ? currentYear : currentYear - 1;
    const firstDayOfFy = `${fyStart}-04-01 00:00:00`;

    // 1. Revenue MTD & YTD (Real cash collected)
    const revMtdRow = await queryOne<{ val: number }>(
      "SELECT COALESCE(SUM(amount), 0) as val FROM payments WHERE workspace_id = ? AND status = 'Received' AND paid_at >= ?",
      [wsId, firstDayOfMonth],
    );
    const revYtdRow = await queryOne<{ val: number }>(
      "SELECT COALESCE(SUM(amount), 0) as val FROM payments WHERE workspace_id = ? AND status = 'Received' AND paid_at >= ?",
      [wsId, firstDayOfFy],
    );

    // 2. Total Invoiced & Invoice count (Excluding Draft and Cancelled)
    const invSumRow = await queryOne<{ total: number; cnt: number }>(
      "SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as cnt FROM invoices WHERE workspace_id = ? AND status NOT IN ('Draft', 'Cancelled')",
      [wsId],
    );

    // 3. Total Received & Payment count
    const paySumRow = await queryOne<{ total: number; cnt: number }>(
      "SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as cnt FROM payments WHERE workspace_id = ? AND status = 'Received'",
      [wsId],
    );

    // 4. Outstanding Receivables (Collectible balance from applicable issued/partially-paid/overdue invoices)
    // Draft invoices MUST NOT be included. Cancelled invoices MUST NOT be included.
    const outstandingRow = await queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(GREATEST(0, i.total - COALESCE(p.paid, 0))), 0) as total
       FROM invoices i
       LEFT JOIN (
         SELECT invoice_id, SUM(amount) as paid 
         FROM payments 
         WHERE workspace_id = ? AND status = 'Received' 
         GROUP BY invoice_id
       ) p ON i.id = p.invoice_id
       WHERE i.workspace_id = ? 
         AND i.status NOT IN ('Draft', 'Cancelled', 'Paid')`,
      [wsId, wsId],
    );

    // 5. Overdue Outstanding Balance (Real remaining unpaid balance of overdue invoices)
    const overdueRow = await queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(GREATEST(0, i.total - COALESCE(p.paid, 0))), 0) as total
       FROM invoices i
       LEFT JOIN (
         SELECT invoice_id, SUM(amount) as paid 
         FROM payments 
         WHERE workspace_id = ? AND status = 'Received' 
         GROUP BY invoice_id
       ) p ON i.id = p.invoice_id
       WHERE i.workspace_id = ? 
         AND (i.status = 'Overdue' OR (i.due_date IS NOT NULL AND i.due_date < CURDATE() AND i.status NOT IN ('Draft', 'Cancelled', 'Paid')))
         AND (i.total - COALESCE(p.paid, 0)) > 0`,
      [wsId, wsId],
    );

    const totalInvoiced = Number(invSumRow?.total ?? 0);
    const totalPaid = Number(paySumRow?.total ?? 0);
    const totalOutstanding = Number(outstandingRow?.total ?? 0);
    const totalOverdue = Number(overdueRow?.total ?? 0);

    // 5. Status distribution
    const statusRows = await query<{ status: string; count: number; total: number }>(
      "SELECT status, COUNT(*) as count, COALESCE(SUM(total), 0) as total FROM invoices WHERE workspace_id = ? GROUP BY status",
      [wsId],
    );

    // 6. Method distribution
    const methodRows = await query<{ method: string; count: number; total: number }>(
      "SELECT method, COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM payments WHERE workspace_id = ? AND status = 'Received' GROUP BY method",
      [wsId],
    );

    // 7. Team attribution
    const teamInvoices = await query<{ created_by: string; cnt: number }>(
      "SELECT created_by, COUNT(*) as cnt FROM invoices WHERE workspace_id = ? AND created_by IS NOT NULL GROUP BY created_by",
      [wsId],
    );
    const teamPayments = await query<{ created_by: string; total: number }>(
      "SELECT created_by, COALESCE(SUM(amount), 0) as total FROM payments WHERE workspace_id = ? AND status = 'Received' AND created_by IS NOT NULL GROUP BY created_by",
      [wsId],
    );
    const profiles = await query<{ id: string; full_name: string }>(
      "SELECT id, full_name FROM profiles WHERE workspace_id = ?",
      [wsId],
    );
    const profMap = new Map(profiles.map((p) => [p.id, p.full_name]));
    const invMap = new Map(teamInvoices.map((r) => [r.created_by, Number(r.cnt)]));
    const payMap = new Map(teamPayments.map((r) => [r.created_by, Number(r.total)]));

    const userIds = Array.from(
      new Set([...teamInvoices.map((i) => i.created_by), ...teamPayments.map((p) => p.created_by)]),
    );
    const teamAttribution = userIds.map((uid) => ({
      userId: uid,
      userName: profMap.get(uid) || "User",
      invoicesCreated: invMap.get(uid) || 0,
      paymentsCollected: payMap.get(uid) || 0,
    }));

    // 8. Recent activity
    const auditRows = await query<{
      id: string;
      action: string;
      actor_label: string;
      metadata: string;
      created_at: string;
    }>(
      `SELECT a.id, a.action, COALESCE(p.full_name, a.actor_label, 'User') as actor_label, a.metadata, a.created_at
       FROM audit_logs a
       LEFT JOIN profiles p ON a.actor_id = p.id
       WHERE a.workspace_id = ? AND (a.action LIKE '%invoice%' OR a.action LIKE '%payment%')
       ORDER BY a.created_at DESC LIMIT 15`,
      [wsId],
    );

    const recentActivity = auditRows.map((a) => {
      let meta: any = {};
      try {
        meta = JSON.parse(a.metadata || "{}");
      } catch {}
      return {
        id: a.id,
        action: a.action,
        actor: a.actor_label,
        target: meta.invoice_number || (meta.amount ? `₹${meta.amount}` : "record"),
        at: a.created_at,
      };
    });

    return {
      revenueMtd: Number(revMtdRow?.val ?? 0),
      revenueYtd: Number(revYtdRow?.val ?? 0),
      totalInvoiced,
      totalPaid,
      totalOutstanding,
      totalOverdue,
      invoiceCount: Number(invSumRow?.cnt ?? 0),
      paymentCount: Number(paySumRow?.cnt ?? 0),
      statusDistribution: statusRows.map((s) => ({
        status: s.status,
        count: Number(s.count),
        total: Number(s.total),
      })),
      methodDistribution: methodRows.map((m) => ({
        method: m.method,
        count: Number(m.count),
        total: Number(m.total),
      })),
      teamAttribution,
      recentActivity,
    };
  });

/* ----------------------------- platform config ---------------------------- */

export const listPlansFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .handler(async (): Promise<Plan[]> => {
    return query<Plan>("SELECT * FROM plans ORDER BY sort_order");
  });

export const createPlanFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: Partial<Plan> & { code: string; name: string }) => input)
  .handler(async ({ data }): Promise<Plan> => {
    const id = uuid();
    await execute(
      `INSERT INTO plans (id, code, name, description, price_monthly, currency, seat_limit, features, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.code,
        data.name,
        data.description ?? null,
        data.price_monthly ?? 0,
        data.currency ?? "INR",
        data.seat_limit ?? 10,
        data.features
          ? typeof data.features === "string"
            ? data.features
            : JSON.stringify(data.features)
          : null,
        data.is_active !== false ? 1 : 0,
        data.sort_order ?? 0,
      ],
    );
    return (await queryOne<Plan>("SELECT * FROM plans WHERE id = ?", [id]))!;
  });

export const updatePlanFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string; patch: Partial<Plan> }) => input)
  .handler(async ({ data }): Promise<Plan> => {
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [key, val] of Object.entries(data.patch)) {
      if (key === "id" || key === "created_at") continue;
      sets.push(`\`${key}\` = ?`);
      if (key === "features" && val !== null) {
        vals.push(typeof val === "string" ? val : JSON.stringify(val));
      } else if (key === "is_active") {
        vals.push(val ? 1 : 0);
      } else {
        vals.push(val);
      }
    }
    if (sets.length === 0)
      return (await queryOne<Plan>("SELECT * FROM plans WHERE id = ?", [data.id]))!;
    vals.push(data.id);
    await execute(`UPDATE plans SET ${sets.join(", ")} WHERE id = ?`, vals);
    return (await queryOne<Plan>("SELECT * FROM plans WHERE id = ?", [data.id]))!;
  });

export const deletePlanFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    await execute("DELETE FROM plans WHERE id = ?", [data.id]);
    return { ok: true };
  });

export const listPromoMediaFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .handler(async (): Promise<PromoMedia[]> => {
    return query<PromoMedia>("SELECT * FROM promo_media ORDER BY priority, created_at");
  });

export const createPromoMediaFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: Partial<PromoMedia> & { title: string }) => input)
  .handler(async ({ data }): Promise<PromoMedia> => {
    const id = uuid();
    await execute(
      `INSERT INTO promo_media (id, title, body, image_url, target, priority, start_at, end_at, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.title,
        data.body ?? null,
        data.image_url ?? null,
        data.target ?? "All workspaces",
        data.priority ?? 1,
        data.start_at ?? new Date().toISOString().slice(0, 19).replace("T", " "),
        data.end_at ?? null,
        data.is_active !== false ? 1 : 0,
      ],
    );
    return (await queryOne<PromoMedia>("SELECT * FROM promo_media WHERE id = ?", [id]))!;
  });

export const updatePromoMediaFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string; patch: Partial<PromoMedia> }) => input)
  .handler(async ({ data }): Promise<PromoMedia> => {
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [key, val] of Object.entries(data.patch)) {
      if (key === "id" || key === "created_at") continue;
      sets.push(`\`${key}\` = ?`);
      if (key === "is_active") {
        vals.push(val ? 1 : 0);
      } else {
        vals.push(val);
      }
    }
    if (sets.length === 0)
      return (await queryOne<PromoMedia>("SELECT * FROM promo_media WHERE id = ?", [data.id]))!;
    vals.push(data.id);
    await execute(`UPDATE promo_media SET ${sets.join(", ")} WHERE id = ?`, vals);
    return (await queryOne<PromoMedia>("SELECT * FROM promo_media WHERE id = ?", [data.id]))!;
  });

export const deletePromoMediaFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    await execute("DELETE FROM promo_media WHERE id = ?", [data.id]);
    return { ok: true };
  });

export type PlatformSettings = Record<string, Record<string, any>>;

export const getPlatformSettingsFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .handler(async (): Promise<PlatformSettings> => {
    const rows = await query<{ key: string; value: string }>(
      "SELECT `key`, `value` FROM platform_settings",
    );
    return Object.fromEntries(
      rows.map((r) => [r.key, typeof r.value === "string" ? JSON.parse(r.value) : (r.value ?? {})]),
    );
  });

export const savePlatformSettingsFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { key: string; value: Record<string, unknown> }) => input)
  .handler(async ({ data }) => {
    await execute(
      `INSERT INTO platform_settings (\`key\`, value, updated_at)
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = NOW()`,
      [data.key, JSON.stringify(data.value)],
    );
    return { ok: true };
  });

/* --------------------------------- audit ---------------------------------- */

export type AuditLogItem = AuditLog & {
  actor_name: string | null;
  actor_email: string | null;
};

export type AuditLogListResponse = {
  items: AuditLogItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  modules: string[];
  actors: { id: string; name: string; email: string | null }[];
};

export const listWorkspaceAuditLogsFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator(
    (
      input:
        | {
            page?: number;
            pageSize?: number;
            search?: string;
            actorId?: string;
            module?: string;
            action?: string;
            status?: string;
            startDate?: string;
            endDate?: string;
          }
        | undefined,
    ) => input ?? {},
  )
  .handler(async ({ data, context }): Promise<AuditLogListResponse> => {
    await assertPermission(context, "view_audit_logs");
    const wsId = getTargetWorkspaceId(undefined, context);

    const conditions: string[] = ["a.workspace_id = ?"];
    const vals: unknown[] = [wsId];

    if (data.actorId && data.actorId !== "all") {
      conditions.push("a.actor_id = ?");
      vals.push(data.actorId);
    }

    if (data.module && data.module !== "all") {
      conditions.push("a.entity_type = ?");
      vals.push(data.module);
    }

    if (data.action && data.action !== "all") {
      conditions.push("a.action = ?");
      vals.push(data.action);
    }

    if (data.status && data.status !== "all") {
      conditions.push("a.status = ?");
      vals.push(data.status);
    }

    if (data.startDate) {
      conditions.push("a.created_at >= ?");
      vals.push(`${data.startDate} 00:00:00`);
    }

    if (data.endDate) {
      conditions.push("a.created_at <= ?");
      vals.push(`${data.endDate} 23:59:59`);
    }

    if (data.search && data.search.trim()) {
      const q = `%${data.search.trim()}%`;
      conditions.push(
        "(a.action LIKE ? OR a.entity_type LIKE ? OR a.entity_id LIKE ? OR a.actor_label LIKE ? OR a.metadata LIKE ? OR p.full_name LIKE ? OR p.email LIKE ?)",
      );
      vals.push(q, q, q, q, q, q, q);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    // Total count
    const countRow = await queryOne<{ c: number }>(
      `SELECT COUNT(*) as c FROM audit_logs a LEFT JOIN profiles p ON a.actor_id = p.id ${where}`,
      vals,
    );
    const total = countRow?.c ?? 0;

    const page = Math.max(1, Number(data.page || 1));
    const pageSize = Math.min(100, Math.max(10, Number(data.pageSize || 25)));
    const totalPages = Math.ceil(total / pageSize) || 1;
    const offset = (page - 1) * pageSize;

    const items = await query<AuditLogItem>(
      `SELECT a.*, p.full_name as actor_name, p.email as actor_email
       FROM audit_logs a
       LEFT JOIN profiles p ON a.actor_id = p.id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`,
      [...vals, pageSize, offset],
    );

    // Fetch distinct modules and actors for filters in this workspace
    const rawModules = await query<{ entity_type: string }>(
      "SELECT DISTINCT entity_type FROM audit_logs WHERE workspace_id = ? AND entity_type IS NOT NULL AND entity_type != '' ORDER BY entity_type ASC",
      [wsId],
    );
    const modules = rawModules.map((m) => m.entity_type);

    const actors = await query<{ id: string; name: string; email: string | null }>(
      `SELECT DISTINCT a.actor_id as id, COALESCE(p.full_name, a.actor_label, 'System') as name, p.email
       FROM audit_logs a
       LEFT JOIN profiles p ON a.actor_id = p.id
       WHERE a.workspace_id = ? AND a.actor_id IS NOT NULL
       ORDER BY name ASC`,
      [wsId],
    );

    return {
      items,
      total,
      page,
      pageSize,
      totalPages,
      modules,
      actors,
    };
  });

export const listAuditLogsFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId?: string; limit?: number } | undefined) => input ?? {})
  .handler(async ({ data, context }): Promise<AuditLog[]> => {
    await assertPermission(context, "view_audit_logs");
    const wsId = getTargetWorkspaceId(data.workspaceId, context);
    const limit = Math.min(500, Math.max(1, data.limit ?? 200));
    return query<AuditLog>(
      "SELECT * FROM audit_logs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?",
      [wsId, limit],
    );
  });

export const recordAuditFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: Partial<AuditLog> & { action: string }) => input)
  .handler(async ({ data, context }) => {
    try {
      const id = uuid();
      const wsId = data.workspace_id || context.workspaceId;
      await execute(
        `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata, ip_address, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          wsId ?? null,
          data.actor_id || context.userId,
          data.actor_label || context.role,
          data.action,
          data.entity_type ?? null,
          data.entity_id ?? null,
          data.metadata
            ? typeof data.metadata === "string"
              ? data.metadata
              : JSON.stringify(data.metadata)
            : null,
          data.ip_address ?? null,
          data.status ?? "success",
        ],
      );
    } catch (err) {
      console.warn("audit log failed", err instanceof Error ? err.message : err);
    }
    return { ok: true };
  });

/* -------------------------- retention & cleanup --------------------------- */

export const runWorkspaceCleanupFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .handler(async ({ context }) => {
    const realRole = context.realRole || context.role;
    if (realRole !== "owner" && realRole !== "super_admin") {
      throw new Error("FORBIDDEN: Only workspace Owner can trigger maintenance cleanup.");
    }
    const wsId = getTargetWorkspaceId(undefined, context);
    const { runCentralizedCleanup } = await import("./retention-cleanup");
    return runCentralizedCleanup({ workspaceId: wsId });
  });

export const getWorkspaceStorageUsageFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .handler(async ({ context }) => {
    const wsId = getTargetWorkspaceId(undefined, context);
    const { getWorkspaceStorageUsage } = await import("./retention-cleanup");
    return getWorkspaceStorageUsage(wsId);
  });

/* ------------------------------- dashboard -------------------------------- */

export type DashboardData = {
  newLeadsCount: number;
  pendingFollowUpsCount: number;
  tasksDueTodayCount: number;
  upcomingVisitsCount: number;
  mtdRevenue: number;
  pendingPaymentsAmount: number;
  pendingInvoicesCount: number;
  pipelineSnapshot: { stage: string; count: number }[];
  todayScheduleVisits: {
    id: string;
    propertyId: string | null;
    propertyName: string;
    leadId: string | null;
    leadName: string;
    assignedTo: string;
    scheduledAt: string;
  }[];
  todayScheduleTasks: {
    id: string;
    title: string;
    relatedType: string;
    relatedLabel: string;
    assignedTo: string;
    dueAt: string | null;
  }[];
  recentActivities: {
    id: string;
    at: string;
    actor: string;
    action: string;
    target: string;
    kind: "call" | "note" | "status" | "visit" | "payment" | "email" | "whatsapp";
  }[];
  pendingInvoices: {
    id: string;
    number: string;
    customer: string;
    status: string;
    total: number;
  }[];
  upcomingVisitsList: {
    id: string;
    propertyName: string;
    leadName: string;
    status: string;
    scheduledAt: string;
  }[];
};

export const getDashboardDataFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string; userRole?: string; userName?: string }) => input)
  .handler(async ({ data, context }): Promise<DashboardData> => {
    const wsId = getTargetWorkspaceId(data.workspaceId, context);
    const isEmp = isEmployee(context);
    const userId = context.userId;

    const newLeadsSql = isEmp
      ? "SELECT COUNT(*) as c FROM leads WHERE workspace_id = ? AND status = 'New' AND (assigned_to = ? OR created_by = ?)"
      : "SELECT COUNT(*) as c FROM leads WHERE workspace_id = ? AND status = 'New'";
    const newLeadsParams = isEmp ? [wsId, userId, userId] : [wsId];
    const newLeadsRow = await queryOne<{ c: number }>(newLeadsSql, newLeadsParams);

    const pendingFollowUpsSql = isEmp
      ? "SELECT COUNT(*) as c FROM leads WHERE workspace_id = ? AND status NOT IN ('Won', 'Lost') AND next_follow_up IS NOT NULL AND (assigned_to = ? OR created_by = ?)"
      : "SELECT COUNT(*) as c FROM leads WHERE workspace_id = ? AND status NOT IN ('Won', 'Lost') AND next_follow_up IS NOT NULL";
    const pendingFollowUpsParams = isEmp ? [wsId, userId, userId] : [wsId];
    const pendingFollowUpsRow = await queryOne<{ c: number }>(
      pendingFollowUpsSql,
      pendingFollowUpsParams,
    );

    const stages = ["New", "Contacted", "Interested", "Visit / Meeting", "Negotiation", "Won"];
    const stageSql = isEmp
      ? "SELECT status, COUNT(*) as c FROM leads WHERE workspace_id = ? AND (assigned_to = ? OR created_by = ?) GROUP BY status"
      : "SELECT status, COUNT(*) as c FROM leads WHERE workspace_id = ? GROUP BY status";
    const stageParams = isEmp ? [wsId, userId, userId] : [wsId];
    const stageCounts = await query<{ status: string; c: number }>(stageSql, stageParams);
    const countMap = new Map(stageCounts.map((r) => [r.status, Number(r.c)]));
    const pipelineSnapshot = stages.map((stage) => ({
      stage,
      count: countMap.get(stage) || 0,
    }));

    let taskSql = "SELECT * FROM tasks WHERE workspace_id = ? AND status = 'Open'";
    const taskParams: unknown[] = [wsId];
    if (isEmp) {
      taskSql += " AND (assigned_to = ? OR created_by = ?)";
      taskParams.push(userId, userId);
    }
    taskSql += " ORDER BY CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at ASC LIMIT 10";
    const openTasks = await query<Task>(taskSql, taskParams);

    // Tasks due today count (respecting employee assignment)
    const tasksDueSql = isEmp
      ? "SELECT COUNT(*) as c FROM tasks WHERE workspace_id = ? AND status = 'Open' AND (assigned_to = ? OR created_by = ?) AND due_at IS NOT NULL AND DATE(due_at) <= CURDATE()"
      : "SELECT COUNT(*) as c FROM tasks WHERE workspace_id = ? AND status = 'Open' AND due_at IS NOT NULL AND DATE(due_at) <= CURDATE()";
    const tasksDueParams = isEmp ? [wsId, userId, userId] : [wsId];
    const tasksDueRow = await queryOne<{ c: number }>(tasksDueSql, tasksDueParams);

    let eventSql = "SELECT * FROM calendar_events WHERE workspace_id = ? AND status = 'Scheduled'";
    const eventParams: unknown[] = [wsId];
    if (isEmp) {
      eventSql += " AND (assigned_to = ? OR created_by = ?)";
      eventParams.push(userId, userId);
    }
    eventSql += " ORDER BY start_at ASC LIMIT 10";
    const events = await query<CalendarEvent>(eventSql, eventParams);

    // Upcoming visits count (respecting employee assignment)
    const upcomingVisitsSql = isEmp
      ? "SELECT COUNT(*) as c FROM calendar_events WHERE workspace_id = ? AND status = 'Scheduled' AND (assigned_to = ? OR created_by = ?) AND start_at >= NOW()"
      : "SELECT COUNT(*) as c FROM calendar_events WHERE workspace_id = ? AND status = 'Scheduled' AND start_at >= NOW()";
    const upcomingVisitsParams = isEmp ? [wsId, userId, userId] : [wsId];
    const upcomingVisitsRow = await queryOne<{ c: number }>(
      upcomingVisitsSql,
      upcomingVisitsParams,
    );

    let canViewFinance = false;
    if (context.role === "owner" || context.role === "super_admin") {
      canViewFinance = true;
    } else {
      const permCheck = await queryOne<{ id: string }>(
        "SELECT id FROM user_permissions WHERE workspace_id = ? AND user_id = ? AND permission IN ('finance.view', 'view.finance', 'manage.finance') LIMIT 1",
        [wsId, userId],
      );
      canViewFinance = Boolean(permCheck);
    }

    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    let mtdRevRow: { total: number } | null = null;
    let pendingPayRow: { total: number; c: number } | null = null;
    let pendingInvoicesRaw: (Invoice & { customer_name?: string })[] = [];

    if (canViewFinance) {
      mtdRevRow = await queryOne<{ total: number }>(
        "SELECT SUM(amount) as total FROM payments WHERE workspace_id = ? AND status = 'Received' AND paid_at >= ?",
        [wsId, firstDayOfMonth],
      );

      // Outstanding balance on active issued/overdue/partially paid invoices (Excluding Draft, Cancelled, Paid)
      pendingPayRow = await queryOne<{ total: number; c: number }>(
        `SELECT 
           COUNT(DISTINCT i.id) as c,
           COALESCE(SUM(GREATEST(0, i.total - COALESCE(p.paid, 0))), 0) as total
         FROM invoices i
         LEFT JOIN (
           SELECT invoice_id, SUM(amount) as paid 
           FROM payments 
           WHERE workspace_id = ? AND status = 'Received' 
           GROUP BY invoice_id
         ) p ON i.id = p.invoice_id
         WHERE i.workspace_id = ? 
           AND i.status NOT IN ('Draft', 'Cancelled', 'Paid')
           AND (i.total - COALESCE(p.paid, 0)) > 0`,
        [wsId, wsId],
      );

      pendingInvoicesRaw = await query<Invoice & { customer_name?: string }>(
        `SELECT i.*, c.name as customer_name 
         FROM invoices i 
         LEFT JOIN customers c ON i.customer_id = c.id 
         LEFT JOIN (
           SELECT invoice_id, SUM(amount) as paid 
           FROM payments 
           WHERE workspace_id = ? AND status = 'Received' 
           GROUP BY invoice_id
         ) p ON i.id = p.invoice_id
         WHERE i.workspace_id = ? 
           AND i.status NOT IN ('Draft', 'Cancelled', 'Paid')
           AND (i.total - COALESCE(p.paid, 0)) > 0
         ORDER BY i.created_at DESC LIMIT 5`,
        [wsId, wsId],
      );
    }

    const activitiesSql = isEmp
      ? `SELECT * FROM lead_activities WHERE workspace_id = ? AND (actor_id = ? OR lead_id IN (SELECT id FROM leads WHERE workspace_id = ? AND (assigned_to = ? OR created_by = ?))) ORDER BY created_at DESC LIMIT 10`
      : `SELECT * FROM lead_activities WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 10`;
    const activitiesParams = isEmp ? [wsId, userId, wsId, userId, userId] : [wsId];
    const activitiesRaw = await query<LeadActivity>(activitiesSql, activitiesParams);

    const props = await query<Property>("SELECT id, name FROM properties WHERE workspace_id = ?", [
      wsId,
    ]);
    const leads = await query<Lead>("SELECT id, name FROM leads WHERE workspace_id = ?", [wsId]);
    const propMap = new Map(props.map((p) => [p.id, p.name]));
    const leadMap = new Map(leads.map((l) => [l.id, l.name]));

    const todayScheduleVisits = events.map((e) => ({
      id: e.id,
      propertyId: e.property_id,
      propertyName: (e.property_id && propMap.get(e.property_id)) || e.location || "Property Visit",
      leadId: e.lead_id,
      leadName: (e.lead_id && leadMap.get(e.lead_id)) || "Lead",
      assignedTo: e.assigned_to || "Assigned",
      scheduledAt: e.start_at,
    }));

    const todayScheduleTasks = openTasks.map((t) => ({
      id: t.id,
      title: t.title,
      relatedType: t.lead_id
        ? "Lead"
        : t.customer_id
          ? "Customer"
          : t.property_id
            ? "Property"
            : "Task",
      relatedLabel: (t.lead_id && leadMap.get(t.lead_id)) || t.title,
      assignedTo: t.assigned_to || "Unassigned",
      dueAt: t.due_at,
    }));

    const recentActivities = activitiesRaw.map((a) => {
      let kind: "call" | "note" | "status" | "visit" | "payment" | "email" | "whatsapp" = "note";
      const t = (a.type || "").toLowerCase();
      if (t.includes("call")) kind = "call";
      else if (t.includes("visit")) kind = "visit";
      else if (t.includes("payment")) kind = "payment";
      else if (t.includes("email")) kind = "email";
      else if (t.includes("whatsapp")) kind = "whatsapp";
      else if (t.includes("status")) kind = "status";

      return {
        id: a.id,
        at: a.created_at,
        actor: a.actor_label || "User",
        action: a.type || "logged activity",
        target: a.note || (a.lead_id ? leadMap.get(a.lead_id) || "Lead" : "Record"),
        kind,
      };
    });

    const upcomingVisitsList = events.map((e) => ({
      id: e.id,
      propertyName: (e.property_id && propMap.get(e.property_id)) || e.location || "Property Visit",
      leadName: (e.lead_id && leadMap.get(e.lead_id)) || "Lead",
      status: e.status || "Scheduled",
      scheduledAt: e.start_at,
    }));

    return {
      newLeadsCount: Number(newLeadsRow?.c ?? 0),
      pendingFollowUpsCount: Number(pendingFollowUpsRow?.c ?? 0),
      tasksDueTodayCount: Number(tasksDueRow?.c ?? 0),
      upcomingVisitsCount: Number(upcomingVisitsRow?.c ?? 0),
      mtdRevenue: Number(mtdRevRow?.total ?? 0),
      pendingPaymentsAmount: Number(pendingPayRow?.total ?? 0),
      pendingInvoicesCount: pendingPayRow?.c ?? 0,
      pipelineSnapshot,
      todayScheduleVisits,
      todayScheduleTasks,
      recentActivities,
      pendingInvoices: pendingInvoicesRaw.map((i) => ({
        id: i.id,
        number: i.invoice_number,
        customer: i.customer_name || "Customer",
        status: i.status,
        total: Number(i.total),
      })),
      upcomingVisitsList,
    };
  });

/* --------------------------------- search ---------------------------------- */

export type SearchResult = {
  leads: { id: string; name: string; phone: string | null; status: string }[];
  customers: { id: string; name: string; phone: string | null; type: string }[];
  properties: { id: string; name: string; location: string | null; status: string }[];
  invoices: { id: string; number: string; customer: string; status: string }[];
  payments: { id: string; reference: string; customer: string; amount: number }[];
  tasks: { id: string; title: string; priority: string; status: string }[];
};

export const searchCrmFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string; query: string }) => input)
  .handler(async ({ data, context }): Promise<SearchResult> => {
    const q = `%${data.query.trim()}%`;
    if (!data.query || data.query.trim().length < 1) {
      return { leads: [], customers: [], properties: [], invoices: [], payments: [], tasks: [] };
    }

    const ef = employeeFilter(context);

    const leads = await query<{ id: string; name: string; phone: string | null; status: string }>(
      `SELECT id, name, phone, status FROM leads WHERE workspace_id = ?${ef.sql} AND (name LIKE ? OR phone LIKE ? OR email LIKE ? OR requirement LIKE ?) ORDER BY received_at DESC LIMIT 5`,
      [data.workspaceId, ...ef.params, q, q, q, q],
    );

    const customers = await query<{ id: string; name: string; phone: string | null; type: string }>(
      `SELECT id, name, phone, type FROM customers WHERE workspace_id = ?${ef.sql} AND (name LIKE ? OR phone LIKE ? OR email LIKE ? OR city LIKE ?) ORDER BY created_at DESC LIMIT 5`,
      [data.workspaceId, ...ef.params, q, q, q, q],
    );

    const properties = await query<{
      id: string;
      name: string;
      location: string | null;
      status: string;
    }>(
      `SELECT id, name, location, status FROM properties WHERE workspace_id = ?${ef.sql} AND (name LIKE ? OR location LIKE ? OR type LIKE ?) ORDER BY created_at DESC LIMIT 5`,
      [data.workspaceId, ...ef.params, q, q, q],
    );

    const invoices = await query<{ id: string; number: string; customer: string; status: string }>(
      `SELECT i.id, i.invoice_number as number, COALESCE(c.name, 'Customer') as customer, i.status 
       FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id 
       WHERE i.workspace_id = ? AND (i.invoice_number LIKE ? OR c.name LIKE ?) ORDER BY i.created_at DESC LIMIT 5`,
      [data.workspaceId, q, q],
    );

    const payments = await query<{
      id: string;
      reference: string;
      customer: string;
      amount: number;
    }>(
      `SELECT p.id, COALESCE(p.reference, p.id) as reference, COALESCE(c.name, 'Customer') as customer, p.amount 
       FROM payments p LEFT JOIN customers c ON p.customer_id = c.id 
       WHERE p.workspace_id = ? AND (p.reference LIKE ? OR c.name LIKE ?) ORDER BY p.paid_at DESC LIMIT 5`,
      [data.workspaceId, q, q],
    );

    const efTask = employeeFilter(context);
    const tasks = await query<{ id: string; title: string; priority: string; status: string }>(
      `SELECT id, title, priority, status FROM tasks WHERE workspace_id = ?${efTask.sql} AND (title LIKE ? OR description LIKE ?) ORDER BY created_at DESC LIMIT 5`,
      [data.workspaceId, ...efTask.params, q, q],
    );

    return { leads, customers, properties, invoices, payments, tasks };
  });

/* ------------------------------- notifications ----------------------------- */

export const listNotificationsFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { limit?: number } | undefined) => input ?? {})
  .handler(async ({ data, context }): Promise<Notification[]> => {
    const limit = Math.min(100, Math.max(1, data.limit ?? 50));
    const wsId = getTargetWorkspaceId(undefined, context);
    return query<Notification>(
      "SELECT * FROM notifications WHERE user_id = ? AND workspace_id = ? ORDER BY created_at DESC LIMIT ?",
      [context.userId, wsId, limit],
    );
  });

export const unreadNotificationCountFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .handler(async ({ context }): Promise<{ count: number }> => {
    const wsId = getTargetWorkspaceId(undefined, context);
    const row = await queryOne<{ c: number }>(
      "SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND workspace_id = ? AND is_read = 0",
      [context.userId, wsId],
    );
    return { count: row?.c ?? 0 };
  });

export const markNotificationReadFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const wsId = getTargetWorkspaceId(undefined, context);
    await execute("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ? AND workspace_id = ?", [
      data.id,
      context.userId,
      wsId,
    ]);
    return { ok: true };
  });

export const markAllNotificationsReadFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .handler(async ({ context }) => {
    const wsId = getTargetWorkspaceId(undefined, context);
    await execute("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND workspace_id = ? AND is_read = 0", [
      context.userId,
      wsId,
    ]);
    return { ok: true };
  });

export const deleteNotificationFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const wsId = getTargetWorkspaceId(undefined, context);
    await execute("DELETE FROM notifications WHERE id = ? AND user_id = ? AND workspace_id = ?", [
      data.id,
      context.userId,
      wsId,
    ]);
    return { ok: true };
  });

export const clearAllNotificationsFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .handler(async ({ context }) => {
    const wsId = getTargetWorkspaceId(undefined, context);
    await execute("DELETE FROM notifications WHERE user_id = ? AND workspace_id = ?", [
      context.userId,
      wsId,
    ]);
    return { ok: true };
  });
