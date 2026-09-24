import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus, Users } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { adminGetWorkspace } from "@/lib/admin-queries.functions";
import { createWorkspaceUser, setUserActive, setUserPassword } from "@/lib/admin.functions";
import { formatDate, relativeTime } from "@/lib/format";

export const Route = createFileRoute("/admin/workspaces/$workspaceId")({
  head: () => ({
    meta: [
      { title: "Workspace detail · BLUETORN CRM" },
      { name: "description", content: "Workspace profile, seats, members and recent activity." },
      { property: "og:title", content: "Workspace detail · BLUETORN CRM" },
      {
        property: "og:description",
        content: "Workspace profile, seats, members and recent activity.",
      },
    ],
  }),
  component: AdminWorkspaceDetail,
});

const roleLabel: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  employee: "Employee",
  super_admin: "Super Admin",
};

function AdminWorkspaceDetail() {
  const { workspaceId } = Route.useParams();
  const queryClient = useQueryClient();
  const fetchWorkspace = useServerFn(adminGetWorkspace);
  const addUser = useServerFn(createWorkspaceUser);
  const toggleActive = useServerFn(setUserActive);
  const resetPassword = useServerFn(setUserPassword);

  const { data, isPending, error } = useQuery({
    queryKey: ["admin", "workspace", workspaceId],
    queryFn: () => fetchWorkspace({ data: { workspaceId } }),
  });

  const [form, setForm] = useState({
    userCode: "",
    fullName: "",
    role: "employee" as "owner" | "manager" | "employee",
    email: "",
    phone: "",
    jobTitle: "",
    password: "",
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin"] });

  const createUser = useMutation({
    mutationFn: () => addUser({ data: { workspaceId, ...form } }),
    onSuccess: async (r) => {
      toast.success(`User ${r.userCode} added`, {
        description: `Signs in as ${r.workspaceCode} / ${r.userCode}.`,
      });
      setForm({
        userCode: "",
        fullName: "",
        role: "employee",
        email: "",
        phone: "",
        jobTitle: "",
        password: "",
      });
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activeMutation = useMutation({
    mutationFn: (vars: { userId: string; isActive: boolean }) => toggleActive({ data: vars }),
    onSuccess: async () => {
      toast.success("Access updated");
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const passwordMutation = useMutation({
    mutationFn: (vars: { userId: string; password: string }) => resetPassword({ data: vars }),
    onSuccess: () => toast.success("Password updated"),
    onError: (e: Error) => toast.error(e.message),
  });

  if (error) {
    return (
      <SectionCard title="Could not load workspace">
        <p className="text-destructive text-sm">{(error as Error).message}</p>
      </SectionCard>
    );
  }

  if (isPending || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const { workspace, members, activity } = data;

  return (
    <div className="space-y-5">
      <Link
        to="/admin/workspaces"
        className="text-muted-foreground inline-flex items-center gap-1.5 text-xs hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All workspaces
      </Link>

      <PageHeader
        title={workspace.name}
        description={`${workspace.code} · ${workspace.plan} plan · ${workspace.industry}`}
        actions={
          <StatusBadge
            label={workspace.status.charAt(0).toUpperCase() + workspace.status.slice(1)}
          />
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Profile" className="lg:col-span-1">
          <dl className="space-y-2.5 text-sm">
            <Row label="Legal name" value={workspace.legalName ?? "—"} />
            <Row label="Currency" value={workspace.currency} />
            <Row label="Timezone" value={workspace.timezone} />
            <Row label="Seats" value={`${members.length} / ${workspace.seatLimit}`} />
            <Row label="Contact" value={workspace.contactEmail ?? workspace.contactPhone ?? "—"} />
            <Row label="Created" value={formatDate(workspace.createdAt)} />
          </dl>
        </SectionCard>

        <SectionCard
          title="Members"
          description="Roles and access inside this workspace."
          className="lg:col-span-2"
          bodyClassName="p-0"
        >
          {members.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={Users}
                title="No members yet"
                description="Add the first team member below."
              />
            </div>
          ) : (
            <ul className="divide-border divide-y">
              {members.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.fullName}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {m.userCode} · {roleLabel[m.role ?? ""] ?? "No role"}
                      {m.lastLoginAt
                        ? ` · seen ${relativeTime(m.lastLoginAt)}`
                        : " · never signed in"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge label={m.isActive ? "Active" : "Inactive"} />
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={activeMutation.isPending}
                      onClick={() => activeMutation.mutate({ userId: m.id, isActive: !m.isActive })}
                    >
                      {m.isActive ? "Deactivate" : "Activate"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={passwordMutation.isPending}
                      onClick={() => {
                        const pwd = window.prompt(
                          `New password for ${m.userCode} (min 8 characters)`,
                        );
                        if (pwd) passwordMutation.mutate({ userId: m.id, password: pwd });
                      }}
                    >
                      Reset password
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Add user" description="Creates the sign-in as workspace code + user ID.">
        <form
          className="grid gap-4 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            createUser.mutate();
          }}
        >
          <Field label="User ID">
            <Input
              value={form.userCode}
              onChange={(e) => setForm((f) => ({ ...f, userCode: e.target.value.toLowerCase() }))}
              placeholder="priya.nair"
              required
            />
          </Field>
          <Field label="Full name">
            <Input
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              required
            />
          </Field>
          <Field label="Role">
            <Select
              value={form.role}
              onValueChange={(v) => setForm((f) => ({ ...f, role: v as typeof f.role }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">Employee</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Job title">
            <Input
              value={form.jobTitle}
              onChange={(e) => setForm((f) => ({ ...f, jobTitle: e.target.value }))}
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </Field>
          <Field label="Phone">
            <Input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </Field>
          <Field label="Temporary password">
            <Input
              type="password"
              minLength={8}
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              required
            />
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={createUser.isPending}>
              {createUser.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-1.5 h-4 w-4" />
              )}
              Add user
            </Button>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Recent activity" description="Audit entries scoped to this workspace.">
        {activity.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing logged yet.</p>
        ) : (
          <ul className="divide-border divide-y">
            {activity.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{a.action}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {a.entityType ?? "workspace"}
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="truncate text-sm font-medium">{value}</dd>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
    </div>
  );
}
