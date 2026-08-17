/**
 * BLUETORN CRM — data access layer (MySQL).
 *
 * Every database read/write for the workspace-side CRM modules lives here so
 * that UI components stay free of storage-specific logic.
 *
 * All queries use parameterised statements via mysql2. No raw string concatenation.
 */
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

export type {
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
};

export const leadStatuses = [
  "New",
  "Contacted",
  "Interested",
  "Visit / Meeting",
  "Negotiation",
  "Won",
  "Lost",
] as const;
export type LeadStatus = (typeof leadStatuses)[number];

export const leadSources = [
  "Website",
  "WhatsApp",
  "Facebook",
  "Instagram",
  "LinkedIn",
  "Google Ads",
  "Meta Ads",
  "Referral",
  "Advertisement",
  "Landing Page",
  "Manual Entry",
  "API",
] as const;

export const customerTypes = ["Buyer", "Seller", "Investor", "Tenant"] as const;
export const customerStatuses = ["Prospect", "Active", "Archived"] as const;
export const propertyTypes = ["Apartment", "Villa", "Plot", "Commercial", "Office", "Warehouse"] as const;
export const propertyStatuses = ["Available", "Reserved", "Booked", "Sold", "Inactive"] as const;
export const taskPriorities = ["Low", "Medium", "High"] as const;
export const taskStatuses = ["Open", "In Progress", "Completed", "Cancelled"] as const;
export const eventTypes = ["Meeting", "Site Visit", "Call", "Follow-up", "Other"] as const;
export const eventStatuses = ["Scheduled", "Completed", "Cancelled", "No Show"] as const;
export const invoiceStatuses = ["Draft", "Sent", "Partially Paid", "Paid", "Overdue", "Cancelled"] as const;
export const paymentMethods = ["Bank Transfer", "UPI", "Cash", "Cheque", "Card", "Other"] as const;
export const paymentStatuses = ["Received", "Pending", "Failed", "Refunded"] as const;

/* --------------------------------- helpers -------------------------------- */

export const qk = {
  customers: (ws: string) => ["customers", ws] as const,
  customer: (id: string) => ["customer", id] as const,
  properties: (ws: string) => ["properties", ws] as const,
  property: (id: string) => ["property", id] as const,
  leads: (ws: string) => ["leads", ws] as const,
  lead: (id: string) => ["lead", id] as const,
  leadActivity: (id: string) => ["lead-activity", id] as const,
  tasks: (ws: string) => ["tasks", ws] as const,
  events: (ws: string) => ["events", ws] as const,
  invoices: (ws: string) => ["invoices", ws] as const,
  invoice: (id: string) => ["invoice", id] as const,
  payments: (ws: string) => ["payments", ws] as const,
  members: (ws: string) => ["members", ws] as const,
  plans: () => ["plans"] as const,
  promos: () => ["promos"] as const,
  platformSettings: () => ["platform-settings"] as const,
};

export type Member = { id: string; full_name: string; email: string | null; is_active: boolean };

export async function listMembers(workspaceId: string): Promise<Member[]> {
  return query<Member>(
    "SELECT id, full_name, email, is_active FROM profiles WHERE workspace_id = ? ORDER BY full_name",
    [workspaceId],
  );
}

/* -------------------------------- customers ------------------------------- */

export async function listCustomers(workspaceId: string) {
  return query<Customer>(
    "SELECT * FROM customers WHERE workspace_id = ? ORDER BY created_at DESC",
    [workspaceId],
  );
}

export async function getCustomer(id: string) {
  return queryOne<Customer>("SELECT * FROM customers WHERE id = ?", [id]);
}

export async function createCustomer(input: Partial<Customer> & { workspace_id: string; name: string }) {
  const id = uuid();
  await execute(
    `INSERT INTO customers (id, workspace_id, name, phone, email, type, status, city, currency, value, tags, notes, assigned_to, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, input.workspace_id, input.name, input.phone ?? null, input.email ?? null,
      input.type ?? "Buyer", input.status ?? "Prospect", input.city ?? null,
      input.currency ?? "INR", input.value ?? 0, input.tags ? JSON.stringify(input.tags) : null,
      input.notes ?? null, input.assigned_to ?? null, input.created_by ?? null,
    ],
  );
  return (await queryOne<Customer>("SELECT * FROM customers WHERE id = ?", [id]))!;
}

export async function updateCustomer(id: string, patch: Partial<Customer>) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [key, val] of Object.entries(patch)) {
    if (key === "id" || key === "created_at" || key === "workspace_id") continue;
    sets.push(`\`${key}\` = ?`);
    vals.push(key === "tags" && val !== null ? JSON.stringify(val) : val);
  }
  if (sets.length === 0) return (await queryOne<Customer>("SELECT * FROM customers WHERE id = ?", [id]))!;
  vals.push(id);
  await execute(`UPDATE customers SET ${sets.join(", ")} WHERE id = ?`, vals);
  return (await queryOne<Customer>("SELECT * FROM customers WHERE id = ?", [id]))!;
}

export async function deleteCustomer(id: string) {
  await execute("DELETE FROM customers WHERE id = ?", [id]);
}

/* -------------------------------- properties ------------------------------ */

export async function listProperties(workspaceId: string) {
  return query<Property>(
    "SELECT * FROM properties WHERE workspace_id = ? ORDER BY created_at DESC",
    [workspaceId],
  );
}

export async function getProperty(id: string) {
  return queryOne<Property>("SELECT * FROM properties WHERE id = ?", [id]);
}

export async function createProperty(input: Partial<Property> & { workspace_id: string; name: string }) {
  const id = uuid();
  await execute(
    `INSERT INTO properties (id, workspace_id, name, location, type, status, price, currency, bedrooms, area_sqft, image_url, description, assigned_to, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, input.workspace_id, input.name, input.location ?? null,
      input.type ?? "Apartment", input.status ?? "Available",
      input.price ?? 0, input.currency ?? "INR",
      input.bedrooms ?? null, input.area_sqft ?? null,
      input.image_url ?? null, input.description ?? null,
      input.assigned_to ?? null, input.created_by ?? null,
    ],
  );
  return (await queryOne<Property>("SELECT * FROM properties WHERE id = ?", [id]))!;
}

export async function updateProperty(id: string, patch: Partial<Property>) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [key, val] of Object.entries(patch)) {
    if (key === "id" || key === "created_at" || key === "workspace_id") continue;
    sets.push(`\`${key}\` = ?`);
    vals.push(val);
  }
  if (sets.length === 0) return (await queryOne<Property>("SELECT * FROM properties WHERE id = ?", [id]))!;
  vals.push(id);
  await execute(`UPDATE properties SET ${sets.join(", ")} WHERE id = ?`, vals);
  return (await queryOne<Property>("SELECT * FROM properties WHERE id = ?", [id]))!;
}

export async function deleteProperty(id: string) {
  await execute("DELETE FROM properties WHERE id = ?", [id]);
}

/* ----------------------------------- leads -------------------------------- */

export async function listLeads(workspaceId: string) {
  return query<Lead>(
    "SELECT * FROM leads WHERE workspace_id = ? ORDER BY received_at DESC",
    [workspaceId],
  );
}

export async function getLead(id: string) {
  return queryOne<Lead>("SELECT * FROM leads WHERE id = ?", [id]);
}

export async function createLead(input: Partial<Lead> & { workspace_id: string; name: string }) {
  const id = uuid();
  await execute(
    `INSERT INTO leads (id, workspace_id, name, phone, email, source, campaign, external_id, status, requirement, budget, currency, score, next_follow_up, received_at, assigned_to, property_id, customer_id, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, input.workspace_id, input.name, input.phone ?? null, input.email ?? null,
      input.source ?? "Manual Entry", input.campaign ?? null, input.external_id ?? null,
      input.status ?? "New", input.requirement ?? null, input.budget ?? 0,
      input.currency ?? "INR", input.score ?? 50, input.next_follow_up ?? null,
      input.received_at ?? new Date().toISOString().slice(0, 19).replace("T", " "),
      input.assigned_to ?? null, input.property_id ?? null, input.customer_id ?? null,
      input.notes ?? null, input.created_by ?? null,
    ],
  );
  return (await queryOne<Lead>("SELECT * FROM leads WHERE id = ?", [id]))!;
}

export async function updateLead(id: string, patch: Partial<Lead>) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [key, val] of Object.entries(patch)) {
    if (key === "id" || key === "created_at" || key === "workspace_id") continue;
    sets.push(`\`${key}\` = ?`);
    vals.push(val);
  }
  if (sets.length === 0) return (await queryOne<Lead>("SELECT * FROM leads WHERE id = ?", [id]))!;
  vals.push(id);
  await execute(`UPDATE leads SET ${sets.join(", ")} WHERE id = ?`, vals);
  return (await queryOne<Lead>("SELECT * FROM leads WHERE id = ?", [id]))!;
}

export async function deleteLead(id: string) {
  await execute("DELETE FROM leads WHERE id = ?", [id]);
}

export async function listLeadActivity(leadId: string) {
  return query<LeadActivity>(
    "SELECT * FROM lead_activities WHERE lead_id = ? ORDER BY created_at DESC",
    [leadId],
  );
}

export async function logLeadActivity(input: Partial<LeadActivity> & { workspace_id: string; lead_id: string; type: string }) {
  const id = uuid();
  await execute(
    `INSERT INTO lead_activities (id, workspace_id, lead_id, type, note, actor_id, actor_label)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, input.workspace_id, input.lead_id, input.type, input.note ?? null, input.actor_id ?? null, input.actor_label ?? null],
  );
  return (await queryOne<LeadActivity>("SELECT * FROM lead_activities WHERE id = ?", [id]))!;
}

export async function deleteLeadActivity(id: string) {
  await execute("DELETE FROM lead_activities WHERE id = ?", [id]);
}

/* ----------------------------------- tasks -------------------------------- */

export async function listTasks(workspaceId: string) {
  return query<Task>(
    "SELECT * FROM tasks WHERE workspace_id = ? ORDER BY CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at ASC",
    [workspaceId],
  );
}

export async function createTask(input: Partial<Task> & { workspace_id: string; title: string }) {
  const id = uuid();
  await execute(
    `INSERT INTO tasks (id, workspace_id, title, description, due_at, priority, status, assigned_to, lead_id, customer_id, property_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, input.workspace_id, input.title, input.description ?? null,
      input.due_at ?? null, input.priority ?? "Medium", input.status ?? "Open",
      input.assigned_to ?? null, input.lead_id ?? null, input.customer_id ?? null,
      input.property_id ?? null, input.created_by ?? null,
    ],
  );
  return (await queryOne<Task>("SELECT * FROM tasks WHERE id = ?", [id]))!;
}

export async function updateTask(id: string, patch: Partial<Task>) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [key, val] of Object.entries(patch)) {
    if (key === "id" || key === "created_at" || key === "workspace_id") continue;
    sets.push(`\`${key}\` = ?`);
    vals.push(val);
  }
  if (sets.length === 0) return (await queryOne<Task>("SELECT * FROM tasks WHERE id = ?", [id]))!;
  vals.push(id);
  await execute(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`, vals);
  return (await queryOne<Task>("SELECT * FROM tasks WHERE id = ?", [id]))!;
}

export async function deleteTask(id: string) {
  await execute("DELETE FROM tasks WHERE id = ?", [id]);
}

/* -------------------------------- calendar -------------------------------- */

export async function listEvents(workspaceId: string) {
  return query<CalendarEvent>(
    "SELECT * FROM calendar_events WHERE workspace_id = ? ORDER BY start_at ASC",
    [workspaceId],
  );
}

export async function createEvent(input: Partial<CalendarEvent> & { workspace_id: string; title: string; start_at: string }) {
  const id = uuid();
  await execute(
    `INSERT INTO calendar_events (id, workspace_id, title, type, status, start_at, end_at, location, notes, lead_id, customer_id, property_id, assigned_to, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, input.workspace_id, input.title, input.type ?? "Meeting",
      input.status ?? "Scheduled", input.start_at, input.end_at ?? null,
      input.location ?? null, input.notes ?? null, input.lead_id ?? null,
      input.customer_id ?? null, input.property_id ?? null,
      input.assigned_to ?? null, input.created_by ?? null,
    ],
  );
  return (await queryOne<CalendarEvent>("SELECT * FROM calendar_events WHERE id = ?", [id]))!;
}

export async function updateEvent(id: string, patch: Partial<CalendarEvent>) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [key, val] of Object.entries(patch)) {
    if (key === "id" || key === "created_at" || key === "workspace_id") continue;
    sets.push(`\`${key}\` = ?`);
    vals.push(val);
  }
  if (sets.length === 0) return (await queryOne<CalendarEvent>("SELECT * FROM calendar_events WHERE id = ?", [id]))!;
  vals.push(id);
  await execute(`UPDATE calendar_events SET ${sets.join(", ")} WHERE id = ?`, vals);
  return (await queryOne<CalendarEvent>("SELECT * FROM calendar_events WHERE id = ?", [id]))!;
}

export async function deleteEvent(id: string) {
  await execute("DELETE FROM calendar_events WHERE id = ?", [id]);
}

/* --------------------------------- finance -------------------------------- */

export async function listInvoices(workspaceId: string) {
  return query<Invoice>(
    "SELECT * FROM invoices WHERE workspace_id = ? ORDER BY created_at DESC",
    [workspaceId],
  );
}

export async function getInvoice(id: string) {
  const invoice = await queryOne<Invoice>("SELECT * FROM invoices WHERE id = ?", [id]);
  if (!invoice) return null;
  const items = await query<InvoiceItem>(
    "SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY position",
    [id],
  );
  const payments = await query<Payment>(
    "SELECT * FROM payments WHERE invoice_id = ? ORDER BY paid_at DESC",
    [id],
  );
  return { invoice, items, payments };
}

export type InvoiceLineInput = { description: string; quantity: number; unit_amount: number };

export function invoiceTotals(lines: InvoiceLineInput[], taxRate: number) {
  const subtotal = lines.reduce((sum, l) => sum + Number(l.quantity || 0) * Number(l.unit_amount || 0), 0);
  const taxAmount = Math.round(subtotal * (Number(taxRate) || 0)) / 100;
  return { subtotal, taxAmount, total: subtotal + taxAmount };
}

export async function nextInvoiceNumber(workspaceId: string) {
  const rows = await query<{ invoice_number: string }>(
    "SELECT invoice_number FROM invoices WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 50",
    [workspaceId],
  );
  const year = new Date().getFullYear();
  let max = 0;
  for (const r of rows) {
    const m = /(\d+)\s*$/.exec(r.invoice_number ?? "");
    if (m?.[1]) max = Math.max(max, Number(m[1]));
  }
  return `INV-${year}-${String(max + 1).padStart(4, "0")}`;
}

export async function saveInvoice(params: {
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
}) {
  const { subtotal, taxAmount, total } = invoiceTotals(params.lines, Number(params.invoice.tax_rate ?? 0));

  return transaction(async (conn) => {
    let invoiceId: string;

    if (params.id) {
      invoiceId = params.id;
      await conn.execute(
        `UPDATE invoices SET invoice_number=?, customer_id=?, property_id=?, status=?, issue_date=?, due_date=?, currency=?, tax_rate=?, subtotal=?, tax_amount=?, total=?, notes=? WHERE id=?`,
        [
          params.invoice.invoice_number, params.invoice.customer_id ?? null,
          params.invoice.property_id ?? null, params.invoice.status ?? "Draft",
          params.invoice.issue_date, params.invoice.due_date ?? null,
          params.invoice.currency ?? "INR", params.invoice.tax_rate ?? 0,
          subtotal, taxAmount, total, params.invoice.notes ?? null, invoiceId,
        ],
      );
      await conn.execute("DELETE FROM invoice_items WHERE invoice_id = ?", [invoiceId]);
    } else {
      invoiceId = uuid();
      await conn.execute(
        `INSERT INTO invoices (id, workspace_id, invoice_number, customer_id, property_id, status, issue_date, due_date, currency, tax_rate, subtotal, tax_amount, total, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceId, params.workspaceId, params.invoice.invoice_number,
          params.invoice.customer_id ?? null, params.invoice.property_id ?? null,
          params.invoice.status ?? "Draft", params.invoice.issue_date,
          params.invoice.due_date ?? null, params.invoice.currency ?? "INR",
          params.invoice.tax_rate ?? 0, subtotal, taxAmount, total,
          params.invoice.notes ?? null, params.userId,
        ],
      );
    }

    for (let i = 0; i < params.lines.length; i++) {
      const l = params.lines[i]!;
      await conn.execute(
        `INSERT INTO invoice_items (id, workspace_id, invoice_id, description, quantity, unit_amount, amount, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuid(), params.workspaceId, invoiceId, l.description,
          l.quantity, l.unit_amount,
          Number(l.quantity || 0) * Number(l.unit_amount || 0), i,
        ],
      );
    }

    const [rows] = await conn.execute("SELECT * FROM invoices WHERE id = ?", [invoiceId]);
    return (rows as Invoice[])[0]!;
  });
}

export async function updateInvoiceStatus(id: string, status: string) {
  await execute("UPDATE invoices SET status = ? WHERE id = ?", [status, id]);
  return (await queryOne<Invoice>("SELECT * FROM invoices WHERE id = ?", [id]))!;
}

export async function deleteInvoice(id: string) {
  await execute("DELETE FROM invoices WHERE id = ?", [id]);
}

export async function listPayments(workspaceId: string) {
  return query<Payment>(
    "SELECT * FROM payments WHERE workspace_id = ? ORDER BY paid_at DESC",
    [workspaceId],
  );
}

export async function createPayment(input: Partial<Payment> & { workspace_id: string; amount: number }) {
  const id = uuid();
  await execute(
    `INSERT INTO payments (id, workspace_id, invoice_id, customer_id, amount, currency, method, status, paid_at, reference, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, input.workspace_id, input.invoice_id ?? null, input.customer_id ?? null,
      input.amount, input.currency ?? "INR", input.method ?? "Bank Transfer",
      input.status ?? "Received",
      input.paid_at ?? new Date().toISOString().slice(0, 19).replace("T", " "),
      input.reference ?? null, input.notes ?? null, input.created_by ?? null,
    ],
  );
  const payment = (await queryOne<Payment>("SELECT * FROM payments WHERE id = ?", [id]))!;
  if (payment.invoice_id) await reconcileInvoice(payment.invoice_id);
  return payment;
}

export async function updatePayment(id: string, patch: Partial<Payment>) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [key, val] of Object.entries(patch)) {
    if (key === "id" || key === "created_at" || key === "workspace_id") continue;
    sets.push(`\`${key}\` = ?`);
    vals.push(val);
  }
  if (sets.length > 0) {
    vals.push(id);
    await execute(`UPDATE payments SET ${sets.join(", ")} WHERE id = ?`, vals);
  }
  const payment = (await queryOne<Payment>("SELECT * FROM payments WHERE id = ?", [id]))!;
  if (payment.invoice_id) await reconcileInvoice(payment.invoice_id);
  return payment;
}

export async function deletePayment(id: string) {
  const existing = await queryOne<Payment>("SELECT * FROM payments WHERE id = ?", [id]);
  await execute("DELETE FROM payments WHERE id = ?", [id]);
  if (existing?.invoice_id) await reconcileInvoice(existing.invoice_id);
}

/** Keeps invoice status in sync with the payments recorded against it. */
export async function reconcileInvoice(invoiceId: string) {
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

export function paidAmount(payments: Payment[]) {
  return payments.filter((p) => p.status === "Received").reduce((s, p) => s + Number(p.amount), 0);
}

/* ----------------------------- platform config ---------------------------- */

export async function listPlans() {
  return query<Plan>("SELECT * FROM plans ORDER BY sort_order");
}

export async function createPlan(input: Partial<Plan> & { code: string; name: string }) {
  const id = uuid();
  await execute(
    `INSERT INTO plans (id, code, name, description, price_monthly, currency, seat_limit, features, is_active, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, input.code, input.name, input.description ?? null,
      input.price_monthly ?? 0, input.currency ?? "INR",
      input.seat_limit ?? 10, input.features ? (typeof input.features === "string" ? input.features : JSON.stringify(input.features)) : null,
      input.is_active !== false ? 1 : 0, input.sort_order ?? 0,
    ],
  );
  return (await queryOne<Plan>("SELECT * FROM plans WHERE id = ?", [id]))!;
}

export async function updatePlan(id: string, patch: Partial<Plan>) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [key, val] of Object.entries(patch)) {
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
  if (sets.length === 0) return (await queryOne<Plan>("SELECT * FROM plans WHERE id = ?", [id]))!;
  vals.push(id);
  await execute(`UPDATE plans SET ${sets.join(", ")} WHERE id = ?`, vals);
  return (await queryOne<Plan>("SELECT * FROM plans WHERE id = ?", [id]))!;
}

export async function deletePlan(id: string) {
  await execute("DELETE FROM plans WHERE id = ?", [id]);
}

export async function listPromoMedia() {
  return query<PromoMedia>(
    "SELECT * FROM promo_media ORDER BY priority, created_at",
  );
}

export async function createPromoMedia(input: Partial<PromoMedia> & { title: string }) {
  const id = uuid();
  await execute(
    `INSERT INTO promo_media (id, title, body, image_url, target, priority, start_at, end_at, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, input.title, input.body ?? null, input.image_url ?? null,
      input.target ?? "All workspaces", input.priority ?? 1,
      input.start_at ?? new Date().toISOString().slice(0, 19).replace("T", " "),
      input.end_at ?? null, input.is_active !== false ? 1 : 0,
    ],
  );
  return (await queryOne<PromoMedia>("SELECT * FROM promo_media WHERE id = ?", [id]))!;
}

export async function updatePromoMedia(id: string, patch: Partial<PromoMedia>) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [key, val] of Object.entries(patch)) {
    if (key === "id" || key === "created_at") continue;
    sets.push(`\`${key}\` = ?`);
    if (key === "is_active") {
      vals.push(val ? 1 : 0);
    } else {
      vals.push(val);
    }
  }
  if (sets.length === 0) return (await queryOne<PromoMedia>("SELECT * FROM promo_media WHERE id = ?", [id]))!;
  vals.push(id);
  await execute(`UPDATE promo_media SET ${sets.join(", ")} WHERE id = ?`, vals);
  return (await queryOne<PromoMedia>("SELECT * FROM promo_media WHERE id = ?", [id]))!;
}

export async function deletePromoMedia(id: string) {
  await execute("DELETE FROM promo_media WHERE id = ?", [id]);
}

export type PlatformSettings = Record<string, Record<string, unknown>>;

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const rows = await query<{ key: string; value: string }>(
    "SELECT `key`, `value` FROM platform_settings",
  );
  return Object.fromEntries(
    rows.map((r) => [r.key, typeof r.value === "string" ? JSON.parse(r.value) : r.value ?? {}]),
  );
}

export async function savePlatformSettings(key: string, value: Record<string, unknown>) {
  await execute(
    `INSERT INTO platform_settings (\`key\`, value, updated_at)
     VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = NOW()`,
    [key, JSON.stringify(value)],
  );
}

/* --------------------------------- audit ---------------------------------- */

export async function listAuditLogs(params: { workspaceId?: string; limit?: number } = {}) {
  const conditions: string[] = [];
  const vals: unknown[] = [];
  if (params.workspaceId) {
    conditions.push("workspace_id = ?");
    vals.push(params.workspaceId);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = params.limit ?? 200;
  vals.push(limit);
  return query<AuditLog>(
    `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ?`,
    vals,
  );
}

export async function recordAudit(input: Partial<AuditLog> & { action: string }) {
  try {
    const id = uuid();
    await execute(
      `INSERT INTO audit_logs (id, workspace_id, actor_id, actor_label, action, entity_type, entity_id, metadata, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, input.workspace_id ?? null, input.actor_id ?? null,
        input.actor_label ?? null, input.action, input.entity_type ?? null,
        input.entity_id ?? null,
        input.metadata ? (typeof input.metadata === "string" ? input.metadata : JSON.stringify(input.metadata)) : null,
        input.ip_address ?? null,
      ],
    );
  } catch (err) {
    // Audit writes must never break the user's action.
    console.warn("audit log failed", err instanceof Error ? err.message : err);
  }
}
