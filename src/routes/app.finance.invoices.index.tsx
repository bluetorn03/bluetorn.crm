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
      { name: "description", content: "Create, send and track invoices for your customers." },
      { property: "og:title", content: "Invoices · BLUETORN CRM" },
      { property: "og:description", content: "Create, send and track invoices." },
    ],
  }),
  component: InvoicesPage,
});

function InvoicesPage() {
  return (
    <PermissionGate requires="view.finance">
      <InvoicesContent />
    </PermissionGate>
  );
}

function InvoicesContent() {
  const { workspace } = useSession();

  const invoicesQuery = useQuery({
    queryKey: qk.invoices(workspace.id),
    queryFn: () => listInvoices(workspace.id),
    enabled: !!workspace.id,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Invoices"
        description="Create, send and track invoices for your customers."
        actions={
          <Button asChild size="sm">
            <Link to="/app/finance/invoices/new">
              <Plus className="mr-1.5 h-4 w-4" /> New Invoice
            </Link>
          </Button>
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
                  <Button asChild>
                    <Link to="/app/finance/invoices/new">Create Invoice</Link>
                  </Button>
                }
              />
            );
          }

          return (
            <SectionCard bodyClassName="p-0">
              <ul className="divide-border divide-y">
                {invoices.map((inv) => (
                  <li key={inv.id}>
                    <Link
                      to="/app/finance/invoices/$invoiceId"
                      params={{ invoiceId: inv.id }}
                      className="hover:bg-accent/50 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 transition-colors sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:px-5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{inv.invoice_number}</p>
                        <p className="text-muted-foreground truncate text-xs">
                          {inv.customer_id ? `Customer` : "—"} · Issued {formatDate(inv.issue_date)}
                        </p>
                      </div>
                      <p className="hidden text-sm font-medium sm:block">
                        {formatMoney(inv.total, (inv.currency ?? "INR") as any)}
                      </p>
                      <p className="text-muted-foreground hidden text-xs sm:block">
                        {inv.due_date ? `Due ${formatDate(inv.due_date)}` : "No due date"}
                      </p>
                      <StatusBadge label={inv.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </SectionCard>
          );
        }}
      </DataState>
    </div>
  );
}
