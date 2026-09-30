import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  CheckCircle,
  Copy,
  DollarSign,
  Download,
  FileText,
  Loader2,
  Pencil,
  Printer,
  Send,
  Share2,
  Trash2,
  User,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { DataState } from "@/components/common/DataState";
import { PermissionGate } from "@/components/app/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getInvoice,
  paidAmount,
  updateInvoiceStatus,
  cancelInvoice,
  deleteInvoice,
  createPayment,
  qk,
} from "@/lib/crm-api";
import { useSession } from "@/hooks/use-session";
import { formatMoney, formatDate, relativeTime } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/app/finance/invoices/$invoiceId")({
  head: () => ({
    meta: [
      { title: "Invoice Details · BLUETORN CRM" },
      {
        name: "description",
        content: "View full tax invoice, payments reconciliation, and print documents.",
      },
    ],
  }),
  component: InvoiceDetailPage,
});

function InvoiceDetailPage() {
  return (
    <PermissionGate requires={["finance.view", "manage.finance"]}>
      <InvoiceDetailContent />
    </PermissionGate>
  );
}

const PAYMENT_METHODS = [
  "Bank Transfer (NEFT/RTGS/IMPS)",
  "UPI",
  "Cheque",
  "Credit Card",
  "Debit Card",
  "Cash",
];

function InvoiceDetailContent() {
  const { invoiceId } = Route.useParams();
  const { workspace, user, can } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Dialog states
  const [payOpen, setPayOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  // Payment form state
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState("Bank Transfer (NEFT/RTGS/IMPS)");
  const [payReference, setPayReference] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payNotes, setPayNotes] = useState("");

  const invoiceQuery = useQuery({
    queryKey: qk.invoice(invoiceId),
    queryFn: () => getInvoice(invoiceId),
    enabled: !!invoiceId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: qk.invoice(invoiceId) });
    queryClient.invalidateQueries({ queryKey: qk.invoices(workspace.id) });
    queryClient.invalidateQueries({ queryKey: ["dashboard", workspace.id] });
  };

  // Issue status mutation
  const issueMutation = useMutation({
    mutationFn: () => updateInvoiceStatus(invoiceId, "Issued"),
    onSuccess: () => {
      invalidate();
      toast.success("Invoice issued successfully.");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to update invoice."),
  });

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: () => cancelInvoice(invoiceId, cancelReason),
    onSuccess: () => {
      invalidate();
      setCancelOpen(false);
      setCancelReason("");
      toast.success("Invoice cancelled successfully.");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to cancel invoice."),
  });

  // Delete draft mutation
  const deleteMutation = useMutation({
    mutationFn: () => deleteInvoice(invoiceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.invoices(workspace.id) });
      toast.success("Draft invoice deleted.");
      navigate({ to: "/app/finance/invoices" });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to delete draft invoice."),
  });

  // Record payment mutation
  const recordPaymentMutation = useMutation({
    mutationFn: async (inv: any) => {
      if (payAmount <= 0) {
        throw new Error("Payment amount must be greater than zero.");
      }
      return createPayment({
        workspace_id: workspace.id,
        invoice_id: inv.id,
        customer_id: inv.customer_id,
        assigned_to: user.id,
        amount: payAmount,
        currency: inv.currency ?? "INR",
        method: payMethod,
        status: "Received",
        paid_at: payDate,
        reference: payReference.trim() || null,
        notes: payNotes.trim() || null,
      });
    },
    onSuccess: () => {
      invalidate();
      setPayOpen(false);
      setPayAmount(0);
      setPayReference("");
      setPayNotes("");
      toast.success("Payment recorded and reconciled successfully.");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to record payment."),
  });

  const handlePrint = () => {
    window.print();
  };

  const handleShare = (inv: any) => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    toast.success("Invoice reference link copied to clipboard.");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/app/finance/invoices">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Invoices
          </Link>
        </Button>
      </div>

      <DataState query={invoiceQuery} loadingLabel="Loading invoice details…">
        {(data) => {
          if (!data) {
            return (
              <div className="py-12 text-center">
                <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">Invoice not found</p>
              </div>
            );
          }

          const { invoice: inv, items, payments } = data;
          const currency = (inv.currency ?? "INR") as any;
          const totalPaid = paidAmount(payments);
          const balance = Math.max(0, inv.total - totalPaid);
          const isOverdue =
            inv.due_date &&
            new Date(inv.due_date).getTime() < Date.now() &&
            balance > 0 &&
            inv.status !== "Cancelled" &&
            inv.status !== "Draft";

          const displayStatus = isOverdue && inv.status !== "Paid" ? "Overdue" : inv.status;

          // Check permissions
          const canEdit = can("finance.invoices.edit");
          const canIssue = can("finance.invoices.issue");
          const canCancel = can("finance.invoices.cancel");
          const canRecordPayment = can("finance.payments.record");
          const canPrint = can("finance.print");
          const canShare = can("finance.share");

          return (
            <>
              {/* Action Toolbar (Hidden during Print) */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-border no-print">
                <div className="flex items-center gap-3">
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground font-mono">
                    {inv.invoice_number}
                  </h1>
                  <StatusBadge
                    label={displayStatus}
                    tone={
                      displayStatus === "Paid"
                        ? "success"
                        : displayStatus === "Overdue" || displayStatus === "Cancelled"
                          ? "danger"
                          : displayStatus === "Partially Paid"
                            ? "warning"
                            : "neutral"
                    }
                  />
                  <span className="text-xs text-muted-foreground px-2 py-0.5 rounded bg-muted/60">
                    {inv.invoice_type || "Tax Invoice"}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {canPrint && (
                    <Button size="sm" variant="outline" onClick={handlePrint}>
                      <Printer className="mr-1.5 h-3.5 w-3.5" /> Print / PDF
                    </Button>
                  )}

                  {canShare && (
                    <Button size="sm" variant="outline" onClick={() => handleShare(inv)}>
                      <Share2 className="mr-1.5 h-3.5 w-3.5" /> Share
                    </Button>
                  )}

                  {/* Draft Actions */}
                  {inv.status === "Draft" && canEdit && (
                    <Button asChild size="sm" variant="outline">
                      <Link to="/app/finance/invoices/new" search={{ edit: inv.id }}>
                        <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit Draft
                      </Link>
                    </Button>
                  )}

                  {inv.status === "Draft" && canIssue && (
                    <Button
                      size="sm"
                      onClick={() => issueMutation.mutate()}
                      disabled={issueMutation.isPending}
                    >
                      {issueMutation.isPending ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Issue Invoice
                    </Button>
                  )}

                  {inv.status === "Draft" && canEdit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteOpen(true)}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete Draft
                    </Button>
                  )}

                  {/* Payment Recording */}
                  {(inv.status === "Issued" ||
                    inv.status === "Partially Paid" ||
                    inv.status === "Sent" ||
                    displayStatus === "Overdue") &&
                    balance > 0 &&
                    canRecordPayment && (
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => {
                          setPayAmount(balance);
                          setPayOpen(true);
                        }}
                      >
                        <DollarSign className="mr-1.5 h-3.5 w-3.5" /> Record Payment
                      </Button>
                    )}

                  {/* Cancel / Void Action */}
                  {inv.status !== "Cancelled" &&
                    inv.status !== "Paid" &&
                    inv.status !== "Draft" &&
                    canCancel && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => setCancelOpen(true)}
                      >
                        <XCircle className="mr-1.5 h-3.5 w-3.5" /> Cancel / Void
                      </Button>
                    )}
                </div>
              </div>

              {/* Printable Invoice Sheet */}
              <div
                id="invoice-document"
                className="bg-card text-card-foreground border border-border rounded-xl p-6 sm:p-8 shadow-sm space-y-8 print:border-none print:shadow-none print:p-0"
              >
                {/* Header: Workspace Supplier & Invoice Metadata */}
                <div className="flex flex-col sm:flex-row justify-between items-start gap-6 border-b border-border pb-6 print-avoid-break">
                  <div className="space-y-2 max-w-sm">
                    {workspace.logoUrl ? (
                      <img
                        src={workspace.logoUrl}
                        alt={workspace.name}
                        className="h-12 w-auto max-w-[140px] object-contain"
                      />
                    ) : (
                      <div className="flex items-center gap-2 text-primary font-bold text-lg">
                        <Building2 className="h-6 w-6" />
                        <span>{workspace.name}</span>
                      </div>
                    )}
                    <h2 className="text-lg font-bold text-foreground">
                      {workspace.legalName || workspace.name}
                    </h2>
                    {workspace.address && (
                      <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed">
                        {workspace.address}
                      </p>
                    )}
                    <div className="text-xs text-muted-foreground space-y-0.5 pt-1">
                      {workspace.gstin && (
                        <p>
                          <span className="font-semibold text-foreground">GSTIN:</span>{" "}
                          {workspace.gstin}
                        </p>
                      )}
                      {workspace.pan && (
                        <p>
                          <span className="font-semibold text-foreground">PAN:</span>{" "}
                          {workspace.pan}
                        </p>
                      )}
                      {workspace.state && (
                        <p>
                          <span className="font-semibold text-foreground">State:</span>{" "}
                          {workspace.state} {workspace.stateCode ? `(${workspace.stateCode})` : ""}
                        </p>
                      )}
                      {workspace.contactEmail && <p>Email: {workspace.contactEmail}</p>}
                      {workspace.contactPhone && <p>Phone: {workspace.contactPhone}</p>}
                    </div>
                  </div>

                  <div className="text-left sm:text-right space-y-1 sm:min-w-[220px]">
                    <span className="inline-block text-xs uppercase tracking-wider font-semibold text-primary px-2.5 py-0.5 rounded bg-primary/10 mb-1">
                      {inv.invoice_type || "Tax Invoice"}
                    </span>
                    <p className="font-mono text-xl sm:text-2xl font-bold text-foreground">
                      {inv.invoice_number}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Date:{" "}
                      <span className="font-medium text-foreground">
                        {formatDate(inv.issue_date)}
                      </span>
                    </p>
                    {inv.due_date && (
                      <p className="text-xs text-muted-foreground">
                        Due Date:{" "}
                        <span
                          className={`font-medium ${isOverdue ? "text-destructive font-bold" : "text-foreground"}`}
                        >
                          {formatDate(inv.due_date)}
                        </span>
                      </p>
                    )}
                    {inv.place_of_supply && (
                      <p className="text-xs text-muted-foreground">
                        Place of Supply:{" "}
                        <span className="font-medium text-foreground">{inv.place_of_supply}</span>
                      </p>
                    )}
                    {inv.financial_year && (
                      <p className="text-xs text-muted-foreground">
                        FY:{" "}
                        <span className="font-medium text-foreground">{inv.financial_year}</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* Billed To (Customer) & Relations */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm print-avoid-break">
                  <div className="space-y-1.5 p-4 rounded-lg bg-muted/20 border border-border">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Billed To (Customer)
                    </p>
                    <p className="font-bold text-foreground text-base">
                      {inv.customer_name || "Direct Customer"}
                    </p>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {inv.customer_phone && <p>Phone: {inv.customer_phone}</p>}
                      {inv.customer_email && <p>Email: {inv.customer_email}</p>}
                      {inv.customer_city && <p>City: {inv.customer_city}</p>}
                    </div>
                  </div>

                  <div className="space-y-1.5 p-4 rounded-lg bg-muted/20 border border-border print:hidden">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Record Attribution & Linkages
                    </p>
                    <div className="text-xs space-y-1 text-muted-foreground">
                      <p>
                        <span className="font-medium text-foreground">Created By:</span>{" "}
                        {inv.creator_name || "System"}
                      </p>
                      <p>
                        <span className="font-medium text-foreground">Assigned To:</span>{" "}
                        {inv.assignee_name || "Unassigned"}
                      </p>
                      {inv.lead_name && (
                        <p>
                          <span className="font-medium text-foreground">Linked Lead:</span>{" "}
                          <span className="text-primary">{inv.lead_name}</span>
                        </p>
                      )}
                      {inv.property_name && (
                        <p>
                          <span className="font-medium text-foreground">Linked Property:</span>{" "}
                          <span className="text-primary">{inv.property_name}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Cancellation Banner if Cancelled */}
                {inv.status === "Cancelled" && (
                  <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs space-y-1">
                    <p className="font-bold flex items-center gap-1.5">
                      <XCircle className="h-4 w-4" /> This invoice was Cancelled / Voided
                    </p>
                    <p>Reason: {inv.cancellation_reason || "No reason specified"}</p>
                    {inv.cancelled_at && <p>Date: {formatDate(inv.cancelled_at)}</p>}
                  </div>
                )}

                {/* Line Items Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">Description</th>
                        <th className="py-2.5 px-3">HSN/SAC</th>
                        <th className="py-2.5 px-3 text-right">Qty</th>
                        <th className="py-2.5 px-3 text-right">Rate</th>
                        <th className="py-2.5 px-3 text-right">Disc</th>
                        <th className="py-2.5 px-3 text-right">GST %</th>
                        <th className="py-2.5 px-3 text-right">Line Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {items.map((item, idx) => (
                        <tr key={item.id} className="hover:bg-muted/10">
                          <td className="py-3 px-3 text-muted-foreground text-xs">{idx + 1}</td>
                          <td className="py-3 px-3 font-medium text-foreground">
                            {item.description}
                          </td>
                          <td className="py-3 px-3 text-muted-foreground text-xs font-mono">
                            {item.hsn_sac || "—"}
                          </td>
                          <td className="py-3 px-3 text-right">
                            {item.quantity}{" "}
                            {item.unit ? (
                              <span className="text-xs text-muted-foreground">{item.unit}</span>
                            ) : (
                              ""
                            )}
                          </td>
                          <td className="py-3 px-3 text-right">
                            {formatMoney(Number(item.rate ?? item.unit_amount), currency)}
                          </td>
                          <td className="py-3 px-3 text-right text-muted-foreground">
                            {Number(item.discount) > 0
                              ? formatMoney(Number(item.discount), currency)
                              : "—"}
                          </td>
                          <td className="py-3 px-3 text-right text-xs">
                            {item.tax_rate ?? inv.tax_rate}%
                          </td>
                          <td className="py-3 px-3 text-right font-semibold text-foreground">
                            {formatMoney(Number(item.line_total ?? item.amount), currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Financial Summary & Bank Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-border print-avoid-break">
                  {/* Bank & Settlement Details */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Bank Settlement Details
                    </p>
                    <div className="p-3 rounded-lg bg-muted/20 border border-border text-xs space-y-1">
                      <p>
                        <span className="text-muted-foreground">Bank: </span>
                        <span className="font-semibold text-foreground">
                          {workspace.bankName || "—"}
                        </span>
                      </p>
                      <p>
                        <span className="text-muted-foreground">A/C Name: </span>
                        <span className="font-semibold text-foreground">
                          {workspace.bankAccountName || workspace.legalName || workspace.name}
                        </span>
                      </p>
                      <p>
                        <span className="text-muted-foreground">A/C No: </span>
                        <span className="font-mono font-semibold text-foreground">
                          {workspace.bankAccountNo || "—"}
                        </span>
                      </p>
                      <p>
                        <span className="text-muted-foreground">IFSC: </span>
                        <span className="font-mono font-semibold text-foreground">
                          {workspace.bankIfsc || "—"}
                        </span>
                      </p>
                    </div>

                    {inv.notes && (
                      <div className="pt-2">
                        <p className="text-xs font-semibold text-muted-foreground">Notes:</p>
                        <p className="text-xs text-muted-foreground whitespace-pre-line mt-0.5">
                          {inv.notes}
                        </p>
                      </div>
                    )}

                    {inv.terms && (
                      <div className="pt-1">
                        <p className="text-xs font-semibold text-muted-foreground">
                          Terms & Conditions:
                        </p>
                        <p className="text-xs text-muted-foreground whitespace-pre-line mt-0.5">
                          {inv.terms}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Calculations Breakdown */}
                  <div className="space-y-2 text-sm sm:max-w-sm sm:ml-auto w-full">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="font-medium text-foreground">
                        {formatMoney(inv.subtotal, currency)}
                      </span>
                    </div>

                    {Number(inv.discount) > 0 && (
                      <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                        <span>Discount</span>
                        <span>- {formatMoney(Number(inv.discount || 0), currency)}</span>
                      </div>
                    )}

                    <div className="flex justify-between pt-1 border-t border-border text-xs">
                      <span className="text-muted-foreground">Taxable Value</span>
                      <span className="font-medium text-foreground">
                        {formatMoney(
                          Number(inv.taxable_amount) > 0
                            ? Number(inv.taxable_amount)
                            : Math.max(0, Number(inv.subtotal) - Number(inv.discount || 0)),
                          currency,
                        )}
                      </span>
                    </div>

                    {Number(inv.igst) > 0 ? (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">IGST (Inter-state)</span>
                        <span className="font-medium text-foreground">
                          {formatMoney(Number(inv.igst || 0), currency)}
                        </span>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">CGST (Intra-state)</span>
                          <span className="font-medium text-foreground">
                            {formatMoney(Number(inv.cgst || Number(inv.tax_amount) / 2), currency)}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">SGST (Intra-state)</span>
                          <span className="font-medium text-foreground">
                            {formatMoney(Number(inv.sgst || Number(inv.tax_amount) / 2), currency)}
                          </span>
                        </div>
                      </>
                    )}

                    <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
                      <span>Total Invoiced</span>
                      <span className="text-primary text-lg">
                        {formatMoney(inv.total, currency)}
                      </span>
                    </div>

                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-semibold pt-1">
                      <span>Total Paid</span>
                      <span>{formatMoney(totalPaid, currency)}</span>
                    </div>

                    <div className="flex justify-between border-t-2 border-border pt-2 font-bold text-foreground">
                      <span>Balance Outstanding</span>
                      <span
                        className={
                          balance > 0 ? "text-destructive font-mono text-base" : "text-emerald-600"
                        }
                      >
                        {formatMoney(balance, currency)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Recorded Payments (Printed on Invoice if payments exist) */}
                {payments.length > 0 && (
                  <div className="hidden print:block print-avoid-break pt-4 border-t border-border space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-foreground">
                      Payment Receipts &amp; Settlement History
                    </p>
                    <table className="w-full text-left text-xs border border-border">
                      <thead>
                        <tr className="bg-muted/40 border-b border-border font-semibold">
                          <th className="py-1.5 px-2">Date</th>
                          <th className="py-1.5 px-2">Reference / UTR</th>
                          <th className="py-1.5 px-2">Method</th>
                          <th className="py-1.5 px-2 text-right">Amount Paid</th>
                          <th className="py-1.5 px-2 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {payments.map((p) => (
                          <tr key={p.id}>
                            <td className="py-1.5 px-2">{formatDate(p.paid_at)}</td>
                            <td className="py-1.5 px-2 font-mono">{p.reference || "—"}</td>
                            <td className="py-1.5 px-2">{p.method}</td>
                            <td className="py-1.5 px-2 text-right font-medium">
                              {formatMoney(p.amount, currency)}
                            </td>
                            <td className="py-1.5 px-2 text-center">{p.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Payment History & Reconciliations */}
              <SectionCard
                title={`Recorded Payments (${payments.length})`}
                description="Live receipts reconciled against this invoice."
                bodyClassName="p-0"
                className="no-print"
              >
                {payments.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    No payments have been recorded for this invoice yet.
                  </div>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-wider">
                        <th className="px-4 py-2.5">Reference / UTR</th>
                        <th className="px-4 py-2.5">Date</th>
                        <th className="px-4 py-2.5">Method</th>
                        <th className="px-4 py-2.5">Recorded By</th>
                        <th className="px-4 py-2.5 text-right">Amount</th>
                        <th className="px-4 py-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {payments.map((p) => (
                        <tr key={p.id} className="hover:bg-muted/10">
                          <td className="px-4 py-3 font-mono font-medium">{p.reference || "—"}</td>
                          <td className="px-4 py-3">{formatDate(p.paid_at)}</td>
                          <td className="px-4 py-3 text-xs">{p.method}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {p.creator_name || "User"}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                            {formatMoney(p.amount, currency)}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge
                              label={p.status}
                              tone={p.status === "Received" ? "success" : "danger"}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </SectionCard>

              {/* Record Payment Dialog */}
              <Dialog open={payOpen} onOpenChange={setPayOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5 text-emerald-600" /> Record Client Payment
                    </DialogTitle>
                    <DialogDescription>
                      Record payment for invoice{" "}
                      <code className="bg-muted px-1 rounded">{inv.invoice_number}</code>. Remaining
                      balance:{" "}
                      <span className="font-semibold text-foreground">
                        {formatMoney(balance, currency)}
                      </span>
                      .
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-2">
                    <div className="space-y-1.5">
                      <Label>Payment Amount ({workspace.currency}) *</Label>
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        max={balance}
                        value={payAmount}
                        onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label>Payment Method *</Label>
                      <Select value={payMethod} onValueChange={setPayMethod}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_METHODS.map((m) => (
                            <SelectItem key={m} value={m}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Payment Date *</Label>
                        <Input
                          type="date"
                          value={payDate}
                          onChange={(e) => setPayDate(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Reference / UTR / Cheque #</Label>
                        <Input
                          placeholder="e.g. UTR10293847"
                          value={payReference}
                          onChange={(e) => setPayReference(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Notes</Label>
                      <Textarea
                        rows={2}
                        placeholder="e.g. Received via client HDFC bank transfer"
                        value={payNotes}
                        onChange={(e) => setPayNotes(e.target.value)}
                      />
                    </div>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setPayOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      disabled={payAmount <= 0 || recordPaymentMutation.isPending}
                      onClick={() => recordPaymentMutation.mutate(inv)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {recordPaymentMutation.isPending && (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      )}
                      Confirm & Reconcile Payment
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Cancel / Void Invoice Dialog */}
              <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-destructive">
                      <XCircle className="h-5 w-5" /> Cancel / Void Invoice
                    </DialogTitle>
                    <DialogDescription>
                      Voiding an issued invoice is an audited statutory action. Please provide a
                      clear cancellation reason.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="py-2">
                    <Label className="text-xs">Reason for Cancellation *</Label>
                    <Textarea
                      rows={3}
                      placeholder="e.g. Client requested revised quote / Deal cancelled"
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      className="mt-1"
                    />
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCancelOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={!cancelReason.trim() || cancelMutation.isPending}
                      onClick={() => cancelMutation.mutate()}
                    >
                      {cancelMutation.isPending && (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      )}
                      Confirm Void
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Delete Draft Dialog */}
              <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete Draft Invoice</DialogTitle>
                    <DialogDescription>
                      Are you sure you want to permanently delete draft invoice{" "}
                      <span className="font-semibold text-foreground">{inv.invoice_number}</span>?
                      This action cannot be undone.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate()}
                    >
                      {deleteMutation.isPending && (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      )}
                      Delete Draft
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          );
        }}
      </DataState>
    </div>
  );
}
