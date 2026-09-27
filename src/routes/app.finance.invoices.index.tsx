import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileText, Plus } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { DataState } from "@/components/common/DataState";
import { PermissionGate } from "@/components/app/PermissionGate";
import { Button } from "@/components/ui/button";
import { listInvoices, qk } from "@/lib/crm-api";
import { useSession } from "@/hooks/use-session";
import { formatMoney, formatDate } from "@/lib/format";

export const Route = createFileRoute("/app/finance/invoices/")({
  head: () => ({
    meta: [
      { title: "Invoices · BLUETORN CRM" },
      { name: "description", content: "Create, send and track tax invoices for your customers." },
      { property: "og:title", content: "Invoices · BLUETORN CRM" },
      { property: "og:description", content: "Create, send and track tax invoices." },
    ],
  }),
  component: InvoicesPage,
});

function InvoicesPage() {
  return (
    <PermissionGate requires={["finance.view", "manage.finance"]}>
      <InvoicesContent />
    </PermissionGate>
  );
}

function InvoicesContent() {
  const { workspace, can } = useSession();

  const invoicesQuery = useQuery({
    queryKey: qk.invoices(workspace.id),
    queryFn: () => listInvoices(workspace.id),
    enabled: !!workspace.id,
  });

  const canCreate = can("finance.invoices.create");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tax Invoices"
        description="Manage customer billing, GST breakdowns, payments, and statutory documents."
        actions={
          canCreate && (
            <Button asChild size="sm">
              <Link to="/app/finance/invoices/new">
                <Plus className="mr-1.5 h-4 w-4" /> New Invoice
              </Link>
            </Button>
          )
        }
      />

      <DataState query={invoicesQuery} loadingLabel="Loading invoices…">
        {(invoices) => {
          if (invoices.length === 0) {
            return (
              <EmptyState
                icon={FileText}
                title="No invoices yet"
                description="Create your first invoice to start tracking revenue."
                action={
                  canCreate ? (
                    <Button asChild>
                      <Link to="/app/finance/invoices/new">Create Invoice</Link>
                    </Button>
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
                      <th className="px-4 py-3">Invoice #</th>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Issue Date</th>
                      <th className="px-4 py-3">Due Date</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3">Assigned To</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {invoices.map((inv) => {
                      const isOverdue =
                        inv.due_date &&
                        new Date(inv.due_date).getTime() < Date.now() &&
                        inv.status !== "Paid" &&
                        inv.status !== "Cancelled" &&
                        inv.status !== "Draft";

                      const displayStatus = isOverdue ? "Overdue" : inv.status;

                      return (
                        <tr
                          key={inv.id}
                          className="hover:bg-muted/40 cursor-pointer transition-colors"
                        >
                          <td className="px-4 py-3.5 font-mono font-medium text-foreground">
                            <Link
                              to="/app/finance/invoices/$invoiceId"
                              params={{ invoiceId: inv.id }}
                              className="text-primary hover:underline"
                            >
                              {inv.invoice_number}
                            </Link>
                            <span className="block text-[11px] text-muted-foreground font-sans">
                              {inv.invoice_type || "Tax Invoice"}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 font-medium text-foreground">
                            {inv.customer_name || "Direct Customer"}
                          </td>
                          <td className="px-4 py-3.5 text-muted-foreground">
                            {formatDate(inv.issue_date)}
                          </td>
                          <td className="px-4 py-3.5">
                            <span
                              className={
                                isOverdue
                                  ? "text-destructive font-medium"
                                  : "text-muted-foreground"
                              }
                            >
                              {inv.due_date ? formatDate(inv.due_date) : "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-right font-semibold font-mono text-foreground">
                            {formatMoney(inv.total, (inv.currency ?? "INR") as any)}
                          </td>
                          <td className="px-4 py-3.5 text-xs text-muted-foreground">
                            {inv.assignee_name || "—"}
                          </td>
                          <td className="px-4 py-3.5">
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
                          </td>
                        </tr>
                      );
                    })}
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
