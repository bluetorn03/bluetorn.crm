import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Users } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { SectionCard } from "@/components/common/SectionCard";
import { DataState } from "@/components/common/DataState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listCustomers, qk } from "@/lib/crm-api";
import { useSession } from "@/hooks/use-session";
import { relativeTime } from "@/lib/format";
import { AddCustomerDialog } from "@/components/crm/AddCustomerDialog";

export const Route = createFileRoute("/app/customers/")({
  head: () => ({
    meta: [
      { title: "Customers · BLUETORN CRM" },
      { name: "description", content: "Every customer, their activity, and who owns the relationship." },
      { property: "og:title", content: "Customers · BLUETORN CRM" },
      { property: "og:description", content: "Every customer and relationship in one place." },
    ],
  }),
  component: CustomersPage,
});

const views = ["All", "Active", "Prospect", "Archived"] as const;

function CustomersPage() {
  const { workspace } = useSession();
  const [view, setView] = useState<(typeof views)[number]>("All");
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const customersQuery = useQuery({
    queryKey: qk.customers(workspace.id),
    queryFn: () => listCustomers(workspace.id),
    enabled: !!workspace.id,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Customers"
        description="Relationships, not records."
        actions={
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Add Customer
          </Button>
        }
      />

      <AddCustomerDialog open={addOpen} onOpenChange={setAddOpen} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="text-muted-foreground absolute top-2.5 left-3 h-4 w-4" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone" className="pl-9" />
        </div>
        <div className="border-border bg-card flex gap-1 rounded-lg border p-1">
          {views.map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors " +
                (view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")
              }
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <DataState query={customersQuery} loadingLabel="Loading customers…">
        {(customers) => {
          const rows = customers.filter(
            (c) =>
              (view === "All" || c.status === view) &&
              (c.name.toLowerCase().includes(q.toLowerCase()) ||
                (c.phone ?? "").includes(q)),
          );

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
                  <li key={c.id}>
                    <Link
                      to="/app/customers/$customerId"
                      params={{ customerId: c.id }}
                      className="hover:bg-accent/50 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 transition-colors sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:px-5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{c.name}</p>
                        <p className="text-muted-foreground truncate text-xs">
                          {c.phone ?? "—"} · {c.type} · {c.city ?? "—"}
                        </p>
                      </div>
                      <p className="text-muted-foreground hidden truncate text-xs sm:block">
                        {c.assigned_to ?? "Unassigned"}
                      </p>
                      <p className="text-muted-foreground hidden truncate text-xs sm:block">
                        {relativeTime(c.updated_at)}
                      </p>
                      <StatusBadge label={c.status} />
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
