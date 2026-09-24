import { createServerFn } from "@tanstack/react-start";
import { requireMySqlAuth } from "./auth.functions";
import { query, queryOne, execute, transaction, uuid } from "./db";
import { getDefaultQuickAddDueDateTime } from "./date-utils";
import { calculateLeadScore } from "./lead-scoring";
import type {
  Customer,
  Property,
  Lead,
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

export type Member = { id: string; full_name: string; email: string | null; is_active: boolean };

export type InvoiceLineInput = { description: string; quantity: number; unit_amount: number };

export function invoiceTotals(lines: InvoiceLineInput[], taxRate: number) {
  const subtotal = lines.reduce(
    (sum, l) => sum + Number(l.quantity || 0) * Number(l.unit_amount || 0),
    0,
  );
  const taxAmount = Math.round(subtotal * (Number(taxRate) || 0)) / 100;
  return { subtotal, taxAmount, total: subtotal + taxAmount };
}

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
    if (context.role !== "super_admin") {
      await execute("DELETE FROM customers WHERE id = ? AND workspace_id = ?", [data.id, wsId]);
    } else {
      await execute("DELETE FROM customers WHERE id = ?", [data.id]);
    }
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
    if (context.role !== "super_admin") {
      await execute("DELETE FROM properties WHERE id = ? AND workspace_id = ?", [data.id, wsId]);
    } else {
      await execute("DELETE FROM properties WHERE id = ?", [data.id]);
    }
    return { ok: true };
  });

/* ----------------------------------- leads -------------------------------- */

export const listLeadsFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string }) => input)
  .handler(async ({ data, context }): Promise<Lead[]> => {
    const wsId = getTargetWorkspaceId(data.workspaceId, context);
    const ef = employeeFilter(context);
    return query<Lead>(
      `SELECT * FROM leads WHERE workspace_id = ?${ef.sql} ORDER BY received_at DESC`,
      [wsId, ...ef.params],
    );
  });

export const getLeadFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data, context }): Promise<Lead | null> => {
    if (context.role === "super_admin") {
      return queryOne<Lead>("SELECT * FROM leads WHERE id = ?", [data.id]);
    }
    const wsId = getTargetWorkspaceId(undefined, context);
    const ef = employeeFilter(context);
    return queryOne<Lead>(`SELECT * FROM leads WHERE id = ? AND workspace_id = ?${ef.sql}`, [
      data.id,
      wsId,
      ...ef.params,
    ]);
  });

export const createLeadFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: Partial<Lead> & { workspace_id: string; name: string }) => input)
  .handler(async ({ data, context }): Promise<Lead> => {
    const wsId = getTargetWorkspaceId(data.workspace_id, context);
    const id = uuid();

    const creatorId = context.userId || data.created_by || null;
    let assignedTo = data.assigned_to ?? null;
    // When employee creates lead: Created By = Employee, Assigned To = Employee (persisted in MySQL)
    if (isEmployee(context) && creatorId) {
      assignedTo = creatorId;
    }

    const candidateLead: Lead = {
      id,
      workspace_id: wsId,
      name: data.name,
      phone: data.phone ?? null,
      email: data.email ?? null,
      source: data.source ?? "Manual Entry",
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
      property_id: data.property_id ?? null,
      customer_id: data.customer_id ?? null,
      converted_at: null,
      notes: data.notes ?? null,
      created_by: creatorId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const calculatedScore = calculateLeadScore(candidateLead).total;

    await execute(
      `INSERT INTO leads (id, workspace_id, name, phone, email, source, campaign, external_id, status, requirement, budget, currency, score, next_follow_up, received_at, assigned_to, assigned_at, property_id, customer_id, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        wsId,
        candidateLead.name,
        candidateLead.phone,
        candidateLead.email,
        candidateLead.source,
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
    const newLead = (await queryOne<Lead>("SELECT * FROM leads WHERE id = ?", [id]))!;

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

    return newLead;
  });

export const updateLeadFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string; patch: Partial<Lead> }) => input)
  .handler(async ({ data, context }): Promise<Lead> => {
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

    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [key, val] of Object.entries(patchWithScore)) {
      if (key === "id" || key === "created_at" || key === "workspace_id") continue;
      sets.push(`\`${key}\` = ?`);
      vals.push(val);
    }
    if (sets.length === 0)
      return (await queryOne<Lead>("SELECT * FROM leads WHERE id = ?", [data.id]))!;

    vals.push(data.id);
    if (context.role !== "super_admin") {
      vals.push(wsId);
      await execute(`UPDATE leads SET ${sets.join(", ")} WHERE id = ? AND workspace_id = ?`, vals);
    } else {
      await execute(`UPDATE leads SET ${sets.join(", ")} WHERE id = ?`, vals);
    }
    const updatedLead = (await queryOne<Lead>("SELECT * FROM leads WHERE id = ?", [data.id]))!;

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

    return updatedLead;
  });

export const deleteLeadFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    checkDeleteRole(context);
    const wsId = getTargetWorkspaceId(undefined, context);
    if (context.role !== "super_admin") {
      await execute("DELETE FROM leads WHERE id = ? AND workspace_id = ?", [data.id, wsId]);
    }
    return { ok: true };
  });

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
  });

/* --------------------------------- finance -------------------------------- */

export const listInvoicesFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string }) => input)
  .handler(async ({ data }): Promise<Invoice[]> => {
    return query<Invoice>(
      "SELECT * FROM invoices WHERE workspace_id = ? ORDER BY created_at DESC",
      [data.workspaceId],
    );
  });

export const getInvoiceFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string }) => input)
  .handler(
    async ({
      data,
    }): Promise<{ invoice: Invoice; items: InvoiceItem[]; payments: Payment[] } | null> => {
      const invoice = await queryOne<Invoice>("SELECT * FROM invoices WHERE id = ?", [data.id]);
      if (!invoice) return null;
      const items = await query<InvoiceItem>(
        "SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY position",
        [data.id],
      );
      const payments = await query<Payment>(
        "SELECT * FROM payments WHERE invoice_id = ? ORDER BY paid_at DESC",
        [data.id],
      );
      return { invoice, items, payments };
    },
  );

export const nextInvoiceNumberFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string }) => input)
  .handler(async ({ data }): Promise<string> => {
    const rows = await query<{ invoice_number: string }>(
      "SELECT invoice_number FROM invoices WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 50",
      [data.workspaceId],
    );
    const year = new Date().getFullYear();
    let max = 0;
    for (const r of rows) {
      const m = /(\d+)\s*$/.exec(r.invoice_number ?? "");
      if (m?.[1]) max = Math.max(max, Number(m[1]));
    }
    return `INV-${year}-${String(max + 1).padStart(4, "0")}`;
  });

export const saveInvoiceFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator(
    (input: {
      id?: string;
      workspaceId: string;
      userId: string;
      invoice: {
        invoice_number: string;
        customer_id?: string | null;
        property_id?: string | null;
        status?: string;
        issue_date: string;
        due_date?: string | null;
        currency?: string;
        tax_rate?: number;
        notes?: string | null;
      };
      lines: InvoiceLineInput[];
    }) => input,
  )
  .handler(async ({ data }): Promise<Invoice> => {
    const { subtotal, taxAmount, total } = invoiceTotals(
      data.lines,
      Number(data.invoice.tax_rate ?? 0),
    );

    return transaction(async (conn) => {
      let invoiceId: string;

      if (data.id) {
        invoiceId = data.id;
        await conn.execute(
          `UPDATE invoices SET invoice_number=?, customer_id=?, property_id=?, status=?, issue_date=?, due_date=?, currency=?, tax_rate=?, subtotal=?, tax_amount=?, total=?, notes=? WHERE id=?`,
          [
            data.invoice.invoice_number,
            data.invoice.customer_id ?? null,
            data.invoice.property_id ?? null,
            data.invoice.status ?? "Draft",
            data.invoice.issue_date,
            data.invoice.due_date ?? null,
            data.invoice.currency ?? "INR",
            data.invoice.tax_rate ?? 0,
            subtotal,
            taxAmount,
            total,
            data.invoice.notes ?? null,
            invoiceId,
          ],
        );
        await conn.execute("DELETE FROM invoice_items WHERE invoice_id = ?", [invoiceId]);
      } else {
        invoiceId = uuid();
        await conn.execute(
          `INSERT INTO invoices (id, workspace_id, invoice_number, customer_id, property_id, status, issue_date, due_date, currency, tax_rate, subtotal, tax_amount, total, notes, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            invoiceId,
            data.workspaceId,
            data.invoice.invoice_number,
            data.invoice.customer_id ?? null,
            data.invoice.property_id ?? null,
            data.invoice.status ?? "Draft",
            data.invoice.issue_date,
            data.invoice.due_date ?? null,
            data.invoice.currency ?? "INR",
            data.invoice.tax_rate ?? 0,
            subtotal,
            taxAmount,
            total,
            data.invoice.notes ?? null,
            data.userId,
          ],
        );
      }

      for (let i = 0; i < data.lines.length; i++) {
        const l = data.lines[i]!;
        await conn.execute(
          `INSERT INTO invoice_items (id, workspace_id, invoice_id, description, quantity, unit_amount, amount, position)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            uuid(),
            data.workspaceId,
            invoiceId,
            l.description,
            l.quantity,
            l.unit_amount,
            Number(l.quantity || 0) * Number(l.unit_amount || 0),
            i,
          ],
        );
      }

      const [rows] = await conn.execute("SELECT * FROM invoices WHERE id = ?", [invoiceId]);
      return (rows as Invoice[])[0]!;
    });
  });

export const updateInvoiceStatusFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string; status: string }) => input)
  .handler(async ({ data }): Promise<Invoice> => {
    await execute("UPDATE invoices SET status = ? WHERE id = ?", [data.status, data.id]);
    return (await queryOne<Invoice>("SELECT * FROM invoices WHERE id = ?", [data.id]))!;
  });

export const deleteInvoiceFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    await execute("DELETE FROM invoices WHERE id = ?", [data.id]);
    return { ok: true };
  });

export const listPaymentsFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string }) => input)
  .handler(async ({ data }): Promise<Payment[]> => {
    return query<Payment>("SELECT * FROM payments WHERE workspace_id = ? ORDER BY paid_at DESC", [
      data.workspaceId,
    ]);
  });

export const createPaymentFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: Partial<Payment> & { workspace_id: string; amount: number }) => input)
  .handler(async ({ data }): Promise<Payment> => {
    const id = uuid();
    await execute(
      `INSERT INTO payments (id, workspace_id, invoice_id, customer_id, amount, currency, method, status, paid_at, reference, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.workspace_id,
        data.invoice_id ?? null,
        data.customer_id ?? null,
        data.amount,
        data.currency ?? "INR",
        data.method ?? "Bank Transfer",
        data.status ?? "Received",
        data.paid_at ?? new Date().toISOString().slice(0, 19).replace("T", " "),
        data.reference ?? null,
        data.notes ?? null,
        data.created_by ?? null,
      ],
    );
    const payment = (await queryOne<Payment>("SELECT * FROM payments WHERE id = ?", [id]))!;
    if (payment.invoice_id) await reconcileInvoiceInternal(payment.invoice_id);
    return payment;
  });

export const updatePaymentFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string; patch: Partial<Payment> }) => input)
  .handler(async ({ data }): Promise<Payment> => {
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [key, val] of Object.entries(data.patch)) {
      if (key === "id" || key === "created_at" || key === "workspace_id") continue;
      sets.push(`\`${key}\` = ?`);
      vals.push(val);
    }
    if (sets.length > 0) {
      vals.push(data.id);
      await execute(`UPDATE payments SET ${sets.join(", ")} WHERE id = ?`, vals);
    }
    const payment = (await queryOne<Payment>("SELECT * FROM payments WHERE id = ?", [data.id]))!;
    if (payment.invoice_id) await reconcileInvoiceInternal(payment.invoice_id);
    return payment;
  });

export const deletePaymentFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const existing = await queryOne<Payment>("SELECT * FROM payments WHERE id = ?", [data.id]);
    await execute("DELETE FROM payments WHERE id = ?", [data.id]);
    if (existing?.invoice_id) await reconcileInvoiceInternal(existing.invoice_id);
    return { ok: true };
  });

async function reconcileInvoiceInternal(invoiceId: string) {
  const invoice = await queryOne<Invoice>("SELECT * FROM invoices WHERE id = ?", [invoiceId]);
  if (!invoice || invoice.status === "Cancelled") return;

  const payments = await query<Pick<Payment, "amount" | "status">>(
    "SELECT amount, status FROM payments WHERE invoice_id = ?",
    [invoiceId],
  );
  const paid = payments
    .filter((p) => p.status === "Received")
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const total = Number(invoice.total);
  let status = invoice.status;
  if (paid <= 0) status = invoice.status === "Draft" ? "Draft" : "Sent";
  else if (paid + 0.01 < total) status = "Partially Paid";
  else status = "Paid";
  if (status !== invoice.status) {
    await execute("UPDATE invoices SET status = ? WHERE id = ?", [status, invoiceId]);
  }
}

export const reconcileInvoiceFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { invoiceId: string }) => input)
  .handler(async ({ data }) => {
    await reconcileInvoiceInternal(data.invoiceId);
    return { ok: true };
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

export const listAuditLogsFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId?: string; limit?: number } | undefined) => input ?? {})
  .handler(async ({ data }): Promise<AuditLog[]> => {
    const conditions: string[] = [];
    const vals: unknown[] = [];
    if (data.workspaceId) {
      conditions.push("workspace_id = ?");
      vals.push(data.workspaceId);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = data.limit ?? 200;
    vals.push(limit);
    return query<AuditLog>(
      `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ?`,
      vals,
    );
  });

export const recordAuditFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: Partial<AuditLog> & { action: string }) => input)
  .handler(async ({ data }) => {
    try {
      const id = uuid();
      await execute(
        `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata, ip_address)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          data.workspace_id ?? null,
          data.actor_id ?? null,
          data.actor_label ?? null,
          data.action,
          data.entity_type ?? null,
          data.entity_id ?? null,
          data.metadata
            ? typeof data.metadata === "string"
              ? data.metadata
              : JSON.stringify(data.metadata)
            : null,
          data.ip_address ?? null,
        ],
      );
    } catch (err) {
      console.warn("audit log failed", err instanceof Error ? err.message : err);
    }
    return { ok: true };
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
    const wsId = data.workspaceId;
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

    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    const mtdRevRow = await queryOne<{ total: number }>(
      "SELECT SUM(amount) as total FROM payments WHERE workspace_id = ? AND status = 'Received' AND paid_at >= ?",
      [wsId, firstDayOfMonth],
    );

    const pendingPayRow = await queryOne<{ total: number; c: number }>(
      "SELECT SUM(total) as total, COUNT(*) as c FROM invoices WHERE workspace_id = ? AND status IN ('Overdue', 'Partially Paid', 'Sent')",
      [wsId],
    );

    const pendingInvoicesRaw = await query<Invoice & { customer_name?: string }>(
      `SELECT i.*, c.name as customer_name 
       FROM invoices i LEFT JOIN customers c ON i.customer_id = c.id 
       WHERE i.workspace_id = ? AND i.status IN ('Overdue', 'Partially Paid', 'Sent') 
       ORDER BY i.created_at DESC LIMIT 5`,
      [wsId],
    );

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
    const limit = data.limit ?? 50;
    return query<Notification>(
      "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
      [context.userId, limit],
    );
  });

export const unreadNotificationCountFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .handler(async ({ context }): Promise<{ count: number }> => {
    const row = await queryOne<{ c: number }>(
      "SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0",
      [context.userId],
    );
    return { count: row?.c ?? 0 };
  });

export const markNotificationReadFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    await execute("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?", [
      data.id,
      context.userId,
    ]);
    return { ok: true };
  });

export const markAllNotificationsReadFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .handler(async ({ context }) => {
    await execute("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0", [
      context.userId,
    ]);
    return { ok: true };
  });
