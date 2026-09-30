/**
 * BLUETORN CRM — MySQL-native type definitions.
 *
 * Native type definitions matching the MySQL database schema so that
 * every UI component continues to work seamlessly without changes.
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
  gstin?: string | null;
  pan?: string | null;
  state?: string | null;
  state_code?: string | null;
  website?: string | null;
  bank_name?: string | null;
  bank_account_no?: string | null;
  bank_account_name?: string | null;
  bank_ifsc?: string | null;
  invoice_prefix?: string;
  default_payment_terms_days?: number;
  default_invoice_notes?: string | null;
  default_invoice_terms?: string | null;
  seat_limit: number;
  chat_retention_days?: number;
  created_at: string;
  updated_at: string;
}

/* ----------------------------- user_permissions ---------------------------- */
export interface UserPermission {
  id: string;
  workspace_id: string;
  user_id: string;
  permission: string;
  created_at: string;
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
  assigned_at: string | null;
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
  assigned_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/* -------------------------------- lead_options ----------------------------- */
export type LeadOptionType =
  | "source"
  | "location"
  | "purpose"
  | "possession_timeline"
  | "transaction_timeline"
  | "phase";

export interface LeadOption {
  id: string;
  workspace_id: string;
  type: LeadOptionType;
  name: string;
  stable_key: string | null;
  is_system: boolean | number;
  is_active: boolean | number;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
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
  source_option_id?: string | null;
  location_option_id?: string | null;
  purpose_option_id?: string | null;
  possession_timeline_option_id?: string | null;
  transaction_timeline_option_id?: string | null;
  phase_option_id?: string | null;
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
  assigned_at: string | null;
  property_id: string | null;
  customer_id: string | null;
  notes: string | null;
  created_by: string | null;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
  // Resolved option names & stable identity
  source_option_name?: string | null;
  source_stable_key?: string | null;
  location_name?: string | null;
  purpose_name?: string | null;
  possession_timeline_name?: string | null;
  transaction_timeline_name?: string | null;
  phase_name?: string | null;
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
  assigned_at: string | null;
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
  financial_year?: string | null;
  invoice_type?: string;
  customer_id: string | null;
  lead_id?: string | null;
  property_id: string | null;
  assigned_to?: string | null;
  updated_by?: string | null;
  status: string;
  issue_date: string;
  due_date: string | null;
  currency: string;
  tax_rate: number;
  subtotal: number;
  discount?: number;
  taxable_amount?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  cess?: number;
  tax_amount: number;
  total: number;
  place_of_supply?: string | null;
  notes: string | null;
  terms?: string | null;
  cancellation_reason?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  customer_city?: string | null;
  lead_name?: string | null;
  property_name?: string | null;
  created_by_name?: string | null;
  assigned_to_name?: string | null;
  creator_name?: string | null;
  assignee_name?: string | null;
  updated_by_name?: string | null;
  cancelled_by_name?: string | null;
}

/* ------------------------------- invoice_items ----------------------------- */
export interface InvoiceItem {
  id: string;
  workspace_id: string;
  invoice_id: string;
  description: string;
  hsn_sac?: string | null;
  quantity: number;
  unit?: string | null;
  rate?: number;
  unit_amount: number;
  discount?: number;
  tax_rate?: number;
  tax_type?: string;
  tax_amount?: number;
  line_total?: number;
  amount: number;
  position?: number;
}

/* --------------------------------- payments -------------------------------- */
export interface Payment {
  id: string;
  workspace_id: string;
  invoice_id: string | null;
  customer_id: string | null;
  assigned_to?: string | null;
  updated_by?: string | null;
  amount: number;
  currency: string;
  method: string;
  status: string;
  paid_at: string;
  reference: string | null;
  notes: string | null;
  reversal_reason?: string | null;
  reversed_at?: string | null;
  reversed_by?: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  invoice_number?: string | null;
  customer_name?: string | null;
  created_by_name?: string | null;
  assigned_to_name?: string | null;
  creator_name?: string | null;
  assignee_name?: string | null;
  updated_by_name?: string | null;
  reversed_by_name?: string | null;
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

/* ------------------------------ notifications ------------------------------ */
export interface Notification {
  id: string;
  workspace_id: string;
  user_id: string;
  type: string;
  title: string;
  message: string | null;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_by: string | null;
  created_at: string;
}

/* --------------------------- chat_conversations ---------------------------- */
export type ChatConversationType = "direct" | "group";
export type ChatGroupStatus = "active" | "archived";

export interface ChatConversation {
  id: string;
  workspace_id: string;
  type?: ChatConversationType | undefined;
  title?: string | null | undefined;
  description?: string | null | undefined;
  owner_id?: string | null | undefined;
  status?: ChatGroupStatus | undefined;
  user1_id?: string | null | undefined;
  user2_id?: string | null | undefined;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

/* ----------------------- chat_conversation_members ------------------------ */
export interface ChatConversationMember {
  id: string;
  conversation_id: string;
  workspace_id: string;
  user_id: string;
  role: "owner" | "member";
  joined_at: string;
  left_at?: string | null | undefined;
  status: "active" | "left" | "removed";
  last_read_at?: string | null | undefined;
  created_at: string;
  updated_at: string;
  user_code?: string | undefined;
  full_name?: string | undefined;
  job_title?: string | null | undefined;
  avatar_url?: string | null | undefined;
  is_active?: boolean | undefined;
}

/* ------------------------------ chat_messages ------------------------------ */
export interface ChatMessage {
  id: string;
  workspace_id: string;
  conversation_id: string;
  sender_id: string;
  receiver_id: string | null;
  body: string;
  is_read: boolean | number;
  read_at: string | null;
  created_at: string;
  expires_at: string;
  sender_name?: string | null | undefined;
  sender_code?: string | null | undefined;
  sender_avatar?: string | null | undefined;
  sender_is_active?: boolean | undefined;
}

export interface ChatParticipant {
  id: string;
  user_code: string;
  full_name: string;
  job_title: string | null;
  avatar_url: string | null;
  is_active: boolean;
  role: string | null;
}

export interface ChatConversationSummary {
  id: string;
  workspace_id: string;
  type: ChatConversationType;
  title?: string | null | undefined;
  description?: string | null | undefined;
  owner_id?: string | null | undefined;
  status?: ChatGroupStatus | undefined;
  memberCount?: number | undefined;
  participant?: ChatParticipant | null | undefined;
  lastMessage: {
    id: string;
    body: string;
    sender_id: string;
    sender_name?: string | null | undefined;
    created_at: string;
    is_read: boolean;
  } | null;
  unreadCount: number;
  updated_at: string;
}

