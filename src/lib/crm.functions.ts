import { createServerFn } from "@tanstack/react-start";
import { requireMySqlAuth } from "./auth.functions";
import { query, queryOne, execute, transaction, uuid } from "./db";
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

/* -------------------------------- customers ------------------------------- */

export const listCustomersFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string }) => input)
  .handler(async ({ data }): Promise<Customer[]> => {
    return query<Customer>(
      "SELECT * FROM customers WHERE workspace_id = ? ORDER BY created_at DESC",
      [data.workspaceId],
    );
  });

export const getCustomerFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data }): Promise<Customer | null> => {
    return queryOne<Customer>("SELECT * FROM customers WHERE id = ?", [data.id]);
  });

export const createCustomerFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: Partial<Customer> & { workspace_id: string; name: string }) => input)
  .handler(async ({ data }): Promise<Customer> => {
    const id = uuid();
    await execute(
      `INSERT INTO customers (id, workspace_id, name, phone, email, type, status, city, currency, value, tags, notes, assigned_to, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.workspace_id,
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
        data.assigned_to ?? null,
        data.created_by ?? null,
      ],
    );
    return (await queryOne<Customer>("SELECT * FROM customers WHERE id = ?", [id]))!;
  });

export const updateCustomerFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string; patch: Partial<Customer> }) => input)
  .handler(async ({ data }): Promise<Customer> => {
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [key, val] of Object.entries(data.patch)) {
      if (key === "id" || key === "created_at" || key === "workspace_id") continue;
      sets.push(`\`${key}\` = ?`);
      vals.push(key === "tags" && val !== null ? JSON.stringify(val) : val);
    }
    if (sets.length === 0)
      return (await queryOne<Customer>("SELECT * FROM customers WHERE id = ?", [data.id]))!;
    vals.push(data.id);
    await execute(`UPDATE customers SET ${sets.join(", ")} WHERE id = ?`, vals);
    return (await queryOne<Customer>("SELECT * FROM customers WHERE id = ?", [data.id]))!;
  });

export const deleteCustomerFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    await execute("DELETE FROM customers WHERE id = ?", [data.id]);
    return { ok: true };
  });

/* -------------------------------- properties ------------------------------ */

export const listPropertiesFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string }) => input)
  .handler(async ({ data }): Promise<Property[]> => {
    return query<Property>(
      "SELECT * FROM properties WHERE workspace_id = ? ORDER BY created_at DESC",
      [data.workspaceId],
    );
  });

export const getPropertyFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data }): Promise<Property | null> => {
    return queryOne<Property>("SELECT * FROM properties WHERE id = ?", [data.id]);
  });

export const createPropertyFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: Partial<Property> & { workspace_id: string; name: string }) => input)
  .handler(async ({ data }): Promise<Property> => {
    const id = uuid();
    await execute(
      `INSERT INTO properties (id, workspace_id, name, location, type, status, price, currency, bedrooms, area_sqft, image_url, description, assigned_to, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.workspace_id,
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
        data.assigned_to ?? null,
        data.created_by ?? null,
      ],
    );
    return (await queryOne<Property>("SELECT * FROM properties WHERE id = ?", [id]))!;
  });

export const updatePropertyFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string; patch: Partial<Property> }) => input)
  .handler(async ({ data }): Promise<Property> => {
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [key, val] of Object.entries(data.patch)) {
      if (key === "id" || key === "created_at" || key === "workspace_id") continue;
      sets.push(`\`${key}\` = ?`);
      vals.push(val);
    }
    if (sets.length === 0)
      return (await queryOne<Property>("SELECT * FROM properties WHERE id = ?", [data.id]))!;
    vals.push(data.id);
    await execute(`UPDATE properties SET ${sets.join(", ")} WHERE id = ?`, vals);
    return (await queryOne<Property>("SELECT * FROM properties WHERE id = ?", [data.id]))!;
  });

export const deletePropertyFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    await execute("DELETE FROM properties WHERE id = ?", [data.id]);
    return { ok: true };
  });

/* ----------------------------------- leads -------------------------------- */

export const listLeadsFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string }) => input)
  .handler(async ({ data }): Promise<Lead[]> => {
    return query<Lead>(
      "SELECT * FROM leads WHERE workspace_id = ? ORDER BY received_at DESC",
      [data.workspaceId],
    );
  });

export const getLeadFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data }): Promise<Lead | null> => {
    return queryOne<Lead>("SELECT * FROM leads WHERE id = ?", [data.id]);
  });

export const createLeadFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: Partial<Lead> & { workspace_id: string; name: string }) => input)
  .handler(async ({ data }): Promise<Lead> => {
    const id = uuid();
    await execute(
      `INSERT INTO leads (id, workspace_id, name, phone, email, source, campaign, external_id, status, requirement, budget, currency, score, next_follow_up, received_at, assigned_to, property_id, customer_id, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.workspace_id,
        data.name,
        data.phone ?? null,
        data.email ?? null,
        data.source ?? "Manual Entry",
        data.campaign ?? null,
        data.external_id ?? null,
        data.status ?? "New",
        data.requirement ?? null,
        data.budget ?? 0,
        data.currency ?? "INR",
        data.score ?? 50,
        data.next_follow_up ?? null,
        data.received_at ?? new Date().toISOString().slice(0, 19).replace("T", " "),
        data.assigned_to ?? null,
        data.property_id ?? null,
        data.customer_id ?? null,
        data.notes ?? null,
        data.created_by ?? null,
      ],
    );
    return (await queryOne<Lead>("SELECT * FROM leads WHERE id = ?", [id]))!;
  });

export const updateLeadFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string; patch: Partial<Lead> }) => input)
  .handler(async ({ data }): Promise<Lead> => {
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [key, val] of Object.entries(data.patch)) {
      if (key === "id" || key === "created_at" || key === "workspace_id") continue;
      sets.push(`\`${key}\` = ?`);
      vals.push(val);
    }
    if (sets.length === 0)
      return (await queryOne<Lead>("SELECT * FROM leads WHERE id = ?", [data.id]))!;
    vals.push(data.id);
    await execute(`UPDATE leads SET ${sets.join(", ")} WHERE id = ?`, vals);
    return (await queryOne<Lead>("SELECT * FROM leads WHERE id = ?", [data.id]))!;
  });

export const deleteLeadFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    await execute("DELETE FROM leads WHERE id = ?", [data.id]);
    return { ok: true };
  });

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
  .handler(async ({ data }): Promise<LeadActivity> => {
    const id = uuid();
    await execute(
      `INSERT INTO lead_activities (id, workspace_id, lead_id, type, note, actor_id, actor_label)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.workspace_id,
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
  .handler(async ({ data }) => {
    await execute("DELETE FROM lead_activities WHERE id = ?", [data.id]);
    return { ok: true };
  });

/* ----------------------------------- tasks -------------------------------- */

export const listTasksFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string }) => input)
  .handler(async ({ data }): Promise<Task[]> => {
    return query<Task>(
      "SELECT * FROM tasks WHERE workspace_id = ? ORDER BY CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at ASC",
      [data.workspaceId],
    );
  });

export const createTaskFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: Partial<Task> & { workspace_id: string; title: string }) => input)
  .handler(async ({ data }): Promise<Task> => {
    const id = uuid();
    await execute(
      `INSERT INTO tasks (id, workspace_id, title, description, due_at, priority, status, assigned_to, lead_id, customer_id, property_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.workspace_id,
        data.title,
        data.description ?? null,
        data.due_at ?? null,
        data.priority ?? "Medium",
        data.status ?? "Open",
        data.assigned_to ?? null,
        data.lead_id ?? null,
        data.customer_id ?? null,
        data.property_id ?? null,
        data.created_by ?? null,
      ],
    );
    return (await queryOne<Task>("SELECT * FROM tasks WHERE id = ?", [id]))!;
  });

export const updateTaskFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string; patch: Partial<Task> }) => input)
  .handler(async ({ data }): Promise<Task> => {
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [key, val] of Object.entries(data.patch)) {
      if (key === "id" || key === "created_at" || key === "workspace_id") continue;
      sets.push(`\`${key}\` = ?`);
      vals.push(val);
    }
    if (sets.length === 0)
      return (await queryOne<Task>("SELECT * FROM tasks WHERE id = ?", [data.id]))!;
    vals.push(data.id);
    await execute(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`, vals);
    return (await queryOne<Task>("SELECT * FROM tasks WHERE id = ?", [data.id]))!;
  });

export const deleteTaskFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    await execute("DELETE FROM tasks WHERE id = ?", [data.id]);
    return { ok: true };
  });

/* -------------------------------- calendar -------------------------------- */

export const listEventsFn = createServerFn({ method: "GET" })
  .middleware([requireMySqlAuth])
  .validator((input: { workspaceId: string }) => input)
  .handler(async ({ data }): Promise<CalendarEvent[]> => {
    return query<CalendarEvent>(
      "SELECT * FROM calendar_events WHERE workspace_id = ? ORDER BY start_at ASC",
      [data.workspaceId],
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
    return query<Payment>(
      "SELECT * FROM payments WHERE workspace_id = ? ORDER BY paid_at DESC",
      [data.workspaceId],
    );
  });

export const createPaymentFn = createServerFn({ method: "POST" })
  .middleware([requireMySqlAuth])
  .validator(
    (input: Partial<Payment> & { workspace_id: string; amount: number }) => input,
  )
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
      rows.map((r) => [r.key, typeof r.value === "string" ? JSON.parse(r.value) : r.value ?? {}]),
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
