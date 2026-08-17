/**
 * BLUETORN CRM — MySQL-native type definitions.
 *
 * These replace the Supabase-generated `Tables<"...">` types while keeping the
 * exact same shape so that every UI component continues to work without changes.
 */

/* -------------------------------- workspaces ------------------------------- */
export interface Workspace {
  id: string;
  code: string;
  name: string;
  legal_name: string | null;
  industry: string;
  plan: string;
  status: string;
  currency: string;
  timezone: string;
  date_format: string;
  time_format: string;
  logo_url: string | null;
  primary_color: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  seat_limit: number;
  created_at: string;
  updated_at: string;
}

/* --------------------------------- profiles -------------------------------- */
export interface Profile {
  id: string;
  workspace_id: string | null;
  user_code: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  avatar_url: string | null;
  password_hash: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

/* ------------------------------- user_roles -------------------------------- */
export interface UserRole {
  id: string;
  user_id: string;
  workspace_id: string | null;
  role: "super_admin" | "owner" | "manager" | "employee";
  created_at: string;
}

/* -------------------------------- customers -------------------------------- */
export interface Customer {
  id: string;
  workspace_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  type: string;
  status: string;
  city: string | null;
  currency: string;
  value: number;
  tags: string | null; // JSON string in MySQL
  notes: string | null;
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/* -------------------------------- properties ------------------------------- */
export interface Property {
  id: string;
  workspace_id: string;
  name: string;
  location: string | null;
  type: string;
  status: string;
  price: number;
  currency: string;
  bedrooms: number | null;
  area_sqft: number | null;
  image_url: string | null;
  description: string | null;
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/* ----------------------------------- leads --------------------------------- */
export interface Lead {
  id: string;
  workspace_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: string;
  campaign: string | null;
  external_id: string | null;
  status: string;
  requirement: string | null;
  budget: number;
  currency: string;
  score: number;
  next_follow_up: string | null;
  received_at: string;
  assigned_to: string | null;
  property_id: string | null;
  customer_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/* ----------------------------- lead_activities ----------------------------- */
export interface LeadActivity {
  id: string;
  workspace_id: string;
  lead_id: string;
  type: string;
  note: string | null;
  actor_id: string | null;
  actor_label: string | null;
  created_at: string;
}

/* ----------------------------------- tasks --------------------------------- */
export interface Task {
  id: string;
  workspace_id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  priority: string;
  status: string;
  assigned_to: string | null;
  lead_id: string | null;
  customer_id: string | null;
  property_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/* ----------------------------- calendar_events ----------------------------- */
export interface CalendarEvent {
  id: string;
  workspace_id: string;
  title: string;
  type: string;
  status: string;
  start_at: string;
  end_at: string | null;
  location: string | null;
  notes: string | null;
  lead_id: string | null;
  customer_id: string | null;
  property_id: string | null;
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/* --------------------------------- invoices -------------------------------- */
export interface Invoice {
  id: string;
  workspace_id: string;
  invoice_number: string;
  customer_id: string | null;
  property_id: string | null;
  status: string;
  issue_date: string;
  due_date: string | null;
  currency: string;
  tax_rate: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/* ------------------------------- invoice_items ----------------------------- */
export interface InvoiceItem {
  id: string;
  workspace_id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_amount: number;
  amount: number;
  position: number;
}

/* --------------------------------- payments -------------------------------- */
export interface Payment {
  id: string;
  workspace_id: string;
  invoice_id: string | null;
  customer_id: string | null;
  amount: number;
  currency: string;
  method: string;
  status: string;
  paid_at: string;
  reference: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/* ----------------------------------- plans --------------------------------- */
export interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price_monthly: number;
  currency: string;
  seat_limit: number;
  features: string | null; // JSON string
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/* ------------------------------- promo_media ------------------------------- */
export interface PromoMedia {
  id: string;
  title: string;
  body: string | null;
  image_url: string | null;
  target: string;
  priority: number;
  start_at: string;
  end_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/* ----------------------------- platform_settings --------------------------- */
export interface PlatformSetting {
  key: string;
  value: string; // JSON string
  updated_at: string;
  updated_by: string | null;
}

/* ------------------------------- audit_logs -------------------------------- */
export interface AuditLog {
  id: string;
  workspace_id: string | null;
  actor_id: string | null;
  actor_label: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: string | null; // JSON string
  ip_address: string | null;
  created_at: string;
}
