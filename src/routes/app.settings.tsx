import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Loader2, Plus, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { createWorkspaceUser, setUserActive, setUserPassword } from "@/lib/admin.functions";
import { useSession } from "@/hooks/use-session";
import { relativeTime } from "@/lib/format";

export const Route = createFileRoute("/app/settings")({
  head: () => ({
    meta: [
      { title: "Settings · BLUETORN CRM" },
      { name: "description", content: "Workspace profile, team roles and account security for your Bluetorn workspace." },
      { property: "og:title", content: "Settings · BLUETORN CRM" },
      { property: "og:description", content: "Workspace profile, team roles and account security." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

type MemberRow = {
  id: string;
  user_code: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  is_active: boolean;
  last_login_at: string | null;
  role: string | null;
};

function SettingsPage() {
  const { workspace, user, role, can, refresh } = useSession();
  const canManageTeam = can("manage.team");
  const canManageSettings = can("manage.settings");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        description={`${workspace.name} · ${workspace.code}`}
      />

      <Tabs defaultValue="workspace">
        <TabsList>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="account">My account</TabsTrigger>
        </TabsList>

        <TabsContent value="workspace" className="mt-4">
          <WorkspaceTab canEdit={canManageSettings} onSaved={refresh} />
        </TabsContent>

        <TabsContent value="team" className="mt-4">
          <TeamTab canManage={canManageTeam} workspaceId={workspace.id} currentUserId={user.id} role={role} />
        </TabsContent>

        <TabsContent value="account" className="mt-4">
          <AccountTab onSaved={refresh} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function WorkspaceTab({ canEdit, onSaved }: { canEdit: boolean; onSaved: () => Promise<void> }) {
  const { workspace } = useSession();
  const [form, setForm] = useState({
    name: workspace.name,
    legalName: "",
    contactEmail: "",
    contactPhone: "",
    address: "",
  });
  const [loaded, setLoaded] = useState(false);

  useQuery({
    queryKey: ["workspace-settings", workspace.id],
    enabled: Boolean(workspace.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspaces")
        .select("name, legal_name, contact_email, contact_phone, address")
        .eq("id", workspace.id)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setForm({
          name: data.name ?? "",
          legalName: data.legal_name ?? "",
          contactEmail: data.contact_email ?? "",
          contactPhone: data.contact_phone ?? "",
          address: data.address ?? "",
        });
        setLoaded(true);
      }
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("workspaces")
        .update({
          name: form.name.trim(),
          legal_name: form.legalName.trim() || null,
          contact_email: form.contactEmail.trim() || null,
          contact_phone: form.contactPhone.trim() || null,
          address: form.address.trim() || null,
        })
        .eq("id", workspace.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Workspace updated");
      await onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <SectionCard title="Workspace profile" description="Shown across invoices, documents and shared links.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Display name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} disabled={!canEdit} />
          <Field label="Legal name" value={form.legalName} onChange={(v) => setForm({ ...form, legalName: v })} disabled={!canEdit} />
          <Field label="Contact email" value={form.contactEmail} onChange={(v) => setForm({ ...form, contactEmail: v })} disabled={!canEdit} />
          <Field label="Contact phone" value={form.contactPhone} onChange={(v) => setForm({ ...form, contactPhone: v })} disabled={!canEdit} />
          <div className="sm:col-span-2">
            <Field label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} disabled={!canEdit} />
          </div>
        </div>
        {canEdit ? (
          <div className="mt-4 flex justify-end">
            <Button size="sm" disabled={!loaded || save.isPending} onClick={() => save.mutate()}>
              {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save changes
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground mt-4 text-xs">Only the workspace Owner can edit these details.</p>
        )}
      </SectionCard>

      <SectionCard title="Plan & region" description="Managed by Bluetorn.">
        <dl className="space-y-3 text-sm">
          <Row label="Workspace code" value={workspace.code} />
          <Row label="Plan" value={workspace.plan} />
          <Row label="Status" value={workspace.status} />
          <Row label="Industry" value={workspace.industry} />
          <Row label="Currency" value={workspace.currency} />
          <Row label="Timezone" value={workspace.timezone} />
          <Row label="Seat limit" value={String(workspace.seatLimit)} />
        </dl>
      </SectionCard>
    </div>
  );
}

function TeamTab({
  canManage,
  workspaceId,
  currentUserId,
}: {
  canManage: boolean;
  workspaceId: string;
  currentUserId: string;
  role: string;
}) {
  const queryClient = useQueryClient();
  const addUser = useServerFn(createWorkspaceUser);
  const toggleActive = useServerFn(setUserActive);
  const resetPassword = useServerFn(setUserPassword);
  const [addOpen, setAddOpen] = useState(false);
  const [resetFor, setResetFor] = useState<MemberRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [form, setForm] = useState({ userCode: "", fullName: "", email: "", phone: "", jobTitle: "", role: "employee", password: "" });

  const members = useQuery({
    queryKey: ["workspace-members", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async (): Promise<MemberRow[]> => {
      const [{ data: profiles, error }, { data: roles }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, user_code, full_name, email, phone, job_title, is_active, last_login_at")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: true }),
        supabase.from("user_roles").select("user_id, role").eq("workspace_id", workspaceId),
      ]);
      if (error) throw error;
      const roleMap = new Map((roles ?? []).map((r) => [r.user_id, r.role as string]));
      return (profiles ?? []).map((p) => ({ ...p, role: roleMap.get(p.id) ?? null }));
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["workspace-members", workspaceId] });

  const create = useMutation({
    mutationFn: () =>
      addUser({
        data: {
          workspaceId,
          userCode: form.userCode,
          fullName: form.fullName,
          ...(form.email ? { email: form.email } : {}),
          ...(form.phone ? { phone: form.phone } : {}),
          ...(form.jobTitle ? { jobTitle: form.jobTitle } : {}),
          role: form.role as "manager" | "employee",
          password: form.password,
        },
      }),
    onSuccess: async () => {
      toast.success("Team member added");
      setAddOpen(false);
      setForm({ userCode: "", fullName: "", email: "", phone: "", jobTitle: "", role: "employee", password: "" });
      await invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activate = useMutation({
    mutationFn: (v: { userId: string; isActive: boolean }) => toggleActive({ data: v }),
    onSuccess: async () => {
      toast.success("User updated");
      await invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reset = useMutation({
    mutationFn: (v: { userId: string; password: string }) => resetPassword({ data: v }),
    onSuccess: () => {
      toast.success("Password updated");
      setResetFor(null);
      setNewPassword("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <SectionCard
      title="Team"
      description="People who can sign in to this workspace with their User ID."
      action={
        canManage ? (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1.5 h-4 w-4" /> Add user
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add team member</DialogTitle>
                <DialogDescription>They sign in with the workspace code, this User ID and the password you set.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="User ID" value={form.userCode} onChange={(v) => setForm({ ...form, userCode: v })} />
                <Field label="Full name" value={form.fullName} onChange={(v) => setForm({ ...form, fullName: v })} />
                <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
                <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
                <Field label="Job title" value={form.jobTitle} onChange={(v) => setForm({ ...form, jobTitle: v })} />
                <div className="space-y-1.5">
                  <Label className="text-xs">Role</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="employee">Employee</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Field
                    label="Temporary password"
                    type="password"
                    value={form.password}
                    onChange={(v) => setForm({ ...form, password: v })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button size="sm" disabled={create.isPending} onClick={() => create.mutate()}>
                  {create.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Create user
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : undefined
      }
      bodyClassName="p-0"
    >
      {members.isLoading ? (
        <p className="text-muted-foreground p-5 text-sm">Loading team…</p>
      ) : (
        <ul className="divide-border divide-y">
          {(members.data ?? []).map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.full_name}
                  {m.id === currentUserId && <span className="text-muted-foreground ml-2 text-xs">you</span>}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {m.user_code} · {m.job_title || "—"} · {m.last_login_at ? `last seen ${relativeTime(m.last_login_at)}` : "never signed in"}
                </p>
              </div>
              <StatusBadge label={m.role ? m.role.replace("_", " ") : "no role"} tone="info" />
              <StatusBadge label={m.is_active ? "Active" : "Disabled"} tone={m.is_active ? "success" : "warning"} />
              {canManage && m.id !== currentUserId && (
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={activate.isPending}
                    onClick={() => activate.mutate({ userId: m.id, isActive: !m.is_active })}
                  >
                    {m.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setResetFor(m)}>
                    <KeyRound className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={Boolean(resetFor)} onOpenChange={(o) => !o && setResetFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>Set a new password for {resetFor?.full_name}.</DialogDescription>
          </DialogHeader>
          <Field label="New password" type="password" value={newPassword} onChange={setNewPassword} />
          <DialogFooter>
            <Button
              size="sm"
              disabled={reset.isPending}
              onClick={() => resetFor && reset.mutate({ userId: resetFor.id, password: newPassword })}
            >
              {reset.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Update password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

function AccountTab({ onSaved }: { onSaved: () => Promise<void> }) {
  const { user, role, workspace } = useSession();
  const [form, setForm] = useState({ fullName: user.name, email: user.email, phone: user.phone, jobTitle: user.jobTitle });
  const [password, setPassword] = useState("");

  const saveProfile = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: form.fullName.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          job_title: form.jobTitle.trim() || null,
        })
        .eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Profile updated");
      await onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const changePassword = useMutation({
    mutationFn: async () => {
      if (password.length < 8) throw new Error("Password must be at least 8 characters.");
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Password changed");
      setPassword("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <SectionCard title="My profile" description="Visible to your workspace team.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" value={form.fullName} onChange={(v) => setForm({ ...form, fullName: v })} />
          <Field label="Job title" value={form.jobTitle} onChange={(v) => setForm({ ...form, jobTitle: v })} />
          <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
          <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
        </div>
        <div className="mt-4 flex justify-end">
          <Button size="sm" disabled={saveProfile.isPending} onClick={() => saveProfile.mutate()}>
            {saveProfile.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save profile
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Security" description="Sign-in identity and password.">
        <dl className="space-y-3 text-sm">
          <Row label="Workspace code" value={workspace.code} />
          <Row label="User ID" value={user.userCode} />
          <Row label="Role" value={role} />
        </dl>
        <div className="mt-4 space-y-3">
          <Field label="New password" type="password" value={password} onChange={setPassword} />
          <Button size="sm" variant="outline" disabled={changePassword.isPending} onClick={() => changePassword.mutate()}>
            <ShieldCheck className="mr-1.5 h-4 w-4" /> Change password
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input type={type} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
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
