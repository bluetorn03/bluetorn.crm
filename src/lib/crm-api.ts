/**
 * BLUETORN CRM — client-safe data access layer.
 *
 * Forwards requests to TanStack Start server functions in crm.functions.ts.
 * Contains NO direct database imports (no mysql2, no db.ts).
 */
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

import {
  listMembersFn,
  listCustomersFn,
  getCustomerFn,
  createCustomerFn,
  updateCustomerFn,
  deleteCustomerFn,
  listPropertiesFn,
  getPropertyFn,
  createPropertyFn,
  updatePropertyFn,
  deletePropertyFn,
  listLeadsFn,
  getLeadFn,
  createLeadFn,
  updateLeadFn,
  deleteLeadFn,
  convertLeadToCustomerFn,
  listLeadActivityFn,
  logLeadActivityFn,
  deleteLeadActivityFn,
  listTasksFn,
  createTaskFn,
  updateTaskFn,
  deleteTaskFn,
  listEventsFn,
  createEventFn,
  updateEventFn,
  deleteEventFn,
  listInvoicesFn,
  getInvoiceFn,
  nextInvoiceNumberFn,
  saveInvoiceFn,
  updateInvoiceStatusFn,
  deleteInvoiceFn,
  listPaymentsFn,
  createPaymentFn,
  updatePaymentFn,
  deletePaymentFn,
  reconcileInvoiceFn,
  listPlansFn,
  createPlanFn,
  updatePlanFn,
  deletePlanFn,
  listPromoMediaFn,
  createPromoMediaFn,
  updatePromoMediaFn,
  deletePromoMediaFn,
  getPlatformSettingsFn,
  savePlatformSettingsFn,
  listAuditLogsFn,
  recordAuditFn,
  getDashboardDataFn,
  searchCrmFn,
  listNotificationsFn,
  unreadNotificationCountFn,
  markNotificationReadFn,
  markAllNotificationsReadFn,
  invoiceTotals,
  type Member,
  type InvoiceLineInput,
  type PlatformSettings,
  type DashboardData,
  type SearchResult,
} from "./crm.functions";

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
  Member,
  InvoiceLineInput,
  PlatformSettings,
  DashboardData,
  SearchResult,
  Notification,
};

export type Activity = DashboardData["recentActivities"][number];

export { invoiceTotals };

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
  dashboard: (ws: string) => ["dashboard", ws] as const,
  search: (ws: string, q: string) => ["search", ws, q] as const,
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
  notifications: () => ["notifications"] as const,
  notificationCount: () => ["notification-count"] as const,
};

/* -------------------------------- members --------------------------------- */

export async function listMembers(workspaceId: string): Promise<Member[]> {
  return listMembersFn({ data: { workspaceId } });
}

/* -------------------------------- customers ------------------------------- */

export async function listCustomers(workspaceId: string): Promise<Customer[]> {
  return listCustomersFn({ data: { workspaceId } });
}

export async function getCustomer(id: string): Promise<Customer | null> {
  return getCustomerFn({ data: { id } });
}

export async function createCustomer(
  input: Partial<Customer> & { workspace_id: string; name: string },
): Promise<Customer> {
  return createCustomerFn({ data: input });
}

export async function updateCustomer(
  id: string,
  patch: Partial<Customer>,
): Promise<Customer> {
  return updateCustomerFn({ data: { id, patch } });
}

export async function deleteCustomer(id: string): Promise<void> {
  await deleteCustomerFn({ data: { id } });
}

/* -------------------------------- properties ------------------------------ */

export async function listProperties(workspaceId: string): Promise<Property[]> {
  return listPropertiesFn({ data: { workspaceId } });
}

export async function getProperty(id: string): Promise<Property | null> {
  return getPropertyFn({ data: { id } });
}

export async function createProperty(
  input: Partial<Property> & { workspace_id: string; name: string },
): Promise<Property> {
  return createPropertyFn({ data: input });
}

export async function updateProperty(
  id: string,
  patch: Partial<Property>,
): Promise<Property> {
  return updatePropertyFn({ data: { id, patch } });
}

export async function deleteProperty(id: string): Promise<void> {
  await deletePropertyFn({ data: { id } });
}

/* ----------------------------------- leads -------------------------------- */

export async function listLeads(workspaceId: string): Promise<Lead[]> {
  return listLeadsFn({ data: { workspaceId } });
}

export async function getLead(id: string): Promise<Lead | null> {
  return getLeadFn({ data: { id } });
}

export async function createLead(
  input: Partial<Lead> & { workspace_id: string; name: string },
): Promise<Lead> {
  return createLeadFn({ data: input });
}

export async function updateLead(
  id: string,
  patch: Partial<Lead>,
): Promise<Lead> {
  return updateLeadFn({ data: { id, patch } });
}

export async function deleteLead(id: string): Promise<void> {
  await deleteLeadFn({ data: { id } });
}

export async function convertLeadToCustomer(
  leadId: string,
): Promise<{ customer: Customer; alreadyConverted: boolean; isNew: boolean }> {
  return convertLeadToCustomerFn({ data: { leadId } });
}

export async function listLeadActivity(leadId: string): Promise<LeadActivity[]> {
  return listLeadActivityFn({ data: { leadId } });
}

export async function logLeadActivity(
  input: Partial<LeadActivity> & { workspace_id: string; lead_id: string; type: string },
): Promise<LeadActivity> {
  return logLeadActivityFn({ data: input });
}

export async function deleteLeadActivity(id: string): Promise<void> {
  await deleteLeadActivityFn({ data: { id } });
}

/* ----------------------------------- tasks -------------------------------- */

export async function listTasks(workspaceId: string): Promise<Task[]> {
  return listTasksFn({ data: { workspaceId } });
}

export async function createTask(
  input: Partial<Task> & { workspace_id: string; title: string },
): Promise<Task> {
  return createTaskFn({ data: input });
}

export async function updateTask(
  id: string,
  patch: Partial<Task>,
): Promise<Task> {
  return updateTaskFn({ data: { id, patch } });
}

export async function deleteTask(id: string): Promise<void> {
  await deleteTaskFn({ data: { id } });
}

/* -------------------------------- calendar -------------------------------- */

export async function listEvents(workspaceId: string): Promise<CalendarEvent[]> {
  return listEventsFn({ data: { workspaceId } });
}

export async function createEvent(
  input: Partial<CalendarEvent> & { workspace_id: string; title: string; start_at: string },
): Promise<CalendarEvent> {
  return createEventFn({ data: input });
}

export async function updateEvent(
  id: string,
  patch: Partial<CalendarEvent>,
): Promise<CalendarEvent> {
  return updateEventFn({ data: { id, patch } });
}

export async function deleteEvent(id: string): Promise<void> {
  await deleteEventFn({ data: { id } });
}

/* --------------------------------- finance -------------------------------- */

export async function listInvoices(workspaceId: string): Promise<Invoice[]> {
  return listInvoicesFn({ data: { workspaceId } });
}

export async function getInvoice(
  id: string,
): Promise<{ invoice: Invoice; items: InvoiceItem[]; payments: Payment[] } | null> {
  return getInvoiceFn({ data: { id } });
}

export async function nextInvoiceNumber(workspaceId: string): Promise<string> {
  return nextInvoiceNumberFn({ data: { workspaceId } });
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
}): Promise<Invoice> {
  return saveInvoiceFn({ data: params });
}

export async function updateInvoiceStatus(id: string, status: string): Promise<Invoice> {
  return updateInvoiceStatusFn({ data: { id, status } });
}

export async function deleteInvoice(id: string): Promise<void> {
  await deleteInvoiceFn({ data: { id } });
}

export async function listPayments(workspaceId: string): Promise<Payment[]> {
  return listPaymentsFn({ data: { workspaceId } });
}

export async function createPayment(
  input: Partial<Payment> & { workspace_id: string; amount: number },
): Promise<Payment> {
  return createPaymentFn({ data: input });
}

export async function updatePayment(
  id: string,
  patch: Partial<Payment>,
): Promise<Payment> {
  return updatePaymentFn({ data: { id, patch } });
}

export async function deletePayment(id: string): Promise<void> {
  await deletePaymentFn({ data: { id } });
}

export async function reconcileInvoice(invoiceId: string): Promise<void> {
  await reconcileInvoiceFn({ data: { invoiceId } });
}

export function paidAmount(payments: Payment[]): number {
  return payments.filter((p) => p.status === "Received").reduce((s, p) => s + Number(p.amount), 0);
}

/* ----------------------------- platform config ---------------------------- */

export async function listPlans(): Promise<Plan[]> {
  return listPlansFn();
}

export async function createPlan(
  input: Partial<Plan> & { code: string; name: string },
): Promise<Plan> {
  return createPlanFn({ data: input });
}

export async function updatePlan(
  id: string,
  patch: Partial<Plan>,
): Promise<Plan> {
  return updatePlanFn({ data: { id, patch } });
}

export async function deletePlan(id: string): Promise<void> {
  await deletePlanFn({ data: { id } });
}

export async function listPromoMedia(): Promise<PromoMedia[]> {
  return listPromoMediaFn();
}

export async function createPromoMedia(
  input: Partial<PromoMedia> & { title: string },
): Promise<PromoMedia> {
  return createPromoMediaFn({ data: input });
}

export async function updatePromoMedia(
  id: string,
  patch: Partial<PromoMedia>,
): Promise<PromoMedia> {
  return updatePromoMediaFn({ data: { id, patch } });
}

export async function deletePromoMedia(id: string): Promise<void> {
  await deletePromoMediaFn({ data: { id } });
}

export async function getPlatformSettings(): Promise<PlatformSettings> {
  return getPlatformSettingsFn();
}

export async function savePlatformSettings(
  key: string,
  value: Record<string, unknown>,
): Promise<void> {
  await savePlatformSettingsFn({ data: { key, value } });
}

/* --------------------------------- audit ---------------------------------- */

export async function listAuditLogs(
  params: { workspaceId?: string; limit?: number } = {},
): Promise<AuditLog[]> {
  return listAuditLogsFn({ data: params });
}

export async function recordAudit(
  input: Partial<AuditLog> & { action: string },
): Promise<void> {
  await recordAuditFn({ data: input });
}

/* ------------------------------- dashboard -------------------------------- */

export async function getDashboardData(
  workspaceId: string,
  userRole?: string,
  userName?: string,
): Promise<DashboardData> {
  const payload: { workspaceId: string; userRole?: string; userName?: string } = { workspaceId };
  if (userRole) payload.userRole = userRole;
  if (userName) payload.userName = userName;
  return getDashboardDataFn({ data: payload });
}

/* --------------------------------- search ---------------------------------- */

export async function searchCrm(
  workspaceId: string,
  query: string,
): Promise<SearchResult> {
  return searchCrmFn({ data: { workspaceId, query } });
}

/* ------------------------------ notifications ------------------------------ */

export async function listNotifications(limit?: number): Promise<Notification[]> {
  return listNotificationsFn({ data: limit !== undefined ? { limit } : {} });
}

export async function getUnreadNotificationCount(): Promise<number> {
  const result = await unreadNotificationCountFn();
  return result.count;
}

export async function markNotificationRead(id: string): Promise<void> {
  await markNotificationReadFn({ data: { id } });
}

export async function markAllNotificationsRead(): Promise<void> {
  await markAllNotificationsReadFn();
}
