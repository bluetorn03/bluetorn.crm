import property1 from "@/assets/property-1.jpg";
import property2 from "@/assets/property-2.jpg";
import property3 from "@/assets/property-3.jpg";
import property4 from "@/assets/property-4.jpg";
import promo1 from "@/assets/promo-1.jpg";
import promo2 from "@/assets/promo-2.jpg";
import promo3 from "@/assets/promo-3.jpg";
import type { CurrencyCode } from "./format";

export type Role = "Owner" | "Manager" | "Employee" | "Super Admin";

/* ---------------------------------- dates --------------------------------- */
const now = new Date();
const at = (dayOffset: number, hour = 10, minute = 0) => {
  const d = new Date(now);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};
export const iso = at;

/* -------------------------------- workspaces ------------------------------- */
export type WorkspaceStatus = "Active" | "Inactive" | "Suspended" | "Trial";

export type Workspace = {
  id: string;
  code: string;
  name: string;
  industry: string;
  plan: "Starter" | "Growth" | "Scale";
  status: WorkspaceStatus;
  owner: string;
  ownerEmail: string;
  phone: string;
  users: number;
  currency: CurrencyCode;
  createdAt: string;
  mrr: number;
};

export const workspaces: Workspace[] = [
  {
    id: "ws-1",
    code: "BT-RE-1042",
    name: "Skyline Realty",
    industry: "Real Estate",
    plan: "Growth",
    status: "Active",
    owner: "Arjun Mehta",
    ownerEmail: "arjun@skylinerealty.in",
    phone: "+91 98200 41042",
    users: 12,
    currency: "INR",
    createdAt: at(-320, 11),
    mrr: 7999,
  },
  {
    id: "ws-2",
    code: "BT-RE-2087",
    name: "Harbour Estates",
    industry: "Real Estate",
    plan: "Scale",
    status: "Active",
    owner: "Naomi Farrell",
    ownerEmail: "naomi@harbourestates.ae",
    phone: "+971 50 220 8871",
    users: 34,
    currency: "AED",
    createdAt: at(-210, 9),
    mrr: 22990,
  },
  {
    id: "ws-3",
    code: "BT-AG-3311",
    name: "Northlight Agency",
    industry: "Agency",
    plan: "Starter",
    status: "Trial",
    owner: "Dev Patel",
    ownerEmail: "dev@northlight.co",
    phone: "+91 90040 33110",
    users: 4,
    currency: "INR",
    createdAt: at(-11, 15),
    mrr: 0,
  },
  {
    id: "ws-4",
    code: "BT-RE-4520",
    name: "Cedar & Co Properties",
    industry: "Real Estate",
    plan: "Growth",
    status: "Suspended",
    owner: "Marcus Hale",
    ownerEmail: "marcus@cedarco.com",
    phone: "+1 415 220 4520",
    users: 8,
    currency: "USD",
    createdAt: at(-480, 13),
    mrr: 0,
  },
];

export const industryTemplates = [
  { id: "real-estate", name: "Real Estate", status: "Live", note: "Properties, site visits, bookings" },
  { id: "agency", name: "Agency", status: "Planned", note: "Retainers, projects, deliverables" },
  { id: "retail", name: "Retail", status: "Planned", note: "Store visits, catalogue, loyalty" },
  { id: "manufacturing", name: "Manufacturing", status: "Planned", note: "Enquiries, quotations, dispatch" },
  { id: "service", name: "Service Business", status: "Planned", note: "Jobs, technicians, AMC" },
  { id: "trading", name: "Trading", status: "Planned", note: "Price lists, orders, credit" },
  { id: "startup", name: "Startup", status: "Planned", note: "Pipeline, demos, onboarding" },
] as const;

/* ----------------------------------- users --------------------------------- */
export type User = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  status: "Active" | "Invited" | "Locked";
  lastActive: string;
  workspaceId: string;
};

export const users: User[] = [
  { id: "u-1", name: "Arjun Mehta", email: "arjun@skylinerealty.in", phone: "+91 98200 41042", role: "Owner", status: "Active", lastActive: at(0, 9, 20), workspaceId: "ws-1" },
  { id: "u-2", name: "Priya Nair", email: "priya@skylinerealty.in", phone: "+91 98337 11208", role: "Manager", status: "Active", lastActive: at(0, 8, 45), workspaceId: "ws-1" },
  { id: "u-3", name: "Rahul Sharma", email: "rahul@skylinerealty.in", phone: "+91 99870 55412", role: "Employee", status: "Active", lastActive: at(-1, 18, 10), workspaceId: "ws-1" },
  { id: "u-4", name: "Sana Kapoor", email: "sana@skylinerealty.in", phone: "+91 98111 77365", role: "Employee", status: "Invited", lastActive: at(-3, 12, 0), workspaceId: "ws-1" },
  { id: "u-5", name: "Vikram Rao", email: "vikram@skylinerealty.in", phone: "+91 97010 22991", role: "Employee", status: "Locked", lastActive: at(-16, 17, 30), workspaceId: "ws-1" },
  { id: "u-6", name: "Bluetorn Platform", email: "ops@bluetorn.com", phone: "+91 80000 00001", role: "Super Admin", status: "Active", lastActive: at(0, 7, 5), workspaceId: "platform" },
];

export const teamPerformance = [
  { user: "Priya Nair", leads: 48, visits: 19, won: 7, revenue: 12400000 },
  { user: "Rahul Sharma", leads: 39, visits: 14, won: 4, revenue: 6800000 },
  { user: "Sana Kapoor", leads: 22, visits: 8, won: 2, revenue: 3100000 },
  { user: "Arjun Mehta", leads: 15, visits: 6, won: 3, revenue: 5400000 },
];

/* --------------------------------- customers -------------------------------- */
export type CustomerStatus = "Active" | "Prospect" | "Archived";

export type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  type: "Buyer" | "Seller" | "Investor" | "Tenant";
  assignedTo: string;
  lastActivity: string;
  status: CustomerStatus;
  city: string;
  currency: CurrencyCode;
  value: number;
  tags: string[];
};

export const customers: Customer[] = [
  { id: "c-1", name: "Rohit Malhotra", phone: "+91 98200 11223", email: "rohit.m@gmail.com", type: "Buyer", assignedTo: "Priya Nair", lastActivity: at(0, 9, 40), status: "Active", city: "Mumbai", currency: "INR", value: 18500000, tags: ["High intent", "Home loan"] },
  { id: "c-2", name: "Ananya Deshmukh", phone: "+91 99303 44518", email: "ananya.d@outlook.com", type: "Investor", assignedTo: "Rahul Sharma", lastActivity: at(-1, 16, 15), status: "Active", city: "Pune", currency: "INR", value: 42000000, tags: ["Repeat", "Commercial"] },
  { id: "c-3", name: "Imran Qureshi", phone: "+91 98765 09912", email: "imran.q@zmail.com", type: "Seller", assignedTo: "Priya Nair", lastActivity: at(-2, 11, 5), status: "Prospect", city: "Thane", currency: "INR", value: 9200000, tags: ["Resale"] },
  { id: "c-4", name: "Meera Iyer", phone: "+91 90045 32210", email: "meera.iyer@corpmail.com", type: "Tenant", assignedTo: "Sana Kapoor", lastActivity: at(-4, 13, 25), status: "Active", city: "Bengaluru", currency: "INR", value: 850000, tags: ["Rental"] },
  { id: "c-5", name: "Gaurav Shetty", phone: "+91 98191 66772", email: "gaurav@shettyventures.in", type: "Investor", assignedTo: "Arjun Mehta", lastActivity: at(-9, 10, 0), status: "Archived", city: "Mumbai", currency: "INR", value: 0, tags: ["Dormant"] },
  { id: "c-6", name: "Fatima Sheikh", phone: "+91 97022 88134", email: "fatima.s@mailbox.com", type: "Buyer", assignedTo: "Rahul Sharma", lastActivity: at(0, 8, 10), status: "Active", city: "Navi Mumbai", currency: "INR", value: 7400000, tags: ["First home"] },
];

/* ----------------------------------- leads ---------------------------------- */
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
export type LeadSource = (typeof leadSources)[number];

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

export type Lead = {
  id: string;
  name: string;
  phone: string;
  email: string;
  source: LeadSource;
  campaign?: string;
  externalId?: string;
  receivedAt: string;
  assignedTo: string;
  status: LeadStatus;
  nextFollowUp?: string;
  budget: number;
  currency: CurrencyCode;
  interestedPropertyId?: string;
  requirement: string;
  duplicateOf?: string;
  score: number;
};

export const leads: Lead[] = [
  { id: "l-1", name: "Karan Bhatia", phone: "+91 98204 55110", email: "karan.b@gmail.com", source: "Meta Ads", campaign: "Sea View Launch — Jun", externalId: "FB-LD-88231045", receivedAt: at(0, 9, 12), assignedTo: "Priya Nair", status: "New", nextFollowUp: at(0, 17, 30), budget: 15000000, currency: "INR", interestedPropertyId: "p-1", requirement: "3 BHK, sea facing, Bandra", score: 82 },
  { id: "l-2", name: "Sneha Kulkarni", phone: "+91 99870 33241", email: "sneha.k@yahoo.com", source: "Google Ads", campaign: "Search — Luxury Villas", externalId: "GAD-4471209", receivedAt: at(0, 8, 5), assignedTo: "Rahul Sharma", status: "Contacted", nextFollowUp: at(1, 11, 0), budget: 34000000, currency: "INR", interestedPropertyId: "p-2", requirement: "Villa with pool, Lonavala", score: 74 },
  { id: "l-3", name: "Aditya Verma", phone: "+91 98191 22087", email: "aditya.v@workmail.com", source: "WhatsApp", campaign: "WA Click-to-chat", externalId: "WA-902213", receivedAt: at(-1, 19, 45), assignedTo: "Priya Nair", status: "Interested", nextFollowUp: at(0, 15, 0), budget: 9500000, currency: "INR", interestedPropertyId: "p-4", requirement: "Plot, Panvel, resale ok", score: 61 },
  { id: "l-4", name: "Nikhil Jain", phone: "+91 90210 44553", email: "nikhil.jain@bizmail.in", source: "Website", campaign: "Organic", receivedAt: at(-2, 12, 20), assignedTo: "Sana Kapoor", status: "Visit / Meeting", nextFollowUp: at(1, 16, 30), budget: 62000000, currency: "INR", interestedPropertyId: "p-3", requirement: "Commercial floor, BKC", score: 88 },
  { id: "l-5", name: "Rhea Menon", phone: "+91 98337 90012", email: "rhea.menon@gmail.com", source: "Instagram", campaign: "Reels — Open House", externalId: "IG-LD-55120", receivedAt: at(-3, 10, 10), assignedTo: "Rahul Sharma", status: "Negotiation", nextFollowUp: at(2, 12, 0), budget: 21000000, currency: "INR", interestedPropertyId: "p-1", requirement: "3 BHK, ready possession", score: 91 },
  { id: "l-6", name: "Suresh Pillai", phone: "+91 97401 88220", email: "suresh.p@mail.com", source: "Referral", receivedAt: at(-6, 14, 0), assignedTo: "Priya Nair", status: "Won", budget: 11500000, currency: "INR", interestedPropertyId: "p-2", requirement: "2 BHK investment", score: 95 },
  { id: "l-7", name: "Tanvi Rao", phone: "+91 98200 55110", email: "tanvi.rao@gmail.com", source: "Landing Page", campaign: "LP — Monsoon Offer", externalId: "LP-77120", receivedAt: at(-1, 9, 30), assignedTo: "Sana Kapoor", status: "New", nextFollowUp: at(0, 18, 0), budget: 8200000, currency: "INR", requirement: "1 BHK, budget friendly", duplicateOf: "l-1", score: 45 },
  { id: "l-8", name: "Mohit Agarwal", phone: "+91 99871 22014", email: "mohit.a@gmail.com", source: "Facebook", campaign: "Lead Form — Skyline", externalId: "FB-LD-88231099", receivedAt: at(-8, 11, 45), assignedTo: "Rahul Sharma", status: "Lost", budget: 5000000, currency: "INR", requirement: "Budget mismatch", score: 22 },
];

export const pipelineStages = leadStatuses.filter((s) => s !== "Lost");

/* --------------------------------- properties ------------------------------- */
export type PropertyStatus = "Available" | "Reserved" | "Booked" | "Sold";

export type Property = {
  id: string;
  name: string;
  location: string;
  price: number;
  currency: CurrencyCode;
  type: "Apartment" | "Villa" | "Commercial" | "Plot";
  area: string;
  beds?: number;
  status: PropertyStatus;
  image: string;
  ownerName: string;
  ownerPhone: string;
  archived?: boolean;
  highlights: string[];
  documents: { name: string; size: string; uploadedAt: string }[];
};

export const properties: Property[] = [
  { id: "p-1", name: "Azure Heights — 1204", location: "Bandra West, Mumbai", price: 18500000, currency: "INR", type: "Apartment", area: "1,240 sq.ft", beds: 3, status: "Available", image: property1, ownerName: "Imran Qureshi", ownerPhone: "+91 98765 09912", highlights: ["Sea facing", "Ready possession", "2 car parks"], documents: [{ name: "Title deed.pdf", size: "1.2 MB", uploadedAt: at(-40, 10) }, { name: "Floor plan.pdf", size: "820 KB", uploadedAt: at(-40, 10) }] },
  { id: "p-2", name: "Willow Grove Villa 07", location: "Lonavala, Pune", price: 34000000, currency: "INR", type: "Villa", area: "3,600 sq.ft", beds: 4, status: "Reserved", image: property2, ownerName: "Ananya Deshmukh", ownerPhone: "+91 99303 44518", highlights: ["Private pool", "Hill view", "Furnished"], documents: [{ name: "Sale agreement.pdf", size: "2.4 MB", uploadedAt: at(-18, 15) }] },
  { id: "p-3", name: "Meridian Business Bay — 8F", location: "BKC, Mumbai", price: 62000000, currency: "INR", type: "Commercial", area: "5,100 sq.ft", status: "Booked", image: property3, ownerName: "Skyline Realty", ownerPhone: "+91 98200 41042", highlights: ["Grade A", "Fitted out", "60 seats"], documents: [{ name: "Lease terms.pdf", size: "640 KB", uploadedAt: at(-9, 12) }] },
  { id: "p-4", name: "Greenfield Plot P-22", location: "Panvel, Navi Mumbai", price: 9200000, currency: "INR", type: "Plot", area: "2,000 sq.ft", status: "Available", image: property4, ownerName: "Gaurav Shetty", ownerPhone: "+91 98191 66772", highlights: ["Corner plot", "Clear title", "Gated layout"], documents: [] },
];

/* --------------------------------- site visits ------------------------------ */
export type SiteVisit = {
  id: string;
  propertyId: string;
  leadId: string;
  scheduledAt: string;
  assignedTo: string;
  status: "Scheduled" | "Completed" | "No Show" | "Cancelled";
  feedback?: string;
};

export const siteVisits: SiteVisit[] = [
  { id: "v-1", propertyId: "p-1", leadId: "l-1", scheduledAt: at(0, 17, 30), assignedTo: "Priya Nair", status: "Scheduled" },
  { id: "v-2", propertyId: "p-2", leadId: "l-2", scheduledAt: at(1, 11, 0), assignedTo: "Rahul Sharma", status: "Scheduled" },
  { id: "v-3", propertyId: "p-3", leadId: "l-4", scheduledAt: at(-2, 16, 0), assignedTo: "Sana Kapoor", status: "Completed", feedback: "Liked the layout, wants a 2nd visit with partner." },
  { id: "v-4", propertyId: "p-1", leadId: "l-5", scheduledAt: at(-4, 12, 30), assignedTo: "Rahul Sharma", status: "Completed", feedback: "Price negotiation started at 2.05 Cr." },
  { id: "v-5", propertyId: "p-4", leadId: "l-3", scheduledAt: at(-6, 9, 30), assignedTo: "Priya Nair", status: "No Show", feedback: "Lead unreachable on visit day." },
];

/* ------------------------------------ tasks --------------------------------- */
export type Task = {
  id: string;
  title: string;
  dueAt: string;
  assignedTo: string;
  related: { type: "Lead" | "Customer" | "Property" | "Invoice"; label: string; id: string };
  priority: "Low" | "Medium" | "High";
  status: "Open" | "Completed" | "Archived";
};

export const tasks: Task[] = [
  { id: "t-1", title: "Call back about sea-view unit", dueAt: at(0, 15, 0), assignedTo: "Priya Nair", related: { type: "Lead", label: "Karan Bhatia", id: "l-1" }, priority: "High", status: "Open" },
  { id: "t-2", title: "Share villa brochure on WhatsApp", dueAt: at(0, 17, 45), assignedTo: "Rahul Sharma", related: { type: "Lead", label: "Sneha Kulkarni", id: "l-2" }, priority: "Medium", status: "Open" },
  { id: "t-3", title: "Collect KYC documents", dueAt: at(0, 18, 30), assignedTo: "Sana Kapoor", related: { type: "Customer", label: "Rohit Malhotra", id: "c-1" }, priority: "Medium", status: "Open" },
  { id: "t-4", title: "Confirm site visit slot", dueAt: at(1, 10, 0), assignedTo: "Priya Nair", related: { type: "Property", label: "Willow Grove Villa 07", id: "p-2" }, priority: "High", status: "Open" },
  { id: "t-5", title: "Follow up on invoice INV-2041", dueAt: at(2, 12, 0), assignedTo: "Arjun Mehta", related: { type: "Invoice", label: "INV-2041", id: "i-1" }, priority: "High", status: "Open" },
  { id: "t-6", title: "Update pricing sheet", dueAt: at(-1, 16, 0), assignedTo: "Rahul Sharma", related: { type: "Property", label: "Azure Heights — 1204", id: "p-1" }, priority: "Low", status: "Completed" },
  { id: "t-7", title: "Send thank-you note", dueAt: at(-3, 11, 0), assignedTo: "Priya Nair", related: { type: "Lead", label: "Suresh Pillai", id: "l-6" }, priority: "Low", status: "Completed" },
];

/* ---------------------------------- finance --------------------------------- */
export type InvoiceStatus = "Draft" | "Sent" | "Partially Paid" | "Paid" | "Overdue" | "Cancelled";

export type Invoice = {
  id: string;
  number: string;
  customerId: string;
  customer: string;
  issuedAt: string;
  dueAt: string;
  currency: CurrencyCode;
  status: InvoiceStatus;
  items: { description: string; qty: number; rate: number }[];
  taxRate: number;
  discount: number;
  notes?: string;
};

export const invoices: Invoice[] = [
  { id: "i-1", number: "INV-2041", customerId: "c-1", customer: "Rohit Malhotra", issuedAt: at(-12, 10), dueAt: at(-2, 10), currency: "INR", status: "Overdue", items: [{ description: "Booking advance — Azure Heights 1204", qty: 1, rate: 500000 }], taxRate: 18, discount: 0 },
  { id: "i-2", number: "INV-2042", customerId: "c-2", customer: "Ananya Deshmukh", issuedAt: at(-8, 11), dueAt: at(7, 11), currency: "INR", status: "Partially Paid", items: [{ description: "Brokerage — Meridian Business Bay", qty: 1, rate: 1240000 }, { description: "Documentation charges", qty: 1, rate: 25000 }], taxRate: 18, discount: 15000 },
  { id: "i-3", number: "INV-2043", customerId: "c-4", customer: "Meera Iyer", issuedAt: at(-4, 9), dueAt: at(10, 9), currency: "INR", status: "Sent", items: [{ description: "Rental agreement service", qty: 1, rate: 45000 }], taxRate: 18, discount: 0 },
  { id: "i-4", number: "INV-2044", customerId: "c-6", customer: "Fatima Sheikh", issuedAt: at(-30, 12), dueAt: at(-16, 12), currency: "INR", status: "Paid", items: [{ description: "Token amount — Greenfield Plot", qty: 1, rate: 200000 }], taxRate: 18, discount: 0 },
  { id: "i-5", number: "INV-2045", customerId: "c-3", customer: "Imran Qureshi", issuedAt: at(-1, 16), dueAt: at(14, 16), currency: "INR", status: "Draft", items: [{ description: "Listing & marketing package", qty: 1, rate: 75000 }], taxRate: 18, discount: 5000 },
  { id: "i-6", number: "INV-2039", customerId: "c-5", customer: "Gaurav Shetty", issuedAt: at(-60, 10), dueAt: at(-45, 10), currency: "INR", status: "Cancelled", items: [{ description: "Advisory retainer", qty: 1, rate: 120000 }], taxRate: 18, discount: 0 },
];

export function invoiceTotals(inv: Invoice) {
  const subtotal = inv.items.reduce((s, i) => s + i.qty * i.rate, 0);
  const afterDiscount = subtotal - inv.discount;
  const tax = (afterDiscount * inv.taxRate) / 100;
  return { subtotal, discount: inv.discount, tax, total: afterDiscount + tax };
}

export type Payment = {
  id: string;
  reference: string;
  invoiceId: string;
  invoiceNumber: string;
  customer: string;
  amount: number;
  currency: CurrencyCode;
  method: "Bank Transfer" | "UPI" | "Card" | "Cheque" | "Cash";
  paidAt: string;
  status: "Received" | "Pending" | "Failed" | "Refunded";
};

export const payments: Payment[] = [
  { id: "pay-1", reference: "PMT-90412", invoiceId: "i-2", invoiceNumber: "INV-2042", customer: "Ananya Deshmukh", amount: 700000, currency: "INR", method: "Bank Transfer", paidAt: at(-5, 14, 20), status: "Received" },
  { id: "pay-2", reference: "PMT-90418", invoiceId: "i-4", invoiceNumber: "INV-2044", customer: "Fatima Sheikh", amount: 236000, currency: "INR", method: "UPI", paidAt: at(-28, 10, 5), status: "Received" },
  { id: "pay-3", reference: "PMT-90425", invoiceId: "i-3", invoiceNumber: "INV-2043", customer: "Meera Iyer", amount: 53100, currency: "INR", method: "Card", paidAt: at(-1, 18, 40), status: "Pending" },
  { id: "pay-4", reference: "PMT-90427", invoiceId: "i-1", invoiceNumber: "INV-2041", customer: "Rohit Malhotra", amount: 590000, currency: "INR", method: "Cheque", paidAt: at(-2, 11, 15), status: "Failed" },
];

/* ---------------------------------- activity -------------------------------- */
export type Activity = {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  kind: "call" | "note" | "status" | "visit" | "payment" | "email" | "whatsapp";
};

export const activity: Activity[] = [
  { id: "a-1", at: at(0, 9, 45), actor: "Priya Nair", action: "logged a call with", target: "Karan Bhatia", kind: "call" },
  { id: "a-2", at: at(0, 9, 10), actor: "System", action: "captured a new lead from Meta Ads —", target: "Karan Bhatia", kind: "status" },
  { id: "a-3", at: at(-1, 18, 20), actor: "Rahul Sharma", action: "moved to Negotiation —", target: "Rhea Menon", kind: "status" },
  { id: "a-4", at: at(-1, 16, 5), actor: "Sana Kapoor", action: "completed site visit for", target: "Meridian Business Bay — 8F", kind: "visit" },
  { id: "a-5", at: at(-2, 11, 30), actor: "Arjun Mehta", action: "recorded a payment on", target: "INV-2042", kind: "payment" },
  { id: "a-6", at: at(-2, 10, 15), actor: "Priya Nair", action: "sent a WhatsApp brochure to", target: "Aditya Verma", kind: "whatsapp" },
];

/* ------------------------------- promotional media -------------------------- */
export type MediaType = "Poster" | "Image" | "Video";

export type PromoMedia = {
  id: string;
  title: string;
  subtitle: string;
  type: MediaType;
  src: string;
  priority: number;
  status: "Active" | "Scheduled" | "Inactive" | "Archived";
  startAt: string;
  endAt: string;
  target: string;
  durationSec: number;
  ctaLabel?: string;
};

export const promoMedia: PromoMedia[] = [
  { id: "m-1", title: "Lead Capture, Automated", subtitle: "Ads, forms and WhatsApp leads land in one pipeline.", type: "Poster", src: promo1, priority: 1, status: "Active", startAt: at(-6, 0), endAt: at(24, 0), target: "All workspaces", durationSec: 7, ctaLabel: "What's new" },
  { id: "m-2", title: "Real Estate First", subtitle: "Properties, site visits and bookings built in.", type: "Image", src: promo2, priority: 2, status: "Active", startAt: at(-14, 0), endAt: at(40, 0), target: "All workspaces", durationSec: 7, ctaLabel: "Industry layer" },
  { id: "m-3", title: "Product tour — 60 seconds", subtitle: "See a full deal move from lead to payment.", type: "Video", src: promo3, priority: 3, status: "Active", startAt: at(-2, 0), endAt: at(30, 0), target: "Skyline Realty", durationSec: 9, ctaLabel: "Watch tour" },
  { id: "m-4", title: "Scale plan — early access", subtitle: "Multi-branch workspaces rolling out next month.", type: "Poster", src: promo1, priority: 4, status: "Scheduled", startAt: at(9, 0), endAt: at(45, 0), target: "Harbour Estates", durationSec: 7 },
  { id: "m-5", title: "Festive campaign 2025", subtitle: "Archived after campaign completion.", type: "Image", src: promo2, priority: 5, status: "Archived", startAt: at(-200, 0), endAt: at(-160, 0), target: "All workspaces", durationSec: 7 },
];

/* -------------------------------- integrations ------------------------------ */
export type Integration = {
  id: string;
  name: string;
  category: string;
  connected: boolean;
  health: "Healthy" | "Degraded" | "Disconnected";
  setup: string;
  mapping: string;
  sync: string;
  lastSync?: string;
};

export const integrations: Integration[] = [
  { id: "int-1", name: "WhatsApp Business", category: "Messaging", connected: true, health: "Healthy", setup: "Verified · 2 numbers", mapping: "Source → WhatsApp", sync: "Webhook: inbound messages", lastSync: at(0, 9, 30) },
  { id: "int-2", name: "Gmail", category: "Email", connected: true, health: "Healthy", setup: "arjun@skylinerealty.in", mapping: "Threads → Customer timeline", sync: "2-way sync every 5 min", lastSync: at(0, 9, 52) },
  { id: "int-3", name: "Google Meet", category: "Meetings", connected: true, health: "Degraded", setup: "Calendar linked", mapping: "Meeting → Task", sync: "Auto-link on schedule", lastSync: at(-1, 14, 10) },
  { id: "int-4", name: "Zoom", category: "Meetings", connected: false, health: "Disconnected", setup: "Not configured", mapping: "—", sync: "—" },
  { id: "int-5", name: "Meta", category: "Lead Ads", connected: true, health: "Healthy", setup: "2 pages · 4 forms", mapping: "Form → Source: Meta Ads", sync: "Webhook: leadgen", lastSync: at(0, 9, 12) },
  { id: "int-6", name: "Google Ads", category: "Lead Ads", connected: true, health: "Healthy", setup: "Account 447-120-9", mapping: "Form → Source: Google Ads", sync: "Lead form extension", lastSync: at(0, 8, 5) },
  { id: "int-7", name: "Razorpay", category: "Payments", connected: false, health: "Disconnected", setup: "Keys pending", mapping: "Payment → Invoice", sync: "Webhook: payment.captured" },
];

/* ----------------------------------- admin ---------------------------------- */
export const plans = [
  { id: "plan-1", name: "Starter", price: 2999, currency: "INR" as CurrencyCode, users: 5, workspaces: 28, features: ["Leads & customers", "1 industry layer", "Email support"] },
  { id: "plan-2", name: "Growth", price: 7999, currency: "INR" as CurrencyCode, users: 20, workspaces: 46, features: ["Everything in Starter", "Finance & reports", "Ad lead capture"] },
  { id: "plan-3", name: "Scale", price: 22990, currency: "INR" as CurrencyCode, users: 100, workspaces: 9, features: ["Everything in Growth", "Multi-branch", "Priority support"] },
];

export const systemLogs = [
  { id: "sl-1", at: at(0, 9, 12), level: "Info" as const, service: "lead-ingest", message: "Meta leadgen webhook processed (1 lead) for BT-RE-1042" },
  { id: "sl-2", at: at(0, 8, 40), level: "Warn" as const, service: "calendar-sync", message: "Google Meet token refresh delayed for BT-RE-1042" },
  { id: "sl-3", at: at(-1, 22, 5), level: "Error" as const, service: "payments", message: "Razorpay webhook signature missing for BT-RE-2087" },
  { id: "sl-4", at: at(-1, 20, 15), level: "Info" as const, service: "media-scheduler", message: "Promotional media m-4 queued for 09 days from now" },
  { id: "sl-5", at: at(-2, 6, 30), level: "Info" as const, service: "billing", message: "Invoice generated for 46 Growth workspaces" },
];

export const auditLogs = [
  { id: "al-1", at: at(0, 7, 5), actor: "ops@bluetorn.com", action: "Suspended workspace", target: "BT-RE-4520 · Cedar & Co Properties", ip: "10.4.22.108" },
  { id: "al-2", at: at(-1, 17, 40), actor: "ops@bluetorn.com", action: "Created workspace", target: "BT-AG-3311 · Northlight Agency", ip: "10.4.22.108" },
  { id: "al-3", at: at(-2, 12, 12), actor: "arjun@skylinerealty.in", action: "Changed user role to Manager", target: "priya@skylinerealty.in", ip: "49.36.180.22" },
  { id: "al-4", at: at(-3, 9, 55), actor: "ops@bluetorn.com", action: "Scheduled promotional media", target: "Scale plan — early access", ip: "10.4.22.108" },
];

export const adminMetrics = {
  workspaces: 83,
  activeWorkspaces: 71,
  users: 642,
  mrr: 918400,
  trials: 12,
  suspended: 4,
};

/* -------------------------------- dashboard --------------------------------- */
export const pipelineSnapshot = pipelineStages.map((stage) => ({
  stage,
  count: leads.filter((l) => l.status === stage).length + (stage === "New" ? 6 : stage === "Contacted" ? 9 : stage === "Interested" ? 5 : stage === "Visit / Meeting" ? 4 : stage === "Negotiation" ? 3 : 2),
}));

export const leadsBySource = [
  { source: "Meta Ads", count: 34 },
  { source: "Google Ads", count: 28 },
  { source: "Website", count: 21 },
  { source: "WhatsApp", count: 18 },
  { source: "Referral", count: 12 },
  { source: "Instagram", count: 9 },
];

export const revenueTrend = [
  { month: "Feb", revenue: 3200000, collected: 2600000 },
  { month: "Mar", revenue: 4100000, collected: 3400000 },
  { month: "Apr", revenue: 3800000, collected: 3600000 },
  { month: "May", revenue: 5200000, collected: 4400000 },
  { month: "Jun", revenue: 6100000, collected: 5100000 },
  { month: "Jul", revenue: 7400000, collected: 5900000 },
];

export const salesTrend = [
  { month: "Feb", won: 4, lost: 6 },
  { month: "Mar", won: 6, lost: 5 },
  { month: "Apr", won: 5, lost: 7 },
  { month: "May", won: 8, lost: 4 },
  { month: "Jun", won: 9, lost: 5 },
  { month: "Jul", won: 11, lost: 4 },
];

export function customerById(id: string) {
  return customers.find((c) => c.id === id);
}
export function leadById(id: string) {
  return leads.find((l) => l.id === id);
}
export function propertyById(id: string) {
  return properties.find((p) => p.id === id);
}
export function invoiceById(id: string) {
  return invoices.find((i) => i.id === id);
}
export function workspaceById(id: string) {
  return workspaces.find((w) => w.id === id);
}
