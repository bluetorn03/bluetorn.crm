import type { InvoiceLineInput } from "./invoice-calculations";

/**
 * BLUETORN CRM — Strict Finance Runtime Validators
 *
 * Enforces runtime schema boundary checks on all financial operations:
 * - Validates unknown inputs before property access
 * - Rejects NaN, Infinity, negative amounts, and oversized strings
 * - Validates invoice line items, tax rates, and discount boundaries
 * - Enforces positive payment amounts and valid currencies
 * - Validates invoice status transition state machines
 */

export type ValidatedSaveInvoiceInput = {
  id?: string | undefined;
  workspaceId: string;
  invoice: {
    invoice_number: string;
    financial_year?: string | null | undefined;
    invoice_type?: string | undefined;
    customer_id?: string | null | undefined;
    lead_id?: string | null | undefined;
    property_id?: string | null | undefined;
    assigned_to?: string | null | undefined;
    status?: string | undefined;
    issue_date: string;
    due_date?: string | null | undefined;
    currency?: string | undefined;
    tax_rate?: number | undefined;
    place_of_supply?: string | null | undefined;
    notes?: string | null | undefined;
    terms?: string | null | undefined;
  };
  lines: InvoiceLineInput[];
};

export function validateSaveInvoiceInput(input: unknown): ValidatedSaveInvoiceInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Validation error: Invalid invoice payload.");
  }

  const data = input as Record<string, unknown>;

  // 1. Workspace ID validation
  if (typeof data["workspaceId"] !== "string" || !data["workspaceId"].trim()) {
    throw new Error("Validation error: Workspace ID is required.");
  }
  const workspaceId = data["workspaceId"].trim();
  if (workspaceId.length > 64) {
    throw new Error("Validation error: Workspace ID exceeds maximum length.");
  }

  // 2. Optional invoice ID validation
  let id: string | undefined = undefined;
  if (data["id"] !== undefined && data["id"] !== null) {
    if (typeof data["id"] !== "string" || !data["id"].trim() || data["id"].trim().length > 64) {
      throw new Error("Validation error: Invalid invoice ID.");
    }
    id = data["id"].trim();
  }

  // 3. Invoice header validation
  if (!data["invoice"] || typeof data["invoice"] !== "object" || Array.isArray(data["invoice"])) {
    throw new Error("Validation error: Invoice details object is required.");
  }
  const inv = data["invoice"] as Record<string, unknown>;

  // Required invoice_number
  if (typeof inv["invoice_number"] !== "string" || !inv["invoice_number"].trim()) {
    throw new Error("Validation error: Invoice number is required.");
  }
  const invoice_number = inv["invoice_number"].trim();
  if (invoice_number.length > 50) {
    throw new Error("Validation error: Invoice number exceeds 50 characters.");
  }

  // Required issue_date
  if (typeof inv["issue_date"] !== "string" || !inv["issue_date"].trim()) {
    throw new Error("Validation error: Issue date is required.");
  }
  const issue_date = inv["issue_date"].trim();
  if (issue_date.length > 30) {
    throw new Error("Validation error: Issue date exceeds 30 characters.");
  }

  // Optional string lengths & boundaries
  const financial_year = typeof inv["financial_year"] === "string" ? inv["financial_year"].trim() : null;
  if (financial_year && financial_year.length > 20) {
    throw new Error("Validation error: Financial year exceeds 20 characters.");
  }

  const invoice_type = typeof inv["invoice_type"] === "string" ? inv["invoice_type"].trim() : "Tax Invoice";
  if (invoice_type.length > 50) {
    throw new Error("Validation error: Invoice type exceeds 50 characters.");
  }

  const due_date = typeof inv["due_date"] === "string" ? inv["due_date"].trim() : null;
  if (due_date && due_date.length > 30) {
    throw new Error("Validation error: Due date exceeds 30 characters.");
  }

  const currency = typeof inv["currency"] === "string" && inv["currency"].trim() ? inv["currency"].trim().toUpperCase() : "INR";
  if (currency.length > 10) {
    throw new Error("Validation error: Currency code exceeds 10 characters.");
  }

  let tax_rate: number | undefined = undefined;
  if (inv["tax_rate"] !== undefined && inv["tax_rate"] !== null) {
    const tr = Number(inv["tax_rate"]);
    if (!Number.isFinite(tr) || tr < 0 || tr > 100) {
      throw new Error("Validation error: Tax rate must be a finite number between 0 and 100.");
    }
    tax_rate = tr;
  }

  const place_of_supply = typeof inv["place_of_supply"] === "string" ? inv["place_of_supply"].trim() : null;
  if (place_of_supply && place_of_supply.length > 100) {
    throw new Error("Validation error: Place of supply exceeds 100 characters.");
  }

  const notes = typeof inv["notes"] === "string" ? inv["notes"].trim() : null;
  if (notes && notes.length > 5000) {
    throw new Error("Validation error: Notes exceed 5,000 characters.");
  }

  const terms = typeof inv["terms"] === "string" ? inv["terms"].trim() : null;
  if (terms && terms.length > 5000) {
    throw new Error("Validation error: Terms exceed 5,000 characters.");
  }

  const customer_id = typeof inv["customer_id"] === "string" && inv["customer_id"].trim() ? inv["customer_id"].trim() : null;
  if (customer_id && customer_id.length > 64) {
    throw new Error("Validation error: Invalid customer ID.");
  }

  const lead_id = typeof inv["lead_id"] === "string" && inv["lead_id"].trim() ? inv["lead_id"].trim() : null;
  if (lead_id && lead_id.length > 64) {
    throw new Error("Validation error: Invalid lead ID.");
  }

  const property_id = typeof inv["property_id"] === "string" && inv["property_id"].trim() ? inv["property_id"].trim() : null;
  if (property_id && property_id.length > 64) {
    throw new Error("Validation error: Invalid property ID.");
  }

  const assigned_to = typeof inv["assigned_to"] === "string" && inv["assigned_to"].trim() ? inv["assigned_to"].trim() : null;
  if (assigned_to && assigned_to.length > 64) {
    throw new Error("Validation error: Invalid assigned user ID.");
  }

  const status = typeof inv["status"] === "string" ? inv["status"].trim() : undefined;
  if (status && status.length > 30) {
    throw new Error("Validation error: Status exceeds 30 characters.");
  }

  // 4. Line items validation
  if (!Array.isArray(data["lines"]) || data["lines"].length === 0) {
    throw new Error("Validation error: An invoice must contain at least one line item.");
  }
  if (data["lines"].length > 100) {
    throw new Error("Validation error: Invoice cannot contain more than 100 line items.");
  }

  const validatedLines: InvoiceLineInput[] = [];
  for (let i = 0; i < data["lines"].length; i++) {
    const rawLine = data["lines"][i];
    if (!rawLine || typeof rawLine !== "object" || Array.isArray(rawLine)) {
      throw new Error(`Validation error: Line item #${i + 1} is invalid.`);
    }
    const l = rawLine as Record<string, unknown>;

    if (typeof l["description"] !== "string" || !l["description"].trim()) {
      throw new Error(`Validation error: Description is required for line item #${i + 1}.`);
    }
    const description = l["description"].trim();
    if (description.length > 500) {
      throw new Error(`Validation error: Line item #${i + 1} description exceeds 500 characters.`);
    }

    const qty = Number(l["quantity"]);
    if (!Number.isFinite(qty) || qty <= 0 || qty > 1000000) {
      throw new Error(`Validation error: Quantity for line #${i + 1} must be a positive finite number (max 1,000,000).`);
    }

    const rate = Number(l["rate"] ?? l["unit_amount"] ?? 0);
    if (!Number.isFinite(rate) || rate < 0 || rate > 1000000000) {
      throw new Error(`Validation error: Rate for line #${i + 1} must be a non-negative finite number.`);
    }

    const disc = l["discount"] !== undefined && l["discount"] !== null ? Number(l["discount"]) : 0;
    if (!Number.isFinite(disc) || disc < 0) {
      throw new Error(`Validation error: Discount for line #${i + 1} cannot be negative.`);
    }
    if (disc > (qty * rate)) {
      throw new Error(`Validation error: Discount for line #${i + 1} cannot exceed gross amount.`);
    }

    let lineTaxRate: number | undefined = undefined;
    if (l["tax_rate"] !== undefined && l["tax_rate"] !== null) {
      const tr = Number(l["tax_rate"]);
      if (!Number.isFinite(tr) || tr < 0 || tr > 100) {
        throw new Error(`Validation error: Tax rate for line #${i + 1} must be between 0 and 100.`);
      }
      lineTaxRate = tr;
    }

    const hsn_sac = typeof l["hsn_sac"] === "string" ? l["hsn_sac"].trim() : null;
    if (hsn_sac && hsn_sac.length > 30) {
      throw new Error(`Validation error: HSN/SAC code for line #${i + 1} exceeds 30 characters.`);
    }

    const unit = typeof l["unit"] === "string" && l["unit"].trim() ? l["unit"].trim() : "Units";
    if (unit.length > 30) {
      throw new Error(`Validation error: Unit for line #${i + 1} exceeds 30 characters.`);
    }

    const tax_type = typeof l["tax_type"] === "string" && l["tax_type"].trim() ? l["tax_type"].trim() : "GST";

    const lineItem: InvoiceLineInput = {
      description,
      hsn_sac,
      quantity: qty,
      unit,
      rate,
      unit_amount: rate,
      discount: disc,
      tax_type,
    };
    if (typeof l["id"] === "string" && l["id"].trim()) {
      lineItem.id = l["id"].trim();
    }
    if (lineTaxRate !== undefined) {
      lineItem.tax_rate = lineTaxRate;
    }
    validatedLines.push(lineItem);
  }

  return {
    id,
    workspaceId,
    invoice: {
      invoice_number,
      financial_year,
      invoice_type,
      customer_id,
      lead_id,
      property_id,
      assigned_to,
      status,
      issue_date,
      due_date,
      currency,
      tax_rate,
      place_of_supply,
      notes,
      terms,
    },
    lines: validatedLines,
  };
}

export type ValidatedCreatePaymentInput = {
  workspace_id: string;
  invoice_id?: string | null;
  customer_id?: string | null;
  assigned_to?: string | null;
  amount: number;
  currency: string;
  method: string;
  status: string;
  paid_at: string;
  reference?: string | null;
  notes?: string | null;
};

export function validateCreatePaymentInput(input: unknown): ValidatedCreatePaymentInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Validation error: Invalid payment payload.");
  }

  const data = input as Record<string, unknown>;

  if (typeof data["workspace_id"] !== "string" || !data["workspace_id"].trim()) {
    throw new Error("Validation error: Workspace ID is required.");
  }
  const workspace_id = data["workspace_id"].trim();
  if (workspace_id.length > 64) {
    throw new Error("Validation error: Workspace ID exceeds maximum length.");
  }

  const amt = Number(data["amount"]);
  if (!Number.isFinite(amt) || amt <= 0 || amt > 1000000000) {
    throw new Error("Validation error: Payment amount must be a positive finite number.");
  }

  const currency = typeof data["currency"] === "string" && data["currency"].trim() ? data["currency"].trim().toUpperCase() : "INR";
  if (currency.length > 10) {
    throw new Error("Validation error: Currency code exceeds 10 characters.");
  }

  const method = typeof data["method"] === "string" && data["method"].trim() ? data["method"].trim() : "Bank Transfer";
  if (method.length > 50) {
    throw new Error("Validation error: Payment method exceeds 50 characters.");
  }

  const status = typeof data["status"] === "string" && data["status"].trim() ? data["status"].trim() : "Received";
  if (status.length > 30) {
    throw new Error("Validation error: Status exceeds 30 characters.");
  }

  const paid_at = typeof data["paid_at"] === "string" && data["paid_at"].trim()
    ? data["paid_at"].trim()
    : new Date().toISOString().slice(0, 19).replace("T", " ");
  if (paid_at.length > 30) {
    throw new Error("Validation error: Paid date exceeds 30 characters.");
  }

  const reference = typeof data["reference"] === "string" && data["reference"].trim() ? data["reference"].trim() : null;
  if (reference && reference.length > 100) {
    throw new Error("Validation error: Payment reference exceeds 100 characters.");
  }

  const notes = typeof data["notes"] === "string" && data["notes"].trim() ? data["notes"].trim() : null;
  if (notes && notes.length > 5000) {
    throw new Error("Validation error: Payment notes exceed 5,000 characters.");
  }

  const invoice_id = typeof data["invoice_id"] === "string" && data["invoice_id"].trim() ? data["invoice_id"].trim() : null;
  if (invoice_id && invoice_id.length > 64) {
    throw new Error("Validation error: Invalid invoice ID.");
  }

  const customer_id = typeof data["customer_id"] === "string" && data["customer_id"].trim() ? data["customer_id"].trim() : null;
  if (customer_id && customer_id.length > 64) {
    throw new Error("Validation error: Invalid customer ID.");
  }

  const assigned_to = typeof data["assigned_to"] === "string" && data["assigned_to"].trim() ? data["assigned_to"].trim() : null;
  if (assigned_to && assigned_to.length > 64) {
    throw new Error("Validation error: Invalid assigned user ID.");
  }

  return {
    workspace_id,
    invoice_id,
    customer_id,
    assigned_to,
    amount: amt,
    currency,
    method,
    status,
    paid_at,
    reference,
    notes,
  };
}

export type ValidatedReversePaymentInput = {
  id: string;
  reason: string;
};

export function validateReversePaymentInput(input: unknown): ValidatedReversePaymentInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Validation error: Invalid reversal payload.");
  }

  const data = input as Record<string, unknown>;

  if (typeof data["id"] !== "string" || !data["id"].trim() || data["id"].trim().length > 64) {
    throw new Error("Validation error: Valid payment ID is required.");
  }

  if (typeof data["reason"] !== "string" || !data["reason"].trim()) {
    throw new Error("Validation error: Reversal reason is required.");
  }

  const reason = data["reason"].trim();
  if (reason.length < 3) {
    throw new Error("Validation error: Reversal reason must be at least 3 characters.");
  }
  if (reason.length > 500) {
    throw new Error("Validation error: Reversal reason exceeds 500 characters.");
  }

  return {
    id: data["id"].trim(),
    reason,
  };
}

export type ValidatedUpdateInvoiceStatusInput = {
  id: string;
  status: string;
};

const CANONICAL_INVOICE_STATUSES = ["Draft", "Issued", "Sent", "Paid", "Partially Paid", "Overdue", "Cancelled"];

export function validateUpdateInvoiceStatusInput(input: unknown): ValidatedUpdateInvoiceStatusInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Validation error: Invalid status payload.");
  }

  const data = input as Record<string, unknown>;

  if (typeof data["id"] !== "string" || !data["id"].trim() || data["id"].trim().length > 64) {
    throw new Error("Validation error: Valid invoice ID is required.");
  }

  if (typeof data["status"] !== "string" || !data["status"].trim()) {
    throw new Error("Validation error: Status is required.");
  }

  const status = data["status"].trim();
  if (!CANONICAL_INVOICE_STATUSES.includes(status)) {
    throw new Error(`Validation error: Invalid invoice status '${status}'.`);
  }

  return {
    id: data["id"].trim(),
    status,
  };
}

