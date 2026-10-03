import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Building2,
  Eye,
  EyeOff,
  FileText,
  HardDrive,
  KeyRound,
  Landmark,
  LayoutDashboard,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import { runWorkspaceCleanup, getWorkspaceStorageUsage } from "@/lib/crm-api";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ImageUpload } from "@/components/common/ImageUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createWorkspaceUser, setUserActive, setUserPassword } from "@/lib/admin.functions";
import {
  getWorkspaceSettingsFn,
  updateWorkspaceSettingsFn,
  getWorkspaceMembersFn,
  getUserPermissionsFn,
  setUserPermissionsFn,
  updateWorkspaceEmployeeFn,
  updateSelfProfileFn,
  changeSelfPasswordFn,
  type WorkspaceMemberItem,
} from "@/lib/settings.functions";
import { startViewAsEmployeeFn } from "@/lib/auth.functions";
import { useSession } from "@/hooks/use-session";
import { relativeTime } from "@/lib/format";

export const Route = createFileRoute("/app/settings")({
  head: () => ({
    meta: [
      { title: "Settings · BLUETORN CRM" },
      {
        name: "description",
        content: "Workspace profile, team roles and account security for your Bluetorn workspace.",
      },
      { property: "og:title", content: "Settings · BLUETORN CRM" },
      {
        property: "og:description",
        content: "Workspace profile, team roles and account security.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

type MemberRow = WorkspaceMemberItem;

function SettingsPage() {
  const { workspace, user, role, can, refresh, isViewingAs } = useSession();
  const isOwner = role === "Owner" || role === "Super Admin";
  const canManageTeam = can("manage.team") && isOwner && !isViewingAs;
  const canManageSettings = can("manage.settings") && !isViewingAs;

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" description={`${workspace.name} · ${workspace.code}`} />

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
          <TeamTab
            canManage={canManageTeam}
            workspaceId={workspace.id}
            currentUserId={user.id}
            role={role}
          />
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
    website: "",
    logoUrl: "",
    address: "",
    gstin: "",
    pan: "",
    state: "",
    stateCode: "",
    bankName: "",
    bankAccountNo: "",
    bankAccountName: "",
    bankIfsc: "",
    invoicePrefix: "INV",
    defaultPaymentTermsDays: 14,
    defaultInvoiceNotes: "",
    defaultInvoiceTerms: "",
  });
  const queryClient = useQueryClient();
  const [retentionDays, setRetentionDays] = useState(15);
  const [auditRetentionDays, setAuditRetentionDays] = useState(180);
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
          website: data.website ?? "",
          logoUrl: data.logo_url ?? "",
          address: data.address ?? "",
          gstin: data.gstin ?? "",
          pan: data.pan ?? "",
          state: data.state ?? "",
          stateCode: data.state_code ?? "",
          bankName: data.bank_name ?? "",
          bankAccountNo: data.bank_account_no ?? "",
          bankAccountName: data.bank_account_name ?? "",
          bankIfsc: data.bank_ifsc ?? "",
          invoicePrefix: data.invoice_prefix ?? "INV",
          defaultPaymentTermsDays: data.default_payment_terms_days ?? 14,
          defaultInvoiceNotes: data.default_invoice_notes ?? "",
          defaultInvoiceTerms: data.default_invoice_terms ?? "",
        });
        if (data.chat_retention_days) {
          setRetentionDays(data.chat_retention_days);
        }
        if (data.audit_retention_days) {
          setAuditRetentionDays(data.audit_retention_days);
        }
        setLoaded(true);
      }
      return data;
    },
  });

  const storageQuery = useQuery({
    queryKey: ["workspace-storage-usage", workspace.id],
    queryFn: () => getWorkspaceStorageUsage(),
    enabled: Boolean(workspace.id),
  });

  const cleanupMutation = useMutation({
    mutationFn: () => runWorkspaceCleanup(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["workspace-storage-usage", workspace.id] });
      queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      const total =
        res.chatMessagesDeleted +
        res.auditLogsPurged +
        res.readNotificationsPurged +
        res.unreadNotificationsPurged +
        res.orphanedFilesCleaned;
      toast.success(
        `Maintenance cleanup completed! Purged ${total} expired records (${res.auditLogsPurged} audit logs, ${res.readNotificationsPurged} read notifications, ${res.unreadNotificationsPurged} unread notifications, ${res.chatMessagesDeleted} chat messages).`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
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
            website: form.website.trim() || null,
            logoUrl: form.logoUrl.trim() || null,
            address: form.address.trim() || null,
            gstin: form.gstin.trim() || null,
            pan: form.pan.trim() || null,
            state: form.state.trim() || null,
            stateCode: form.stateCode.trim() || null,
            bankName: form.bankName.trim() || null,
            bankAccountNo: form.bankAccountNo.trim() || null,
            bankAccountName: form.bankAccountName.trim() || null,
            bankIfsc: form.bankIfsc.trim() || null,
            invoicePrefix: form.invoicePrefix.trim() || "INV",
            defaultPaymentTermsDays: Number(form.defaultPaymentTermsDays) || 14,
            defaultInvoiceNotes: form.defaultInvoiceNotes.trim() || null,
            defaultInvoiceTerms: form.defaultInvoiceTerms.trim() || null,
            auditRetentionDays: Number(auditRetentionDays),
          },
        },
      });
    },
    onSuccess: async () => {
      toast.success("Workspace company profile and billing settings updated");
      await onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        {/* Company Identity */}
        <SectionCard
          title="Company & Billing Profile"
          description="Your business identity. Automatically loaded into invoices, previews, and PDF documents."
        >
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Workspace Display Name *"
                value={form.name}
                onChange={(v) => setForm({ ...form, name: v })}
                disabled={!canEdit}
              />
              <Field
                label="Legal Registered Business Name"
                value={form.legalName}
                onChange={(v) => setForm({ ...form, legalName: v })}
                disabled={!canEdit}
              />
              <div className="sm:col-span-2">
                <ImageUpload
                  value={form.logoUrl}
                  onChange={(url) => setForm({ ...form, logoUrl: url })}
                  workspaceId={workspace.id}
                  label="Company Logo"
                  hint="Upload company logo (JPG, PNG, WebP) or enter an image URL. Automatically loaded into invoice headers, receipts, and PDF documents."
                  disabled={!canEdit}
                  previewHeight="h-28"
                />
              </div>
              <Field
                label="Contact Email"
                value={form.contactEmail}
                onChange={(v) => setForm({ ...form, contactEmail: v })}
                disabled={!canEdit}
              />
              <Field
                label="Contact Phone"
                value={form.contactPhone}
                onChange={(v) => setForm({ ...form, contactPhone: v })}
                disabled={!canEdit}
              />
              <div className="sm:col-span-2">
                <Field
                  label="Website URL"
                  value={form.website}
                  onChange={(v) => setForm({ ...form, website: v })}
                  disabled={!canEdit}
                />
              </div>
              <div className="sm:col-span-2">
                <div>
                  <Label className="text-xs">Registered Business Address</Label>
                  <Textarea
                    rows={2}
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    disabled={!canEdit}
                    className="mt-1"
                    placeholder="Street, City, Pincode"
                  />
                </div>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* GST & Statutory Profile */}
        <SectionCard
          title="Tax & GST Registration"
          description="GSTIN, PAN and state jurisdiction used for GST calculation and tax invoice compliance."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="GSTIN (15 characters)"
              value={form.gstin}
              onChange={(v) => setForm({ ...form, gstin: v.toUpperCase() })}
              disabled={!canEdit}
            />
            <Field
              label="PAN (10 characters)"
              value={form.pan}
              onChange={(v) => setForm({ ...form, pan: v.toUpperCase() })}
              disabled={!canEdit}
            />
            <Field
              label="State / Province"
              value={form.state}
              onChange={(v) => setForm({ ...form, state: v })}
              disabled={!canEdit}
            />
            <Field
              label="State Code (e.g. 27 for Maharashtra)"
              value={form.stateCode}
              onChange={(v) => setForm({ ...form, stateCode: v })}
              disabled={!canEdit}
            />
          </div>
        </SectionCard>

        {/* Bank & Settlement Details */}
        <SectionCard
          title="Bank & Settlement Details"
          description="Account details displayed on invoices for client direct wire/NEFT/RTGS payments."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Bank Name"
              value={form.bankName}
              onChange={(v) => setForm({ ...form, bankName: v })}
              disabled={!canEdit}
            />
            <Field
              label="Account Holder Name"
              value={form.bankAccountName}
              onChange={(v) => setForm({ ...form, bankAccountName: v })}
              disabled={!canEdit}
            />
            <Field
              label="Account Number"
              value={form.bankAccountNo}
              onChange={(v) => setForm({ ...form, bankAccountNo: v })}
              disabled={!canEdit}
            />
            <Field
              label="IFSC Code"
              value={form.bankIfsc}
              onChange={(v) => setForm({ ...form, bankIfsc: v.toUpperCase() })}
              disabled={!canEdit}
            />
          </div>
        </SectionCard>

        {/* Invoicing Preferences */}
        <SectionCard
          title="Invoice & Payment Defaults"
          description="Default terms, notes and numbering prefix applied when creating new invoices."
        >
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Invoice Prefix (e.g. INV)"
                value={form.invoicePrefix}
                onChange={(v) => setForm({ ...form, invoicePrefix: v.toUpperCase() })}
                disabled={!canEdit}
              />
              <Field
                label="Default Payment Terms (Days)"
                type="number"
                value={String(form.defaultPaymentTermsDays)}
                onChange={(v) => setForm({ ...form, defaultPaymentTermsDays: Number(v) || 0 })}
                disabled={!canEdit}
              />
            </div>
            <div>
              <Label className="text-xs">Default Invoice Notes</Label>
              <Textarea
                rows={2}
                value={form.defaultInvoiceNotes}
                onChange={(e) => setForm({ ...form, defaultInvoiceNotes: e.target.value })}
                disabled={!canEdit}
                className="mt-1"
                placeholder="Thank you for your business."
              />
            </div>
            <div>
              <Label className="text-xs">Default Terms & Conditions</Label>
              <Textarea
                rows={2}
                value={form.defaultInvoiceTerms}
                onChange={(e) => setForm({ ...form, defaultInvoiceTerms: e.target.value })}
                disabled={!canEdit}
                className="mt-1"
                placeholder="1. Payment is due within the stipulated days. 2. Please quote invoice number during wire transfer."
              />
            </div>
          </div>
          {canEdit ? (
            <div className="mt-5 flex justify-end">
              <Button size="sm" disabled={!loaded || save.isPending} onClick={() => save.mutate()}>
                {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save
                workspace profile
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground mt-4 text-xs">
              Only the workspace Owner can edit these details.
            </p>
          )}
        </SectionCard>
      </div>

      <div className="space-y-4">
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

        <SectionCard
          title="Data Retention & Storage"
          description="Workspace automated data lifecycle, storage measurement, and maintenance cleanup."
        >
          <div className="space-y-4">
            {/* Audit Log Retention */}
            <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Audit Log Retention</span>
                <Select
                  value={String(auditRetentionDays)}
                  onValueChange={(val) => setAuditRetentionDays(Number(val))}
                  disabled={!canEdit}
                >
                  <SelectTrigger className="h-8 w-36 text-xs font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="90">90 Days</SelectItem>
                    <SelectItem value="180">180 Days (Default)</SelectItem>
                    <SelectItem value="365">365 Days (1 Year)</SelectItem>
                    <SelectItem value="730">730 Days (2 Years)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Security and operational audit events older than {auditRetentionDays} days are automatically purged.
              </p>
            </div>

            {/* Chat Retention */}
            <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Team Chat Retention</span>
                <StatusBadge label={`${retentionDays} Days`} tone="brand" />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Team Chat messages and transient attachments are retained for {retentionDays} days.
              </p>
            </div>

            {/* Notification Retention */}
            <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Notification Retention</span>
                <span className="text-xs font-mono text-muted-foreground">Read: 30d / Unread: 90d</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Read user notifications are automatically cleared after 30 days; unread after 90 days.
              </p>
            </div>

            {/* Storage Usage Summary */}
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <HardDrive className="h-4 w-4 text-primary" />
                  Workspace Storage Breakdown
                </span>
                <span className="text-xs font-semibold text-foreground">
                  {storageQuery.data?.estimatedStorageFormatted ?? "Calculating..."}
                </span>
              </div>
              {storageQuery.data && (
                <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] text-muted-foreground">
                  <div>Property Media: <strong className="text-foreground">{storageQuery.data.propertyMediaCount}</strong> files</div>
                  <div>Chat Messages: <strong className="text-foreground">{storageQuery.data.chatMessageCount}</strong> messages</div>
                  <div>Audit Events: <strong className="text-foreground">{storageQuery.data.auditLogCount}</strong> records</div>
                  <div>Notifications: <strong className="text-foreground">{storageQuery.data.notificationCount}</strong> records</div>
                </div>
              )}
            </div>

            {/* Manual Maintenance Run */}
            {canEdit && (
              <div className="pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs gap-1.5 h-8"
                  onClick={() => cleanupMutation.mutate()}
                  disabled={cleanupMutation.isPending}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${cleanupMutation.isPending ? "animate-spin" : ""}`} />
                  {cleanupMutation.isPending ? "Running Maintenance Cleanup..." : "Run Scheduled Retention Cleanup Now"}
                </Button>
              </div>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function TeamTab({
  canManage,
  workspaceId,
  currentUserId,
  role,
}: {
  canManage: boolean;
  workspaceId: string;
  currentUserId: string;
  role: string;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { refresh } = useSession();
  const getMembers = useServerFn(getWorkspaceMembersFn);
  const addUser = useServerFn(createWorkspaceUser);
  const toggleActive = useServerFn(setUserActive);
  const resetPassword = useServerFn(setUserPassword);
  const startViewAs = useServerFn(startViewAsEmployeeFn);

  const [addOpen, setAddOpen] = useState(false);
  const [editFor, setEditFor] = useState<MemberRow | null>(null);
  const [resetFor, setResetFor] = useState<MemberRow | null>(null);
  const [permissionsFor, setPermissionsFor] = useState<MemberRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [viewAsLoadingId, setViewAsLoadingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    userCode: "",
    fullName: "",
    email: "",
    phone: "",
    jobTitle: "",
    role: "employee",
    password: "",
  });

  const members = useQuery({
    queryKey: ["workspace-members", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: () => getMembers({ data: { workspaceId } }),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["workspace-members", workspaceId] });

  const isAddUserCodeValid = /^[a-z0-9][a-z0-9._-]{1,30}$/.test(form.userCode);
  const isAddEmailValid = !form.email || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim());

  const handleOpenAdd = () => {
    setForm({
      userCode: "",
      fullName: "",
      email: "",
      phone: "",
      jobTitle: "",
      role: "employee",
      password: "",
    });
    setShowPassword(false);
    setAddOpen(true);
  };

  const create = useMutation({
    mutationFn: () =>
      addUser({
        data: {
          workspaceId,
          userCode: form.userCode,
          fullName: form.fullName.trim(),
          ...(form.email?.trim() ? { email: form.email.trim() } : {}),
          ...(form.phone?.trim() ? { phone: form.phone.trim() } : {}),
          ...(form.jobTitle?.trim() ? { jobTitle: form.jobTitle.trim() } : {}),
          role: form.role as "manager" | "employee",
          password: form.password,
        },
      }),
    onSuccess: async () => {
      toast.success("Team member added");
      setAddOpen(false);
      setForm({
        userCode: "",
        fullName: "",
        email: "",
        phone: "",
        jobTitle: "",
        role: "employee",
        password: "",
      });
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

  const handleViewDashboard = async (m: MemberRow) => {
    try {
      setViewAsLoadingId(m.id);
      await startViewAs({ data: { employeeId: m.id } });
      await queryClient.cancelQueries();
      queryClient.clear();
      await refresh();
      toast.success(`Viewing as: ${m.full_name} — Owner Preview`);
      navigate({ to: "/app" });
    } catch (e: any) {
      toast.error(e.message || "Failed to start employee view");
    } finally {
      setViewAsLoadingId(null);
    }
  };

  const list = members.data ?? [];

  return (
    <SectionCard
      title="Team members"
      description="Everyone with access to this workspace."
      action={
        canManage && (
          <Dialog open={addOpen} onOpenChange={(open) => (open ? handleOpenAdd() : setAddOpen(false))}>
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
                <Field
                  label="Full name *"
                  value={form.fullName}
                  onChange={(v) => setForm({ ...form, fullName: v })}
                />
                <div>
                  <Label className="text-xs">User ID (login) *</Label>
                  <Input
                    value={form.userCode}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        userCode: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""),
                      })
                    }
                    placeholder="e.g. rohit.sharma"
                    className="mt-1 font-mono text-xs"
                  />
                  <p className="text-muted-foreground mt-1 text-[11px]">
                    2-31 lowercase letters, numbers, dot, dash, or underscore.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Field
                      label="Email"
                      type="email"
                      value={form.email}
                      onChange={(v) => setForm({ ...form, email: v })}
                    />
                    {!isAddEmailValid && (
                      <p className="mt-1 text-[11px] text-destructive">Invalid email format.</p>
                    )}
                  </div>
                  <Field
                    label="Phone"
                    value={form.phone}
                    onChange={(v) => setForm({ ...form, phone: v })}
                  />
                </div>
                <Field
                  label="Job title"
                  value={form.jobTitle}
                  onChange={(v) => setForm({ ...form, jobTitle: v })}
                />
                <div>
                  <Label className="text-xs">Role</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="employee">Employee</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Temporary password * (min 8 chars)</Label>
                  <div className="relative mt-1">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder="••••••••"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-muted-foreground hover:text-foreground absolute right-2.5 top-1/2 -translate-y-1/2 p-1"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddOpen(false)}>
                  Cancel
                </Button>
                <Button
                  disabled={
                    !form.fullName.trim() ||
                    !isAddUserCodeValid ||
                    !isAddEmailValid ||
                    form.password.length < 8 ||
                    create.isPending
                  }
                  onClick={() => create.mutate()}
                >
                  {create.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Create
                  user
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
                  User ID:{" "}
                  <code className="bg-muted text-foreground rounded px-1 font-mono">{m.user_code}</code>
                  {m.job_title ? ` · ${m.job_title}` : ""}
                  {m.email ? ` · ${m.email}` : ""}
                  {m.last_login_at ? ` · Last login ${relativeTime(m.last_login_at)}` : ""}
                </p>
              </div>

              {canManage && !isOwner && !isSelf && (
                <div className="flex items-center gap-2">
                  {/* PRIMARY ACTIONS */}
                  <Button size="sm" variant="outline" onClick={() => setEditFor(m)}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit Employee
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    disabled={viewAsLoadingId === m.id}
                    onClick={() => handleViewDashboard(m)}
                  >
                    {viewAsLoadingId === m.id ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <LayoutDashboard className="mr-1.5 h-3.5 w-3.5 text-primary" />
                    )}
                    View Dashboard
                  </Button>

                  {/* SECONDARY ACTIONS DROPDOWN */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      >
                        <MoreVertical className="h-4 w-4" />
                        <span className="sr-only">More actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => setPermissionsFor(m)}>
                        <ShieldCheck className="mr-2 h-4 w-4 text-primary" /> Permissions
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setResetFor(m);
                          setNewPassword("");
                          setShowResetPassword(false);
                        }}
                      >
                        <KeyRound className="mr-2 h-4 w-4" /> Reset password
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {m.is_active ? (
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          disabled={activate.isPending}
                          onClick={() => activate.mutate({ userId: m.id, isActive: false })}
                        >
                          <UserX className="mr-2 h-4 w-4" /> Deactivate
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          className="text-emerald-600 focus:text-emerald-600"
                          disabled={activate.isPending}
                          onClick={() => activate.mutate({ userId: m.id, isActive: true })}
                        >
                          <UserCheck className="mr-2 h-4 w-4" /> Reactivate
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Edit employee dialog */}
      {editFor && (
        <EditEmployeeDialog
          member={editFor}
          workspaceId={workspaceId}
          onClose={() => setEditFor(null)}
          onSaved={async () => {
            await invalidate();
          }}
        />
      )}

      {/* Reset password dialog */}
      <Dialog open={Boolean(resetFor)} onOpenChange={(o) => !o && setResetFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Set a new password for{" "}
              <span className="font-medium text-foreground">{resetFor?.full_name}</span> (User ID:{" "}
              {resetFor?.user_code}).
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label className="text-xs">New password (min 8 chars) *</Label>
            <div className="relative mt-1">
              <Input
                type={showResetPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowResetPassword(!showResetPassword)}
                className="text-muted-foreground hover:text-foreground absolute right-2.5 top-1/2 -translate-y-1/2 p-1"
                aria-label={showResetPassword ? "Hide password" : "Show password"}
              >
                {showResetPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetFor(null)}>
              Cancel
            </Button>
            <Button
              disabled={newPassword.length < 8 || reset.isPending}
              onClick={() => reset.mutate()}
            >
              {reset.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Update
              password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permissions Dialog */}
      {permissionsFor && (
        <PermissionsDialog
          member={permissionsFor}
          workspaceId={workspaceId}
          onClose={() => setPermissionsFor(null)}
        />
      )}
    </SectionCard>
  );
}

function EditEmployeeDialog({
  member,
  workspaceId,
  onClose,
  onSaved,
}: {
  member: MemberRow;
  workspaceId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const updateEmployee = useServerFn(updateWorkspaceEmployeeFn);
  const [fullName, setFullName] = useState(member.full_name);
  const [email, setEmail] = useState(member.email || "");
  const [phone, setPhone] = useState(member.phone || "");
  const [jobTitle, setJobTitle] = useState(member.job_title || "");

  const isEmailValid = !email || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  const editMutation = useMutation({
    mutationFn: () =>
      updateEmployee({
        data: {
          userId: member.id,
          fullName: fullName.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          jobTitle: jobTitle.trim() || null,
        },
      }),
    onSuccess: async () => {
      toast.success("Employee updated");
      onClose();
      await onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" /> Edit Employee
          </DialogTitle>
          <DialogDescription>
            Update personal and contact details for this team member.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-3 border border-border">
            <div>
              <Label className="text-[11px] text-muted-foreground uppercase font-semibold">
                User ID (Login)
              </Label>
              <div className="mt-1 font-mono text-xs font-semibold text-foreground">
                {member.user_code}
              </div>
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground uppercase font-semibold">
                Role
              </Label>
              <div className="mt-1">
                <StatusBadge label={member.role ?? "employee"} />
              </div>
            </div>
          </div>

          <Field
            label="Full name *"
            value={fullName}
            onChange={setFullName}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Field
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
              />
              {!isEmailValid && (
                <p className="mt-1 text-[11px] text-destructive">Enter a valid email address.</p>
              )}
            </div>
            <Field
              label="Phone"
              value={phone}
              onChange={setPhone}
            />
          </div>

          <Field
            label="Job title"
            value={jobTitle}
            onChange={setJobTitle}
          />

          <p className="text-muted-foreground text-[11px] border-t border-border pt-2">
            Role, User ID, and account status are managed separately to prevent unintended privilege escalation. Passwords can be changed via Reset Password.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!fullName.trim() || !isEmailValid || editMutation.isPending}
            onClick={() => editMutation.mutate()}
          >
            {editMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const FINANCE_PERMISSIONS: { id: string; label: string; description: string }[] = [
  {
    id: "finance.view",
    label: "View Finance",
    description: "Access the Finance section, overview metrics, invoices, and payments",
  },
  {
    id: "finance.invoices.create",
    label: "Create Invoice",
    description: "Draft new customer invoices with line items and taxes",
  },
  {
    id: "finance.invoices.edit",
    label: "Edit Invoice",
    description: "Edit existing invoices and line item calculations",
  },
  {
    id: "finance.invoices.issue",
    label: "Issue / Send Invoice",
    description: "Finalize and mark invoices as issued/sent to clients",
  },
  {
    id: "finance.invoices.cancel",
    label: "Cancel / Void Invoice",
    description: "Cancel or void issued invoices with cancellation reason",
  },
  {
    id: "finance.payments.record",
    label: "Record Payment",
    description: "Record received client payments and update invoice balance",
  },
  {
    id: "finance.payments.edit",
    label: "Edit Payment",
    description: "Update reference, notes or details of recorded payments",
  },
  {
    id: "finance.payments.reverse",
    label: "Reverse / Refund Payment",
    description: "Reverse or refund recorded payments with audit reason",
  },
  { id: "finance.print", label: "Print Invoice", description: "Print formatted GST tax invoices" },
  {
    id: "finance.download",
    label: "Download PDF",
    description: "Export invoices and payment receipts as PDF documents",
  },
  { id: "finance.share", label: "Share Documents", description: "Generate client share links" },
  {
    id: "finance.export",
    label: "Export Financial Data",
    description: "Export financial records to CSV/Excel reports",
  },
  {
    id: "finance.reports.view",
    label: "View Finance Reports",
    description: "View live workspace revenue, receivables, and tax reports",
  },
];

function PermissionsDialog({
  member,
  workspaceId,
  onClose,
}: {
  member: MemberRow;
  workspaceId: string;
  onClose: () => void;
}) {
  const getPermissions = useServerFn(getUserPermissionsFn);
  const setPermissions = useServerFn(setUserPermissionsFn);
  const [selected, setSelected] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useQuery({
    queryKey: ["user-permissions", workspaceId, member.id],
    queryFn: async () => {
      const data = await getPermissions({ data: { workspaceId, userId: member.id } });
      setSelected(data || []);
      setLoaded(true);
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      await setPermissions({
        data: {
          workspaceId,
          userId: member.id,
          permissions: selected,
        },
      });
    },
    onSuccess: () => {
      toast.success(`Finance permissions updated for ${member.full_name}`);
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (permId: string) => {
    setSelected((prev) => {
      if (prev.includes(permId)) {
        return prev.filter((p) => p !== permId);
      } else {
        const next = [...prev, permId];
        if (!next.includes("finance.view")) {
          next.push("finance.view");
        }
        return next;
      }
    });
  };

  const grantAll = () => {
    setSelected(FINANCE_PERMISSIONS.map((p) => p.id));
  };

  const revokeAll = () => {
    setSelected([]);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Finance Permissions · {member.full_name}
          </DialogTitle>
          <DialogDescription>
            Configure granular finance access for user{" "}
            <code className="bg-muted px-1 rounded">{member.user_code}</code> ({member.role}). By
            default, employees have Finance disabled. All permissions are enforced server-side.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between py-2 border-b border-border">
          <div className="text-xs text-muted-foreground">
            {selected.length} of {FINANCE_PERMISSIONS.length} permissions granted
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={grantAll}>
              Grant All Finance
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-destructive hover:text-destructive"
              onClick={revokeAll}
            >
              Revoke All
            </Button>
          </div>
        </div>

        <div className="overflow-y-auto space-y-3 py-3 pr-1 flex-1">
          {!loaded ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            FINANCE_PERMISSIONS.map((p) => {
              const isChecked = selected.includes(p.id);
              return (
                <label
                  key={p.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                    isChecked ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted/40"
                  }`}
                >
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={() => toggle(p.id)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{p.label}</p>
                    <p className="text-xs text-muted-foreground">{p.description}</p>
                  </div>
                </label>
              );
            })
          )}
        </div>

        <DialogFooter className="border-t border-border pt-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!loaded || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save Permissions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
            <Field
              label="Full name"
              value={form.fullName}
              onChange={(v) => setForm({ ...form, fullName: v })}
            />
            <Field
              label="Job title"
              value={form.jobTitle}
              onChange={(v) => setForm({ ...form, jobTitle: v })}
            />
            <Field
              label="Email"
              value={form.email}
              onChange={(v) => setForm({ ...form, email: v })}
            />
            <Field
              label="Phone"
              value={form.phone}
              onChange={(v) => setForm({ ...form, phone: v })}
            />
          </div>
          <div className="mt-4 flex justify-end">
            <Button size="sm" disabled={saveProfile.isPending} onClick={() => saveProfile.mutate()}>
              {saveProfile.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save
              profile
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
              {changePassword.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{" "}
              Change password
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
              {form.phone || (
                <span className="text-muted-foreground font-normal">Not configured</span>
              )}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Uses your profile phone number. Edit in My Profile above.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <Label className="text-xs text-muted-foreground">Sender Email</Label>
            <p className="mt-1 text-sm font-semibold text-foreground truncate">
              {form.email || (
                <span className="text-muted-foreground font-normal">Not configured</span>
              )}
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
            {saveProfile.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Save
            WhatsApp Number
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
