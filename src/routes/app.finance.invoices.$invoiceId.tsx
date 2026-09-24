import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { DataState } from "@/components/common/DataState";
import { PermissionGate } from "@/components/app/PermissionGate";
import { Button } from "@/components/ui/button";
import { getInvoice, paidAmount, updateInvoiceStatus, qk } from "@/lib/crm-api";
import { useSession } from "@/hooks/use-session";
import { formatMoney, formatDate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/app/finance/invoices/$invoiceId")({
  head: () => ({
    meta: [
      { title: "Invoice detail · BLUETORN CRM" },
      { name: "description", content: "View invoice detail, line items and payment history." },
    ],
  }),
  component: InvoiceDetailPage,
});

function InvoiceDetailPage() {
  return (
    <PermissionGate requires="view.finance">
      <InvoiceDetailContent />
    </PermissionGate>
  );
}

function InvoiceDetailContent() {
  const { invoiceId } = Route.useParams();
  const { workspace } = useSession();
  const queryClient = useQueryClient();

  const invoiceQuery = useQuery({
    queryKey: qk.invoice(invoiceId),
    queryFn: () => getInvoice(invoiceId),
    enabled: !!invoiceId,
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => updateInvoiceStatus(invoiceId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.invoice(invoiceId) });
      queryClient.invalidateQueries({ queryKey: qk.invoices(workspace.id) });
      toast.success("Invoice status updated.");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update status.");
    },
  });

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/app/finance/invoices">
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Invoices
        </Link>
      </Button>

      <DataState query={invoiceQuery} loadingLabel="Loading invoice…">
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
          const balance = inv.total - totalPaid;

          return (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <PageHeader
                  title={inv.invoice_number}
                  description={`Issued ${formatDate(inv.issue_date)}${inv.due_date ? ` · Due ${formatDate(inv.due_date)}` : ""}`}
                />
                <div className="flex items-center gap-2">
                  <StatusBadge label={inv.status} />
                  {inv.status === "Draft" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => statusMutation.mutate("Sent")}
                    >
                      Mark as Sent
                    </Button>
                  )}
                  {inv.status !== "Cancelled" && inv.status !== "Paid" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => statusMutation.mutate("Cancelled")}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <SectionCard className="lg:col-span-2" title="Line Items" bodyClassName="p-0">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-border text-muted-foreground border-b text-xs uppercase">
                        <th className="px-4 py-2 sm:px-5">Description</th>
                        <th className="px-4 py-2 text-right">Qty</th>
                        <th className="px-4 py-2 text-right">Rate</th>
                        <th className="px-4 py-2 text-right sm:px-5">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-border divide-y">
                      {items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-2.5 sm:px-5">{item.description}</td>
                          <td className="px-4 py-2.5 text-right">{item.quantity}</td>
                          <td className="px-4 py-2.5 text-right">
                            {formatMoney(item.unit_amount, currency)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium sm:px-5">
                            {formatMoney(item.amount, currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </SectionCard>

                <SectionCard title="Summary">
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Subtotal</dt>
                      <dd className="font-medium">{formatMoney(inv.subtotal, currency)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Tax ({inv.tax_rate}%)</dt>
                      <dd className="font-medium">{formatMoney(inv.tax_amount, currency)}</dd>
                    </div>
                    <div className="border-border flex justify-between border-t pt-2 text-base font-semibold">
                      <dt>Total</dt>
                      <dd className="text-primary">{formatMoney(inv.total, currency)}</dd>
                    </div>
                    <div className="flex justify-between text-success">
                      <dt>Paid</dt>
                      <dd className="font-medium">{formatMoney(totalPaid, currency)}</dd>
                    </div>
                    <div className="flex justify-between font-semibold">
                      <dt>Balance</dt>
                      <dd>{formatMoney(Math.max(0, balance), currency)}</dd>
                    </div>
                  </dl>
                </SectionCard>
              </div>

              {payments.length > 0 && (
                <SectionCard title="Payment History" bodyClassName="p-0">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-border text-muted-foreground border-b text-xs uppercase">
                        <th className="px-4 py-2">Reference</th>
                        <th className="px-4 py-2">Date</th>
                        <th className="px-4 py-2">Method</th>
                        <th className="px-4 py-2 text-right">Amount</th>
                        <th className="px-4 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-border divide-y">
                      {payments.map((p) => (
                        <tr key={p.id}>
                          <td className="px-4 py-2.5 font-medium">{p.reference ?? "—"}</td>
                          <td className="px-4 py-2.5">{formatDate(p.paid_at)}</td>
                          <td className="px-4 py-2.5">{p.method}</td>
                          <td className="px-4 py-2.5 text-right font-medium">
                            {formatMoney(p.amount, currency)}
                          </td>
                          <td className="px-4 py-2.5">
                            <StatusBadge label={p.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </SectionCard>
              )}
            </>
          );
        }}
      </DataState>
    </div>
  );
}
