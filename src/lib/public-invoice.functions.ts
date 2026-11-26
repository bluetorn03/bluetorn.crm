import { createServerFn } from "@tanstack/react-start";
import { query, queryOne } from "./db";
import type { Invoice, InvoiceItem, Payment, Workspace } from "./db-types";

export interface PublicInvoiceData {
  invoice: Invoice;
  items: InvoiceItem[];
  workspace: {
    id: string;
    name: string;
    legal_name?: string | null | undefined;
    gstin?: string | null | undefined;
    pan?: string | null | undefined;
    state?: string | null | undefined;
    state_code?: string | null | undefined;
    contact_email?: string | null | undefined;
    contact_phone?: string | null | undefined;
    address?: string | null | undefined;
    bank_name?: string | null | undefined;
    bank_account_no?: string | null | undefined;
    bank_account_name?: string | null | undefined;
    bank_ifsc?: string | null | undefined;
    upi_id?: string | null | undefined;
    upi_merchant_name?: string | null | undefined;
    logo_url?: string | null | undefined;
  };
  totalPaid: number;
  balance: number;
}

/**
 * Publicly viewable invoice endpoint (unauthenticated).
 * Exposes customer-facing invoice data, bank details, and UPI QR information.
 * Draft or non-existent invoices return null.
 */
export const getPublicInvoiceFn = createServerFn({ method: "GET" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }): Promise<PublicInvoiceData | null> => {
    if (!data.id || data.id.trim().length === 0) return null;

    const trimmedId = data.id.trim();

    const invoice = await queryOne<Invoice>(
      `SELECT i.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone, c.city as customer_city
       FROM invoices i
       LEFT JOIN customers c ON i.customer_id = c.id
       WHERE (i.id = ? OR i.invoice_number = ?) LIMIT 1`,
      [trimmedId, trimmedId],
    );

    if (!invoice) return null;

    const [items, workspace, payments] = await Promise.all([
      query<InvoiceItem>(
        "SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY position ASC, id ASC",
        [invoice.id],
      ),
      queryOne<Workspace>(
        `SELECT id, name, legal_name, gstin, pan, state, state_code, contact_email, contact_phone,
                address, bank_name, bank_account_no, bank_account_name, bank_ifsc, upi_id, upi_merchant_name, logo_url
         FROM workspaces WHERE id = ? LIMIT 1`,
        [invoice.workspace_id],
      ),
      query<Payment>(
        "SELECT amount FROM payments WHERE invoice_id = ? AND status = 'Received'",
        [invoice.id],
      ),
    ]);

    if (!workspace) return null;

    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const balance = Math.max(0, Number(invoice.total || 0) - totalPaid);

    return {
      invoice,
      items,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        legal_name: workspace.legal_name,
        gstin: workspace.gstin,
        pan: workspace.pan,
        state: workspace.state,
        state_code: workspace.state_code,
        contact_email: workspace.contact_email,
        contact_phone: workspace.contact_phone,
        address: workspace.address,
        bank_name: workspace.bank_name,
        bank_account_no: workspace.bank_account_no,
        bank_account_name: workspace.bank_account_name,
        bank_ifsc: workspace.bank_ifsc,
        upi_id: workspace.upi_id,
        upi_merchant_name: workspace.upi_merchant_name,
        logo_url: workspace.logo_url,
      },
      totalPaid,
      balance,
    };
  });
