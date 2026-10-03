import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CreditCard,
  DollarSign,
  FileText,
  Loader2,
  Plus,
  RotateCcw,
  User,
  Wallet,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { DataState } from "@/components/common/DataState";
import { PermissionGate } from "@/components/app/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listPayments,
  listInvoices,
  createPayment,
  reversePayment,
  paymentMethods,
  qk,
} from "@/lib/crm-api";
import { useSession } from "@/hooks/use-session";
import { formatMoney, formatDate, relativeTime } from "@/lib/format";
import { toast } from "sonner";
import { MoneyInput } from "@/components/common/MoneyInput";
import type { Payment } from "@/lib/db-types";

export const Route = createFileRoute("/app/finance/payments")({
  head: () => ({
    meta: [
      { title: "Payments · BLUETORN CRM" },
      { name: "description", content: "Record, track and reconcile incoming payments against invoices." },
      { property: "og:title", content: "Payments · BLUETORN CRM" },
      { property: "og:description", content: "Record, track and reconcile incoming payments against invoices." },
    ],
  }),
  component: PaymentsPage,
});

function PaymentsPage() {
  return (
    <PermissionGate requires={["finance.view", "manage.finance"]}>
      <PaymentsContent />
    </PermissionGate>
  );
}

const emptyForm = {
  invoiceId: "",
  amount: "",
  method: "Bank Transfer",
  reference: "",
  paidAt: new Date().toISOString().slice(0, 10),
  notes: "",
};

function PaymentsContent() {
  const { workspace, user, can } = useSession();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [reverseOpen, setReverseOpen] = useState(false);
  const [reverseReason, setReverseReason] = useState("");
  const [form, setForm] = useState(emptyForm);

  const paymentsQuery = useQuery({
    queryKey: qk.payments(workspace.id),
    queryFn: () => listPayments(workspace.id),
    enabled: !!workspace.id,
  });

  const invoicesQuery = useQuery({
    queryKey: qk.invoices(workspace.id),
    queryFn: () => listInvoices(workspace.id),
    enabled: !!workspace.id,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: qk.payments(workspace.id) });
    queryClient.invalidateQueries({ queryKey: qk.invoices(workspace.id) });
    queryClient.invalidateQueries({ queryKey: ["dashboard", workspace.id] });
  };

  const addMutation = useMutation({
    mutationFn: () => {
      const selectedInv = (invoicesQuery.data ?? []).find((i) => i.id === form.invoiceId);
      return createPayment({
        workspace_id: workspace.id,
        invoice_id: form.invoiceId || null,
        customer_id: selectedInv?.customer_id ?? null,
        assigned_to: user.id,
        amount: parseFloat(form.amount) || 0,
        currency: workspace.currency ?? "INR",
        method: form.method,
        status: "Received",
        paid_at: form.paidAt,
        reference: form.reference.trim() || null,
        notes: form.notes.trim() || null,
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Payment recorded and reconciled successfully.");
      setForm(emptyForm);
      setDialogOpen(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to record payment.");
    },
  });

  const reverseMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPayment) return;
      return reversePayment(selectedPayment.id, reverseReason);
    },
    onSuccess: () => {
      invalidate();
      setReverseOpen(false);
      setSelectedPayment(null);
      setReverseReason("");
      toast.success("Payment reversed and invoice balance updated.");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to reverse payment.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) {
      toast.error("Please enter a valid amount.");
      return;
    }
    addMutation.mutate();
  };

  const currency = (workspace.currency ?? "INR") as any;
  const canRecordPayment = can("finance.payments.record");
  const canReversePayment = can("finance.payments.reverse");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments & Collections"
        description="Live transaction log of payments received, reconciled against customer invoices."
        actions={
          canRecordPayment && (
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Record Payment
            </Button>
          )
        }
      />

      {/* Record Payment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-emerald-600" /> Record Client Payment
              </DialogTitle>
              <DialogDescription>Record a payment and automatically reconcile against an invoice.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-3">
              <div className="space-y-1.5">
                <Label htmlFor="payInvoice">Linked Invoice</Label>
                <DataState query={invoicesQuery} loadingLabel="Loading invoices…">
                  {(invoices) => (
                    <Select
                      value={form.invoiceId}
                      onValueChange={(v) => {
                        const inv = invoices.find((i) => i.id === v);
                        setForm({
                          ...form,
                          invoiceId: v,
                          amount: inv ? String(Math.max(0, inv.total)) : form.amount,
                        });
                      }}
                    >
                      <SelectTrigger id="payInvoice">
                        <SelectValue placeholder="Select invoice (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {invoices
                          .filter((i) => i.status !== "Cancelled" && i.status !== "Paid")
                          .map((i) => (
                            <SelectItem key={i.id} value={i.id}>
                              {i.invoice_number} · {i.customer_name || "Customer"} — {formatMoney(i.total, currency)}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                </DataState>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="payAmount">Amount ({workspace.currency}) *</Label>
                  <MoneyInput
                    id="payAmount"
                    allowDecimals
                    currency={workspace.currency}
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(numericVal) =>
                      setForm({ ...form, amount: numericVal > 0 ? String(numericVal) : "" })
                    }
                    required
                    showAmountInWords
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="payMethod">Method *</Label>
                  <Select
                    value={form.method}
                    onValueChange={(v) => setForm({ ...form, method: v })}
                  >
                    <SelectTrigger id="payMethod">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethods.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="payDate">Payment Date *</Label>
                  <Input
                    id="payDate"
                    type="date"
                    value={form.paidAt}
                    onChange={(e) => setForm({ ...form, paidAt: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="payRef">Reference / UTR #</Label>
                  <Input
                    id="payRef"
                    placeholder="e.g. UTR9283719"
                    value={form.reference}
                    onChange={(e) => setForm({ ...form, reference: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="payNotes">Notes</Label>
                <Textarea
                  id="payNotes"
                  rows={2}
                  placeholder="Optional payment notes or bank narration"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={addMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {addMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Confirm Payment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Payment Details Drawer/Modal */}
      {selectedPayment && (
        <Dialog open={Boolean(selectedPayment)} onOpenChange={(o) => !o && setSelectedPayment(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <span>Payment Details</span>
                <StatusBadge
                  label={selectedPayment.status}
                  tone={selectedPayment.status === "Received" ? "success" : "danger"}
                />
              </DialogTitle>
              <DialogDescription>
                Transaction reference: <code className="bg-muted px-1 rounded font-mono">{selectedPayment.reference || "None"}</code>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 text-sm">
              <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                  Amount Received
                </p>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
                  {formatMoney(selectedPayment.amount, currency)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-2.5 rounded bg-muted/40 border border-border">
                  <p className="text-muted-foreground">Payment Date</p>
                  <p className="font-semibold text-foreground mt-0.5">{formatDate(selectedPayment.paid_at)}</p>
                </div>
                <div className="p-2.5 rounded bg-muted/40 border border-border">
                  <p className="text-muted-foreground">Payment Method</p>
                  <p className="font-semibold text-foreground mt-0.5">{selectedPayment.method}</p>
                </div>
                <div className="p-2.5 rounded bg-muted/40 border border-border">
                  <p className="text-muted-foreground">Customer</p>
                  <p className="font-semibold text-foreground mt-0.5">{selectedPayment.customer_name || "—"}</p>
                </div>
                <div className="p-2.5 rounded bg-muted/40 border border-border">
                  <p className="text-muted-foreground">Linked Invoice</p>
                  {selectedPayment.invoice_id ? (
                    <Link
                      to="/app/finance/invoices/$invoiceId"
                      params={{ invoiceId: selectedPayment.invoice_id }}
                      className="font-semibold text-primary hover:underline mt-0.5 block"
                    >
                      {selectedPayment.invoice_number || "View Invoice"}
                    </Link>
                  ) : (
                    <p className="font-semibold text-foreground mt-0.5">—</p>
                  )}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-muted/20 border border-border text-xs space-y-1 text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">Recorded By:</span> {selectedPayment.creator_name || "System"}
                </p>
                <p>
                  <span className="font-medium text-foreground">Assigned To:</span> {selectedPayment.assignee_name || "—"}
                </p>
                <p>
                  <span className="font-medium text-foreground">Recorded At:</span> {formatDate(selectedPayment.created_at)} ({relativeTime(selectedPayment.created_at)})
                </p>
                {selectedPayment.notes && (
                  <p className="pt-1 text-foreground">
                    <span className="text-muted-foreground font-normal">Notes: </span>
                    {selectedPayment.notes}
                  </p>
                )}
              </div>

              {selectedPayment.status === "Reversed" && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs space-y-0.5">
                  <p className="font-bold flex items-center gap-1.5">
                    <XCircle className="h-4 w-4" /> This payment has been reversed
                  </p>
                  <p>Reason: {selectedPayment.reversal_reason || "Not specified"}</p>
                  {selectedPayment.reversed_at && <p>Date: {formatDate(selectedPayment.reversed_at)}</p>}
                </div>
              )}
            </div>

            <DialogFooter className="flex items-center justify-between sm:justify-between border-t border-border pt-3">
              <div>
                {selectedPayment.status === "Received" && canReversePayment && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => setReverseOpen(true)}
                  >
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reverse Payment
                  </Button>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => setSelectedPayment(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Reverse Payment Confirmation Dialog */}
      <Dialog open={reverseOpen} onOpenChange={setReverseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <RotateCcw className="h-5 w-5" /> Reverse / Refund Payment
            </DialogTitle>
            <DialogDescription>
              Reversing this payment of{" "}
              <span className="font-semibold text-foreground">
                {formatMoney(selectedPayment?.amount ?? 0, currency)}
              </span>{" "}
              will restore the invoice balance and record an audit event.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <Label className="text-xs">Reason for Reversal / Refund *</Label>
            <Textarea
              rows={3}
              placeholder="e.g. Cheque bounced / Client requested refund"
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
              className="mt-1"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReverseOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!reverseReason.trim() || reverseMutation.isPending}
              onClick={() => reverseMutation.mutate()}
            >
              {reverseMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Confirm Reversal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payments Table */}
      <DataState query={paymentsQuery} loadingLabel="Loading payments…">
        {(payments) => {
          if (payments.length === 0) {
            return (
              <EmptyState
                icon={Wallet}
                title="No payments recorded"
                description="Record your first payment to start tracking collections."
                action={
                  canRecordPayment ? (
                    <Button onClick={() => setDialogOpen(true)}>Record Payment</Button>
                  ) : undefined
                }
              />
            );
          }

          return (
            <SectionCard bodyClassName="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-wider">
                      <th className="px-4 py-3">Reference / UTR</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Invoice</th>
                      <th className="px-4 py-3">Method</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3">Recorded By</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {payments.map((p) => (
                      <tr
                        key={p.id}
                        className="hover:bg-muted/40 cursor-pointer transition-colors"
                        onClick={() => setSelectedPayment(p)}
                      >
                        <td className="px-4 py-3 font-mono font-medium text-foreground">
                          {p.reference || "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(p.paid_at)}</td>
                        <td className="px-4 py-3 font-medium text-foreground">
                          {p.customer_name || "—"}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          {p.invoice_number ? (
                            <span className="text-primary hover:underline">{p.invoice_number}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">{p.method}</td>
                        <td className="px-4 py-3 text-right font-semibold font-mono text-emerald-600 dark:text-emerald-400">
                          {formatMoney(p.amount, currency)}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {p.creator_name || "User"}
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
              </div>
            </SectionCard>
          );
        }}
      </DataState>
    </div>
  );
}
