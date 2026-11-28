import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileText, Plus, Search, X } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { DataState } from "@/components/common/DataState";
import { PermissionGate } from "@/components/app/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listInvoices, invoiceStatuses, qk, type Invoice } from "@/lib/crm-api";
import { useSession } from "@/hooks/use-session";
import { formatMoney, formatDate, parseDbUtcTimestamp } from "@/lib/format";

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

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const invoicesQuery = useQuery({
    queryKey: qk.invoices(workspace.id),
    queryFn: () => listInvoices(workspace.id),
    enabled: !!workspace.id,
  });

  const canCreate = can("finance.invoices.create");

  const filterInvoice = (inv: Invoice) => {
    const isOverdue =
      inv.due_date &&
      new Date(inv.due_date).getTime() < Date.now() &&
      inv.status !== "Paid" &&
      inv.status !== "Cancelled" &&
      inv.status !== "Draft";
    const displayStatus = isOverdue ? "Overdue" : inv.status;

    if (statusFilter !== "All" && displayStatus !== statusFilter) return false;

    if (q) {
      const qLower = q.toLowerCase();
      const matchesNum = (inv.invoice_number || "").toLowerCase().includes(qLower);
      const matchesCust = (inv.customer_name || "").toLowerCase().includes(qLower);
      const matchesAssignee = (inv.assignee_name || "").toLowerCase().includes(qLower);
      if (!matchesNum && !matchesCust && !matchesAssignee) return false;
    }

    if (dateFrom || dateTo) {
      const ts = parseDbUtcTimestamp(inv.issue_date || inv.created_at);
      if (!ts) return false;
      const dateStr = ts.toISOString().slice(0, 10);
      if (dateFrom && dateStr < dateFrom) return false;
      if (dateTo && dateStr > dateTo) return false;
    }

    return true;
  };

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

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="text-muted-foreground absolute top-2.5 left-3 h-4 w-4" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search invoice #, customer..."
            className="pl-9 h-9 text-xs"
          />
        </div>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer h-9"
        >
          <option value="All">All Statuses</option>
          <option value="Draft">Draft</option>
          <option value="Sent">Sent</option>
          <option value="Partially Paid">Partially Paid</option>
          <option value="Paid">Paid</option>
          <option value="Overdue">Overdue</option>
          <option value="Cancelled">Cancelled</option>
        </select>

        {/* Date range filter: From */}
        <div className="flex items-center gap-1">
          <label className="text-muted-foreground text-xs whitespace-nowrap">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              if (dateTo && e.target.value && dateTo < e.target.value) setDateTo("");
            }}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer h-9"
          />
        </div>

        {/* Date range filter: To */}
        <div className="flex items-center gap-1">
          <label className="text-muted-foreground text-xs whitespace-nowrap">To</label>
          <input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer h-9"
          />
        </div>

        {/* Reset button */}
        {(dateFrom || dateTo || statusFilter !== "All" || q) && (
          <button
            onClick={() => {
              setDateFrom("");
              setDateTo("");
              setStatusFilter("All");
              setQ("");
            }}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/30 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors cursor-pointer"
          >
            Reset Filters
            <X className="h-3 w-3 ml-0.5" />
          </button>
        )}
      </div>

      <DataState query={invoicesQuery} loadingLabel="Loading invoices…">
        {(invoices) => {
          const rows = invoices.filter(filterInvoice);
          const totalFilteredAmount = rows.reduce((sum, inv) => sum + Number(inv.total || 0), 0);

          if (rows.length === 0) {
            return (
              <EmptyState
                icon={FileText}
                title="No invoices match this view"
                description={
                  invoices.length === 0
                    ? "Create your first invoice to start tracking revenue."
                    : "Try adjusting or resetting your search and date filters."
                }
                action={
                  canCreate && invoices.length === 0 ? (
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
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30 text-xs">
                <span className="text-muted-foreground">
                  Showing <strong className="text-foreground">{rows.length}</strong> invoice{rows.length === 1 ? "" : "s"}
                </span>
                <span className="font-medium text-foreground">
                  Total: <strong className="text-primary font-mono">{formatMoney(totalFilteredAmount, (workspace.currency ?? "INR") as any)}</strong>
                </span>
              </div>
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
                    {rows.map((inv) => {
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
                                isOverdue ? "text-destructive font-medium" : "text-muted-foreground"
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
