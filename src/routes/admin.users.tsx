import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Users } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { adminListUsers } from "@/lib/admin-queries.functions";
import { relativeTime } from "@/lib/format";

export const Route = createFileRoute("/admin/users")({
  head: () => ({
    meta: [
      { title: "Users · BLUETORN CRM" },
      { name: "description", content: "All users across workspaces with roles and access." },
      { property: "og:title", content: "Users · BLUETORN CRM" },
      { property: "og:description", content: "All users across workspaces with roles and access." },
    ],
  }),
  component: AdminUsers,
});

const roleLabel: Record<string, string> = {
  super_admin: "Super Admin",
  owner: "Owner",
  manager: "Manager",
  employee: "Employee",
};

function AdminUsers() {
  const [q, setQ] = useState("");
  const fetchUsers = useServerFn(adminListUsers);
  const { data, isPending, error } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => fetchUsers({ data: {} }),
  });

  const rows = useMemo(
    () =>
      (data ?? []).filter((u) => {
        const t = q.toLowerCase();
        return (
          u.fullName.toLowerCase().includes(t) ||
          u.userCode.includes(t) ||
          u.workspaceCode.toLowerCase().includes(t)
        );
      }),
    [data, q],
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Users" description="All users across workspaces with roles and access." />

      <div className="relative min-w-0 sm:max-w-xs">
        <Search className="text-muted-foreground absolute top-2.5 left-3 h-4 w-4" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, user ID or workspace"
          className="pl-9"
        />
      </div>

      {error ? (
        <SectionCard title="Could not load users">
          <p className="text-destructive text-sm">{(error as Error).message}</p>
        </SectionCard>
      ) : isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No users found"
          description="Users appear here once workspaces and their teams are created."
        />
      ) : (
        <SectionCard bodyClassName="p-0">
          <ul className="divide-border divide-y">
            {rows.map((u) => (
              <li
                key={u.id}
                className="flex items-center justify-between gap-4 px-4 py-3.5 sm:px-5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{u.fullName}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {u.workspaceCode} / {u.userCode}
                    {u.jobTitle ? ` · ${u.jobTitle}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-muted-foreground hidden text-xs sm:block">
                    {u.lastLoginAt ? `Seen ${relativeTime(u.lastLoginAt)}` : "Never signed in"}
                  </span>
                  <span className="text-muted-foreground hidden text-xs md:block">
                    {roleLabel[u.role ?? ""] ?? "No role"}
                  </span>
                  <StatusBadge label={u.isActive ? "Active" : "Inactive"} />
                  {u.workspaceId && (
                    <Link
                      to="/admin/workspaces/$workspaceId"
                      params={{ workspaceId: u.workspaceId }}
                      className="text-primary text-xs font-medium hover:underline"
                    >
                      Workspace
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
