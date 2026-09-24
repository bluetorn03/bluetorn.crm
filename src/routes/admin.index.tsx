import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building, FileClock, Plus, ShieldCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { MetricCard } from "@/components/common/MetricCard";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { adminPlatformStats } from "@/lib/admin-queries.functions";
import { relativeTime } from "@/lib/format";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Super Admin · BLUETORN CRM" },
      { name: "description", content: "Platform overview across all workspaces." },
      { property: "og:title", content: "Super Admin · BLUETORN CRM" },
      { property: "og:description", content: "Platform overview across all workspaces." },
    ],
  }),
  component: AdminHome,
});

function AdminHome() {
  const fetchStats = useServerFn(adminPlatformStats);
  const { data, isPending, error } = useQuery({
    queryKey: ["admin", "platform-stats"],
    queryFn: () => fetchStats(),
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Super Admin"
        description="Platform overview across all workspaces."
        actions={
          <Button size="sm" asChild>
            <Link to="/admin/workspaces/new">
              <Plus className="mr-1.5 h-4 w-4" /> New workspace
            </Link>
          </Button>
        }
      />

      {error && (
        <SectionCard title="Could not load platform data">
          <p className="text-destructive text-sm">{(error as Error).message}</p>
        </SectionCard>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {isPending ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[124px] rounded-xl" />
          ))
        ) : (
          <>
            <MetricCard
              label="Workspaces"
              value={String(data?.workspaces ?? 0)}
              hint={`${data?.activeWorkspaces ?? 0} active`}
              icon={Building}
              to="/admin/workspaces"
            />
            <MetricCard
              label="Users"
              value={String(data?.users ?? 0)}
              hint={`${data?.activeUsers ?? 0} enabled`}
              icon={Users}
              to="/admin/users"
            />
            <MetricCard
              label="Suspended / trial"
              value={String((data?.workspaces ?? 0) - (data?.activeWorkspaces ?? 0))}
              hint="Needs review"
              icon={ShieldCheck}
            />
            <MetricCard
              label="Recent events"
              value={String(data?.recentActivity.length ?? 0)}
              hint="Last audit entries"
              icon={FileClock}
              to="/admin/audit"
            />
          </>
        )}
      </div>

      <SectionCard title="Latest platform activity" description="Straight from the audit trail.">
        {isPending ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded-lg" />
            ))}
          </div>
        ) : (data?.recentActivity.length ?? 0) === 0 ? (
          <EmptyState
            icon={FileClock}
            title="Nothing logged yet"
            description="Workspace and user changes will appear here as soon as they happen."
          />
        ) : (
          <ul className="divide-border divide-y">
            {data!.recentActivity.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{a.action}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {a.actorLabel ?? "System"} · {a.entityType ?? "platform"}
                  </p>
                </div>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {relativeTime(a.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
