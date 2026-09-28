/**
 * BLUETORN CRM — Pure client/server invoice calculations & GST logic.
 *
 * This file has NO database or Node.js dependencies and is completely safe
 * to use in client bundles.
 */

export type InvoiceLineInput = {
  id?: string;
  description: string;
  hsn_sac?: string | null;
  quantity: number;
  unit?: string;
  rate?: number;
  unit_amount: number;
  discount?: number;
  tax_rate?: number;
  tax_type?: string;
  tax_amount?: number;
  line_total?: number;
};

export function invoiceTotals(lines: InvoiceLineInput[], taxRate: number) {
  return computeInvoiceTotals(lines, taxRate);
}

export function computeInvoiceTotals(
  lines: InvoiceLineInput[],
  defaultTaxRate = 18,
  isInterState = false,
) {
  let subtotal = 0;
  let totalDiscount = 0;
  let totalTax = 0;

  for (const line of lines) {
    const qty = Number(line.quantity) || 1;
    const rate = Number(line.rate ?? line.unit_amount ?? 0);
    const disc = Number(line.discount) || 0;
    const lineTaxRate = Number(line.tax_rate ?? defaultTaxRate ?? 0);

    const gross = qty * rate;
    const taxable = Math.max(0, gross - disc);
    const taxAmt = Math.round(taxable * lineTaxRate) / 100;

    subtotal += gross;
    totalDiscount += disc;
    totalTax += taxAmt;
  }

  const taxableAmount = Math.max(0, subtotal - totalDiscount);
  const total = taxableAmount + totalTax;

  // Place-of-supply GST split:
  // Intra-state (same state) → CGST = SGST = tax/2
  // Inter-state (different state / export) → IGST = tax, CGST = SGST = 0
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  if (isInterState) {
    igst = Math.round(totalTax * 100) / 100;
  } else {
    cgst = Math.round((totalTax / 2) * 100) / 100;
    sgst = Math.round((totalTax - cgst) * 100) / 100;
  }
  const cess = 0;

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discount: Math.round(totalDiscount * 100) / 100,
    taxableAmount: Math.round(taxableAmount * 100) / 100,
    cgst,
    sgst,
    igst,
    cess,
    taxAmount: Math.round(totalTax * 100) / 100,
    total: Math.round(total * 100) / 100,
    effectiveTaxRate: defaultTaxRate,
  };
}
