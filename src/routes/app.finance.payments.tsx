import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Loader2, Plus, Wallet } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { DataState } from "@/components/common/DataState";
import { PermissionGate } from "@/components/app/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  paymentMethods,
  paymentStatuses,
  qk,
} from "@/lib/crm-api";
import { useSession } from "@/hooks/use-session";
import { formatMoney, formatDate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/app/finance/payments")({
  head: () => ({
    meta: [
      { title: "Payments · BLUETORN CRM" },
      { name: "description", content: "Record and track payments against invoices." },
      { property: "og:title", content: "Payments · BLUETORN CRM" },
      { property: "og:description", content: "Record and track payments against invoices." },
    ],
  }),
  component: PaymentsPage,
});

function PaymentsPage() {
  return (
    <PermissionGate requires="view.finance">
      <PaymentsContent />
    </PermissionGate>
  );
}

const emptyForm = {
  invoiceId: "",
  amount: "",
  method: "Bank Transfer" as string,
  reference: "",
  status: "Received" as string,
  notes: "",
};

function PaymentsContent() {
  const { workspace, user } = useSession();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
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

  const addMutation = useMutation({
    mutationFn: () =>
      createPayment({
        workspace_id: workspace.id,
        created_by: user.id,
        invoice_id: form.invoiceId || null,
        amount: parseFloat(form.amount) || 0,
        method: form.method,
        reference: form.reference.trim() || null,
        status: form.status,
        notes: form.notes.trim() || null,
        currency: workspace.currency,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.payments(workspace.id) });
      queryClient.invalidateQueries({ queryKey: qk.invoices(workspace.id) });
      toast.success("Payment recorded successfully.");
      setForm(emptyForm);
      setDialogOpen(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to record payment.");
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

  return (
    <div className="space-y-5">
      <PageHeader
        title="Payments"
        description="Record and track payments against invoices."
        actions={
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Record Payment
          </Button>
        }
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Record Payment</DialogTitle>
              <DialogDescription>Log a payment against an invoice.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="payInvoice">Invoice</Label>
                <DataState query={invoicesQuery} loadingLabel="Loading…">
                  {(invoices) => (
                    <Select value={form.invoiceId} onValueChange={(v) => setForm({ ...form, invoiceId: v })}>
                      <SelectTrigger id="payInvoice">
                        <SelectValue placeholder="Select invoice (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {invoices
                          .filter((i) => i.status !== "Cancelled" && i.status !== "Paid")
                          .map((i) => (
                            <SelectItem key={i.id} value={i.id}>
                              {i.invoice_number} — {formatMoney(i.total, currency)}
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
                  <Input
                    id="payAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="payMethod">Method</Label>
                  <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
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
                  <Label htmlFor="payRef">Reference</Label>
                  <Input
                    id="payRef"
                    placeholder="PMT-12345"
                    value={form.reference}
                    onChange={(e) => setForm({ ...form, reference: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="payStatus">Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger id="payStatus">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentStatuses.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="payNotes">Notes</Label>
                <Input
                  id="payNotes"
                  placeholder="Optional notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={addMutation.isPending}>
                {addMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Record Payment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DataState query={paymentsQuery} loadingLabel="Loading payments…">
        {(payments) => {
          if (payments.length === 0) {
            return (
              <EmptyState
                icon={Wallet}
                title="No payments recorded"
                description="Record your first payment to start tracking collections."
                action={<Button onClick={() => setDialogOpen(true)}>Record Payment</Button>}
              />
            );
          }

          return (
            <SectionCard bodyClassName="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-border text-muted-foreground border-b text-xs uppercase">
                      <th className="px-4 py-2 sm:px-5">Reference</th>
                      <th className="px-4 py-2">Date</th>
                      <th className="px-4 py-2">Method</th>
                      <th className="px-4 py-2 text-right">Amount</th>
                      <th className="px-4 py-2">Invoice</th>
                      <th className="px-4 py-2 sm:px-5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-border divide-y">
                    {payments.map((p) => (
                      <tr key={p.id} className="hover:bg-accent/50">
                        <td className="px-4 py-2.5 font-medium sm:px-5">{p.reference ?? "—"}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{formatDate(p.paid_at)}</td>
                        <td className="px-4 py-2.5">{p.method}</td>
                        <td className="px-4 py-2.5 text-right font-medium">
                          {formatMoney(p.amount, currency)}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {p.invoice_id ? "Linked" : "—"}
                        </td>
                        <td className="px-4 py-2.5 sm:px-5">
                          <StatusBadge label={p.status} />
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
