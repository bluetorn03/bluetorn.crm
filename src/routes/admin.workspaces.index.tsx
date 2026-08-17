import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { adminListWorkspaces } from "@/lib/admin-queries.functions";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/admin/workspaces/")({
  head: () => ({
    meta: [
      { title: "Workspaces · BLUETORN CRM" },
      { name: "description", content: "Every tenant workspace, its plan, seats and status." },
      { property: "og:title", content: "Workspaces · BLUETORN CRM" },
      { property: "og:description", content: "Every tenant workspace, its plan, seats and status." },
    ],
  }),
  component: AdminWorkspaces,
});

const statusLabel: Record<string, string> = {
  active: "Active",
  trial: "Trial",
  suspended: "Suspended",
  inactive: "Inactive",
};

function AdminWorkspaces() {
  const [q, setQ] = useState("");
  const fetchWorkspaces = useServerFn(adminListWorkspaces);
  const { data, isPending, error } = useQuery({
    queryKey: ["admin", "workspaces"],
    queryFn: () => fetchWorkspaces(),
  });

  const rows = (data ?? []).filter(
    (w) =>
      w.name.toLowerCase().includes(q.toLowerCase()) || w.code.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Workspaces"
        description="Every tenant workspace, its plan, seats and status."
        actions={
          <Button size="sm" asChild>
            <Link to="/admin/workspaces/new">
              <Plus className="mr-1.5 h-4 w-4" /> New workspace
            </Link>
          </Button>
        }
      />

      <div className="relative min-w-0 sm:max-w-xs">
        <Search className="text-muted-foreground absolute top-2.5 left-3 h-4 w-4" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or code" className="pl-9" />
      </div>

      {error ? (
        <SectionCard title="Could not load workspaces">
          <p className="text-destructive text-sm">{(error as Error).message}</p>
        </SectionCard>
      ) : isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Building}
          title="No workspaces yet"
          description="Create the first tenant workspace and its Owner account to get started."
          action={
            <Button size="sm" asChild>
              <Link to="/admin/workspaces/new">Create workspace</Link>
            </Button>
          }
        />
      ) : (
        <SectionCard bodyClassName="p-0">
          <ul className="divide-border divide-y">
            {rows.map((w) => (
              <li key={w.id}>
                <Link
                  to="/admin/workspaces/$workspaceId"
                  params={{ workspaceId: w.id }}
                  className="hover:bg-accent/50 flex items-center justify-between gap-4 px-4 py-3.5 transition-colors sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{w.name}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {w.code} · {w.plan} · {w.industry} · since {formatDate(w.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-muted-foreground hidden text-xs sm:block">
                      {w.seatsUsed}/{w.seatLimit} seats
                    </span>
                    <StatusBadge label={statusLabel[w.status] ?? w.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
