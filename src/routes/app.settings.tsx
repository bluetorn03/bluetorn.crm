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
import { createWorkspaceUser, setUserActive, setUserPassword } from "@/lib/admin.functions";
import {
  getWorkspaceSettingsFn,
  updateWorkspaceSettingsFn,
  getWorkspaceMembersFn,
  updateSelfProfileFn,
  changeSelfPasswordFn,
  type WorkspaceMemberItem,
} from "@/lib/settings.functions";
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

type MemberRow = WorkspaceMemberItem;

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
  const getSettings = useServerFn(getWorkspaceSettingsFn);
  const updateSettings = useServerFn(updateWorkspaceSettingsFn);

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
      const data = await getSettings({ data: { workspaceId: workspace.id } });
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
      await updateSettings({
        data: {
          workspaceId: workspace.id,
          patch: {
            name: form.name.trim(),
            legalName: form.legalName.trim() || null,
            contactEmail: form.contactEmail.trim() || null,
            contactPhone: form.contactPhone.trim() || null,
            address: form.address.trim() || null,
          },
        },
      });
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
  const getMembers = useServerFn(getWorkspaceMembersFn);
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
    queryFn: () => getMembers({ data: { workspaceId } }),
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
    mutationFn: () =>
      resetPassword({
        data: { userId: resetFor?.id ?? "", password: newPassword },
      }),
    onSuccess: () => {
      toast.success("Password reset");
      setResetFor(null);
      setNewPassword("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = members.data ?? [];

  return (
    <SectionCard
      title="Team members"
      description="Everyone with access to this workspace."
      action={
        canManage && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1.5 h-4 w-4" /> Add user
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add team member</DialogTitle>
                <DialogDescription>Create login credentials for a new teammate.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 py-2">
                <Field label="Full name *" value={form.fullName} onChange={(v) => setForm({ ...form, fullName: v })} />
                <Field label="User ID (login) *" value={form.userCode} onChange={(v) => setForm({ ...form, userCode: v })} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
                  <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
                </div>
                <Field label="Job title" value={form.jobTitle} onChange={(v) => setForm({ ...form, jobTitle: v })} />
                <div>
                  <Label className="text-xs">Role</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="employee">Employee</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Field label="Temporary password *" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                <Button disabled={!form.fullName || !form.userCode || form.password.length < 8 || create.isPending} onClick={() => create.mutate()}>
                  {create.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Create user
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )
      }
      bodyClassName="p-0"
    >
      <div className="divide-border divide-y">
        {list.map((m) => {
          const isSelf = m.id === currentUserId;
          const isOwner = m.role === "owner";
          return (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-foreground text-sm font-medium">{m.full_name}</p>
                  <StatusBadge label={m.role ?? "employee"} />
                  {!m.is_active && <StatusBadge label="inactive" tone="danger" />}
                </div>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  User ID: <code className="bg-muted text-foreground rounded px-1">{m.user_code}</code>
                  {m.job_title ? ` · ${m.job_title}` : ""}
                  {m.email ? ` · ${m.email}` : ""}
                  {m.last_login_at ? ` · Last login ${relativeTime(m.last_login_at)}` : ""}
                </p>
              </div>

              {canManage && !isOwner && !isSelf && (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setResetFor(m)}
                  >
                    <KeyRound className="mr-1.5 h-3.5 w-3.5" /> Reset password
                  </Button>

                  {m.is_active ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={activate.isPending}
                      onClick={() => activate.mutate({ userId: m.id, isActive: false })}
                    >
                      <UserX className="mr-1.5 h-3.5 w-3.5" /> Deactivate
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={activate.isPending}
                      onClick={() => activate.mutate({ userId: m.id, isActive: true })}
                    >
                      <UserCheck className="mr-1.5 h-3.5 w-3.5" /> Reactivate
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Reset password dialog */}
      <Dialog open={Boolean(resetFor)} onOpenChange={(o) => !o && setResetFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Set a new password for <span className="font-medium text-foreground">{resetFor?.full_name}</span> (User ID: {resetFor?.user_code}).
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Field
              label="New password (min 8 chars)"
              type="password"
              value={newPassword}
              onChange={setNewPassword}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetFor(null)}>
              Cancel
            </Button>
            <Button
              disabled={newPassword.length < 8 || reset.isPending}
              onClick={() => reset.mutate()}
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
  const updateProfile = useServerFn(updateSelfProfileFn);
  const changePasswordFn = useServerFn(changeSelfPasswordFn);

  const [form, setForm] = useState({
    fullName: user.name,
    email: user.email,
    phone: user.phone,
    whatsappPhone: user.whatsappPhone,
    jobTitle: user.jobTitle,
  });
  const [password, setPassword] = useState("");

  const saveProfile = useMutation({
    mutationFn: async () => {
      // Validate email format if provided
      if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
        throw new Error("Please enter a valid email address.");
      }
      await updateProfile({
        data: {
          fullName: form.fullName.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          whatsappPhone: form.whatsappPhone.trim() || null,
          jobTitle: form.jobTitle.trim() || null,
        },
      });
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
      await changePasswordFn({ data: { password } });
    },
    onSuccess: () => {
      toast.success("Password changed");
      setPassword("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
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
            <Button
              size="sm"
              disabled={password.length < 8 || changePassword.isPending}
              onClick={() => changePassword.mutate()}
            >
              {changePassword.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Change password
            </Button>
          </div>
        </SectionCard>
      </div>

      {/* Communication Settings */}
      <SectionCard
        title="Communication settings"
        description="WhatsApp and email settings used for lead communication."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <Label className="text-xs text-muted-foreground">Calling Phone</Label>
            <p className="mt-1 text-sm font-semibold text-foreground truncate">
              {form.phone || <span className="text-muted-foreground font-normal">Not configured</span>}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Uses your profile phone number. Edit in My Profile above.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <Label className="text-xs text-muted-foreground">Sender Email</Label>
            <p className="mt-1 text-sm font-semibold text-foreground truncate">
              {form.email || <span className="text-muted-foreground font-normal">Not configured</span>}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Uses your profile email. Edit in My Profile above.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-3">
            <Label className="text-xs font-medium">WhatsApp Number *</Label>
            <Input
              value={form.whatsappPhone}
              onChange={(e) => setForm({ ...form, whatsappPhone: e.target.value })}
              placeholder="+91 7304810459"
              className="mt-1.5 h-9 text-sm"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Your registered WhatsApp number for messaging leads.
            </p>
          </div>
        </div>

        <div className="mt-4 flex justify-end pt-3 border-t border-border">
          <Button size="sm" disabled={saveProfile.isPending} onClick={() => saveProfile.mutate()}>
            {saveProfile.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save WhatsApp Number
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
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="mt-1"
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground font-medium">{value || "—"}</dd>
    </div>
  );
}
