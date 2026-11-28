import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Edit, MoreVertical, Plus, Search, Trash2, Users, UserCheck, Upload, Download, X } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { SectionCard } from "@/components/common/SectionCard";
import { DataState } from "@/components/common/DataState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { listCustomers, listMembers, customerTypes, qk, type Customer } from "@/lib/crm-api";
import { useSession } from "@/hooks/use-session";
import { relativeTime, parseDbUtcTimestamp } from "@/lib/format";
import { AddCustomerDialog } from "@/components/crm/AddCustomerDialog";
import { EditCustomerDialog } from "@/components/crm/EditCustomerDialog";
import { DeleteCustomerDialog } from "@/components/crm/DeleteCustomerDialog";
import { AssignCustomerDialog } from "@/components/crm/AssignCustomerDialog";
import {
  BulkImportExportDialog,
  exportContactsToCsv,
} from "@/components/crm/BulkImportExportDialog";
import { toast } from "sonner";

export const Route = createFileRoute("/app/customers/")({
  head: () => ({
    meta: [
      { title: "Customers · BLUETORN CRM" },
      {
        name: "description",
        content: "Every customer, their activity, and who owns the relationship.",
      },
      { property: "og:title", content: "Customers · BLUETORN CRM" },
      { property: "og:description", content: "Every customer and relationship in one place." },
    ],
  }),
  component: CustomersPage,
});

const views = ["All", "Active", "Prospect", "Archived"] as const;

function CustomersPage() {
  const { workspace, role, dbRole } = useSession();

  const canAssign =
    role === "Owner" ||
    role === "Manager" ||
    role === "Super Admin" ||
    dbRole === "owner" ||
    dbRole === "manager" ||
    dbRole === "super_admin";

  const [view, setView] = useState<(typeof views)[number]>("All");
  const [customerType, setCustomerType] = useState<string>("All");
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [assigningCustomer, setAssigningCustomer] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);

  const customersQuery = useQuery({
    queryKey: qk.customers(workspace.id),
    queryFn: () => listCustomers(workspace.id),
    enabled: !!workspace.id,
  });

  const membersQuery = useQuery({
    queryKey: qk.members(workspace.id),
    queryFn: () => listMembers(workspace.id),
    enabled: !!workspace.id,
  });
  const memberMap = new Map((membersQuery.data ?? []).map((m) => [m.id, m.full_name]));

  const filterCustomer = (c: Customer) => {
    if (view !== "All" && c.status !== view) return false;
    if (customerType !== "All" && c.type !== customerType) return false;
    if (q) {
      const qLower = q.toLowerCase();
      const matchesName = c.name.toLowerCase().includes(qLower);
      const matchesPhone = (c.phone ?? "").includes(q);
      const matchesEmail = (c.email ?? "").toLowerCase().includes(qLower);
      if (!matchesName && !matchesPhone && !matchesEmail) return false;
    }
    if (dateFrom || dateTo) {
      const ts = parseDbUtcTimestamp(c.created_at);
      if (!ts) return false;
      const dateStr = ts.toISOString().slice(0, 10);
      if (dateFrom && dateStr < dateFrom) return false;
      if (dateTo && dateStr > dateTo) return false;
    }
    return true;
  };

  const handleExportCsv = () => {
    const list = customersQuery.data || [];
    if (list.length === 0) {
      toast.error("No customers available to export.");
      return;
    }

    const filtered = list.filter(filterCustomer);
    if (filtered.length === 0) {
      toast.error("No customers match the current filters.");
      return;
    }

    const headers = [
      "ID",
      "Name",
      "Phone",
      "Email",
      "Type",
      "Status",
      "City",
      "Deal Value",
      "Assigned To",
      "Created At",
    ];

    const rows = filtered.map((c) => [
      c.id,
      c.name,
      c.phone || "",
      c.email || "",
      c.type || "",
      c.status || "",
      c.city || "",
      c.value || 0,
      memberMap.get(c.assigned_to || "") || "Unassigned",
      c.created_at || "",
    ]);

    exportContactsToCsv({
      filename: `customers_${workspace.code.toLowerCase()}_${new Date().toISOString().slice(0, 10)}`,
      headers,
      rows,
    });
    toast.success(`Exported ${filtered.length} customers to CSV.`);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Customers"
        description="Relationships, not records."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              title="Export customers to CSV spreadsheet"
            >
              <Download className="mr-1.5 h-4 w-4" /> Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportOpen(true)}
              title="Bulk import customers from CSV / Excel"
            >
              <Upload className="mr-1.5 h-4 w-4" /> Import CSV
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Add Customer
            </Button>
          </>
        }
      />

      <AddCustomerDialog open={addOpen} onOpenChange={setAddOpen} />
      <BulkImportExportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        workspaceId={workspace.id}
        entityType="customer"
      />
      <AssignCustomerDialog
        open={!!assigningCustomer}
        onOpenChange={(open) => !open && setAssigningCustomer(null)}
        customer={assigningCustomer}
      />
      {editingCustomer && (
        <EditCustomerDialog
          open={!!editingCustomer}
          onOpenChange={(open) => !open && setEditingCustomer(null)}
          customer={editingCustomer}
        />
      )}
      {deletingCustomer && (
        <DeleteCustomerDialog
          open={!!deletingCustomer}
          onOpenChange={(open) => !open && setDeletingCustomer(null)}
          customer={deletingCustomer}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="text-muted-foreground absolute top-2.5 left-3 h-4 w-4" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, phone or email"
            className="pl-9"
          />
        </div>
        <div className="border-border bg-card flex gap-1 rounded-lg border p-1">
          {views.map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer " +
                (view === v
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {v}
            </button>
          ))}
        </div>

        {/* Customer Type Filter */}
        <select
          value={customerType}
          onChange={(e) => setCustomerType(e.target.value)}
          className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer h-9"
        >
          <option value="All">All Types</option>
          {customerTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
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

        {/* Reset / Clear active filter chip */}
        {(dateFrom || dateTo || customerType !== "All" || view !== "All" || q) && (
          <button
            onClick={() => {
              setDateFrom("");
              setDateTo("");
              setCustomerType("All");
              setView("All");
              setQ("");
            }}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/30 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors cursor-pointer"
          >
            Reset Filters
            <X className="h-3 w-3 ml-0.5" />
          </button>
        )}
      </div>

      <DataState query={customersQuery} loadingLabel="Loading customers…">
        {(customers) => {
          const rows = customers.filter(filterCustomer);

          if (rows.length === 0) {
            return (
              <EmptyState
                icon={Users}
                title="No customers match this view"
                description="Try clearing the search, or add your first customer to start building the relationship timeline."
                action={<Button onClick={() => setAddOpen(true)}>Add Customer</Button>}
              />
            );
          }

          return (
            <SectionCard bodyClassName="p-0">
              <ul className="divide-border divide-y">
                {rows.map((c) => (
                  <li key={c.id} className="hover:bg-accent/40 transition-colors">
                    <div className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
                      <Link
                        to="/app/customers/$customerId"
                        params={{ customerId: c.id }}
                        className="min-w-0 flex-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium hover:text-primary transition-colors">
                            {c.name}
                          </p>
                          <p className="text-muted-foreground truncate text-xs">
                            {c.phone ?? "—"} · {c.type} · {c.city ?? "—"}
                          </p>
                        </div>
                        <p className="text-muted-foreground hidden truncate text-xs sm:block">
                          {c.assigned_to
                            ? memberMap.get(c.assigned_to) || "Assigned"
                            : "Unassigned"}
                        </p>
                        <p className="text-muted-foreground hidden truncate text-xs sm:block">
                          {relativeTime(c.updated_at)}
                        </p>
                        <StatusBadge label={c.status} />
                      </Link>

                      <div className="shrink-0 ml-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link to="/app/customers/$customerId" params={{ customerId: c.id }}>
                                View Customer
                              </Link>
                            </DropdownMenuItem>
                            {canAssign && (
                              <DropdownMenuItem onClick={() => setAssigningCustomer(c)}>
                                <UserCheck className="mr-2 h-4 w-4" />{" "}
                                {c.assigned_to ? "Reassign Customer" : "Assign Customer"}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => setEditingCustomer(c)}>
                              <Edit className="mr-2 h-4 w-4" /> Edit Details
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                              onClick={() => setDeletingCustomer(c)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Delete Customer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
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
