import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  Printer,
  Building2,
  CheckCircle,
  AlertCircle,
  Clock,
  Smartphone,
  Copy,
  Check,
} from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { getPublicInvoice, qk } from "@/lib/crm-api";
import { formatMoney, formatDate } from "@/lib/format";
import { AmountInWords } from "@/components/common/AmountInWords";
import { generateUpiUri, generateQrSvg } from "@/lib/upi-qr";
import { toast } from "sonner";

export const Route = createFileRoute("/invoice/$invoiceId")({
  head: () => ({
    meta: [
      { title: "Tax Invoice View · BLUETORN CRM" },
      { name: "description", content: "Client Tax Invoice & Payment View" },
    ],
  }),
  component: PublicInvoicePage,
});

function PublicInvoicePage() {
  const { invoiceId } = Route.useParams();
  const [copiedUpi, setCopiedUpi] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: qk.publicInvoice(invoiceId),
    queryFn: () => getPublicInvoice(invoiceId),
  });

  const handleCopyUpi = (upiId: string) => {
    navigator.clipboard.writeText(upiId);
    setCopiedUpi(true);
    toast.success("UPI ID copied to clipboard!");
    setTimeout(() => setCopiedUpi(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/20 flex items-center justify-center p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4 animate-spin" /> Loading invoice details…
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-muted/20 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 text-center space-y-4 shadow-sm">
          <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold text-foreground">Invoice Not Available</h1>
          <p className="text-sm text-muted-foreground">
            This invoice may have been updated, cancelled, or is not available for public view.
          </p>
        </div>
      </div>
    );
  }

  const { invoice: inv, items, workspace: ws, totalPaid, balance } = data;
  const currency = (inv.currency ?? "INR") as any;

  const effectiveUpi = ws.upi_id;
  const payeeName = ws.upi_merchant_name || ws.legal_name || ws.name;

  const upiUri = effectiveUpi
    ? generateUpiUri({
        upiId: effectiveUpi,
        payeeName,
        amount: balance,
        invoiceNumber: inv.invoice_number,
      })
    : "";

  const qrSvg = upiUri ? generateQrSvg(upiUri, { size: 130 }).svgXml : "";

  return (
    <div className="min-h-screen bg-muted/30 py-6 px-3 sm:px-6 print:p-0 print:bg-white text-foreground">
      {/* Print Styles */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm 12mm;
          }
          *, *::before, *::after {
            box-sizing: border-box !important;
          }
          html, body {
            background: #ffffff !important;
            color: #000000 !important;
            font-size: 11px !important;
            line-height: 1.3 !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
          }
          .no-print, header, nav, aside {
            display: none !important;
          }
          #invoice-document {
            border: none !important;
            box-shadow: none !important;
            padding: 0 4mm !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
          }
          .print-avoid-break {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      {/* Top Floating Action Bar */}
      <div className="max-w-4xl mx-auto mb-4 flex items-center justify-between gap-3 no-print">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-foreground">{ws.name}</span>
          <span className="text-xs text-muted-foreground">· Tax Invoice</span>
        </div>
        <Button size="sm" onClick={handlePrint} className="gap-1.5 shadow-xs">
          <Printer className="h-4 w-4" /> Print / Save PDF
        </Button>
      </div>

      {/* Main Tax Invoice Sheet */}
      <div
        id="invoice-document"
        className="max-w-4xl mx-auto bg-card border border-border rounded-xl shadow-xs p-6 sm:p-8 space-y-5 print:border-none print:shadow-none print:p-0 print:space-y-3"
      >
        {/* Header Block */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-4 border-b border-border">
          <div className="space-y-1.5 max-w-sm">
            {ws.logo_url ? (
              <img
                src={ws.logo_url}
                alt={ws.name}
                className="h-10 w-auto object-contain print:h-9"
              />
            ) : (
              <div className="flex items-center gap-2 text-primary font-bold text-lg">
                <Building2 className="h-6 w-6" />
                <span>{ws.name}</span>
              </div>
            )}
            <h2 className="text-base font-bold text-foreground leading-tight">
              {ws.legal_name || ws.name}
            </h2>
            {ws.address && (
              <p className="text-xs text-muted-foreground whitespace-pre-line">{ws.address}</p>
            )}
            <div className="text-xs text-muted-foreground pt-0.5 space-y-0.5 font-mono">
              {ws.gstin && (
                <p>
                  <span className="font-semibold text-foreground">GSTIN:</span> {ws.gstin}
                </p>
              )}
              {ws.pan && (
                <p>
                  <span className="font-semibold text-foreground">PAN:</span> {ws.pan}
                </p>
              )}
              {ws.state && (
                <p>
                  <span className="font-semibold text-foreground">State:</span> {ws.state}{" "}
                  {ws.state_code ? `(${ws.state_code})` : ""}
                </p>
              )}
            </div>
          </div>

          <div className="sm:text-right space-y-1 self-start">
            <div className="flex flex-wrap items-center gap-1.5 justify-start sm:justify-end">
              <span className="inline-block text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-primary/10 text-primary">
                {inv.invoice_type || "TAX INVOICE"}
              </span>
              {inv.status === "Draft" && (
                <span className="inline-block text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/30">
                  DRAFT / PROFORMA
                </span>
              )}
              {inv.status === "Paid" && (
                <span className="inline-block text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/30">
                  PAID
                </span>
              )}
              {inv.status === "Cancelled" && (
                <span className="inline-block text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/30">
                  CANCELLED
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-foreground">
              {inv.invoice_number}
            </h1>
            <div className="text-xs text-muted-foreground space-y-0.5 pt-1">
              <p>
                <span className="font-medium">Invoice Date:</span>{" "}
                {formatDate(inv.issue_date || inv.created_at)}
              </p>
              {inv.due_date && (
                <p>
                  <span className="font-medium">Due Date:</span> {formatDate(inv.due_date)}
                </p>
              )}
              {inv.place_of_supply && (
                <p>
                  <span className="font-medium">Place of Supply:</span> {inv.place_of_supply}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Bill To Block */}
        <div className="p-3.5 rounded-lg bg-muted/20 border border-border text-xs print:p-2.5">
          <p className="font-bold text-muted-foreground uppercase tracking-wider text-[10px] mb-1">
            Billed To (Customer)
          </p>
          <p className="text-sm font-bold text-foreground">
            {inv.customer_name || "Valued Client"}
          </p>
          {inv.customer_phone && <p className="text-muted-foreground">Phone: {inv.customer_phone}</p>}
          {inv.customer_email && <p className="text-muted-foreground">Email: {inv.customer_email}</p>}
          {inv.customer_city && <p className="text-muted-foreground">City: {inv.customer_city}</p>}
        </div>

        {/* Line Items Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border font-bold text-muted-foreground uppercase tracking-wider text-[10px]">
                <th className="py-2 px-2.5">#</th>
                <th className="py-2 px-2.5">Description</th>
                <th className="py-2 px-2.5">HSN/SAC</th>
                <th className="py-2 px-2.5 text-right">Qty</th>
                <th className="py-2 px-2.5 text-right">Rate</th>
                <th className="py-2 px-2.5 text-right">Disc</th>
                <th className="py-2 px-2.5 text-right">GST %</th>
                <th className="py-2 px-2.5 text-right">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {items.map((item, idx) => (
                <tr key={item.id}>
                  <td className="py-2 px-2.5 text-muted-foreground">{idx + 1}</td>
                  <td className="py-2 px-2.5 font-medium text-foreground">{item.description}</td>
                  <td className="py-2 px-2.5 text-muted-foreground font-mono">{item.hsn_sac || "—"}</td>
                  <td className="py-2 px-2.5 text-right">
                    {item.quantity} {item.unit || ""}
                  </td>
                  <td className="py-2 px-2.5 text-right">
                    {formatMoney(Number(item.rate ?? item.unit_amount), currency)}
                  </td>
                  <td className="py-2 px-2.5 text-right text-muted-foreground">
                    {Number(item.discount) > 0 ? formatMoney(Number(item.discount), currency) : "—"}
                  </td>
                  <td className="py-2 px-2.5 text-right font-mono">
                    {item.tax_rate ?? inv.tax_rate}%
                  </td>
                  <td className="py-2 px-2.5 text-right font-semibold text-foreground">
                    {formatMoney(Number(item.line_total ?? item.amount), currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bottom Section: Bank Settlement & UPI QR (Left) + Totals (Right) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-border print:grid-cols-2 print:gap-4 print-avoid-break">
          {/* Left: Bank details & UPI QR */}
          <div className="space-y-3">
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                Bank Settlement Details
              </p>
              <div className="p-2.5 rounded-lg bg-muted/20 border border-border text-xs space-y-0.5">
                <p>
                  <span className="text-muted-foreground">Bank:</span>{" "}
                  <span className="font-semibold text-foreground">{ws.bank_name || "—"}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">A/C Name:</span>{" "}
                  <span className="font-semibold text-foreground">
                    {ws.bank_account_name || ws.legal_name || ws.name}
                  </span>
                </p>
                <p>
                  <span className="text-muted-foreground">A/C No:</span>{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {ws.bank_account_no || "—"}
                  </span>
                </p>
                <p>
                  <span className="text-muted-foreground">IFSC:</span>{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {ws.bank_ifsc || "—"}
                  </span>
                </p>
              </div>
            </div>

            {/* Dynamic UPI Payment QR Code */}
            {effectiveUpi && balance > 0 && qrSvg && (
              <div className="p-2.5 rounded-lg border border-border bg-card flex items-center gap-3 print:p-2">
                <div
                  className="bg-white p-1 rounded border border-border shrink-0 flex items-center justify-center print:border-none"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                  title="Scan with any UPI app to pay"
                />
                <div className="space-y-1 min-w-0 flex-1 text-xs">
                  <div className="flex items-center gap-1 font-bold text-primary text-[11px] uppercase tracking-wider">
                    <Smartphone className="h-3.5 w-3.5" />
                    <span>Instant UPI Payment</span>
                  </div>
                  <p className="font-semibold text-foreground">
                    Scan & Pay {formatMoney(balance, currency)}
                  </p>
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <code className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-foreground font-semibold truncate">
                      {effectiveUpi}
                    </code>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground no-print p-0.5"
                      onClick={() => handleCopyUpi(effectiveUpi)}
                      title="Copy UPI ID"
                    >
                      {copiedUpi ? (
                        <Check className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {inv.notes && (
              <div className="text-[11px] text-muted-foreground pt-1">
                <span className="font-semibold text-foreground">Notes: </span>
                {inv.notes}
              </div>
            )}
            {inv.terms && (
              <div className="text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">Terms: </span>
                {inv.terms}
              </div>
            )}
          </div>

          {/* Right: Totals Breakdown */}
          <div className="space-y-1.5 text-xs sm:max-w-xs sm:ml-auto w-full self-start print:pr-1">
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium text-foreground">
                {formatMoney(inv.subtotal, currency)}
              </span>
            </div>

            {Number(inv.discount) > 0 && (
              <div className="flex justify-between py-1 text-emerald-600 font-medium">
                <span>Discount</span>
                <span>-{formatMoney(Number(inv.discount || 0), currency)}</span>
              </div>
            )}

            {inv.taxable_amount !== null && inv.taxable_amount !== undefined && (
              <div className="flex justify-between py-1 text-muted-foreground">
                <span>Taxable Value</span>
                <span>{formatMoney(Number(inv.taxable_amount || 0), currency)}</span>
              </div>
            )}

            {Number(inv.cgst) > 0 && (
              <div className="flex justify-between py-0.5 text-muted-foreground text-[11px]">
                <span>CGST</span>
                <span>{formatMoney(Number(inv.cgst || 0), currency)}</span>
              </div>
            )}

            {Number(inv.sgst) > 0 && (
              <div className="flex justify-between py-0.5 text-muted-foreground text-[11px]">
                <span>SGST</span>
                <span>{formatMoney(Number(inv.sgst || 0), currency)}</span>
              </div>
            )}

            {Number(inv.igst) > 0 && (
              <div className="flex justify-between py-0.5 text-muted-foreground text-[11px]">
                <span>IGST</span>
                <span>{formatMoney(Number(inv.igst || 0), currency)}</span>
              </div>
            )}

            <div className="flex justify-between py-2 border-t-2 border-border text-sm font-bold text-foreground">
              <span>Total Invoiced</span>
              <span className="text-primary">{formatMoney(inv.total, currency)}</span>
            </div>

            <div className="flex justify-between py-1 border-t border-border/60 text-xs">
              <span className="text-muted-foreground">Total Paid</span>
              <span className="font-medium text-emerald-600">
                {formatMoney(totalPaid, currency)}
              </span>
            </div>

            <div className="flex justify-between py-1.5 border-t border-border font-bold text-xs">
              <span>Balance Outstanding</span>
              <span className={balance > 0 ? "text-destructive" : "text-emerald-600"}>
                {formatMoney(balance, currency)}
              </span>
            </div>

            <div className="pt-2 text-[10px] text-muted-foreground leading-normal border-t border-border/40">
              <AmountInWords amount={inv.total} currency={currency} />
            </div>

            {/* Authorised Signatory Box */}
            <div className="pt-6 text-center sm:text-right print:pt-4">
              <div className="inline-block border-t border-muted-foreground/40 pt-1 px-4 text-[10px] text-muted-foreground">
                For {ws.legal_name || ws.name}
                <div className="font-bold text-foreground text-[11px] mt-0.5">Authorised Signatory</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
