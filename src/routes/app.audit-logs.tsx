import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Shield,
  Search,
  Filter,
  RefreshCw,
  Clock,
  User,
  Activity,
  Layers,
  Calendar,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileCode,
  Globe,
  Monitor,
  Copy,
  Check,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { MetricCard } from "@/components/common/MetricCard";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { LoadingState, ErrorState } from "@/components/common/DataState";
import { EmptyState } from "@/components/common/EmptyState";
import { PermissionGate } from "@/components/app/PermissionGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useSession } from "@/hooks/use-session";
import { listWorkspaceAuditLogs, type AuditLogItem } from "@/lib/crm-api";
import { getWorkspaceSettingsFn } from "@/lib/settings.functions";
import { formatAuditTimestamp, formatAuditRelativeTime, formatIndianNumber } from "@/lib/format";

type FieldDiff = {
  field: string;
  label: string;
  before: any;
  after: any;
};

function humanizeFieldName(key: string): string {
  const custom: Record<string, string> = {
    user_code: "User ID",
    full_name: "Full Name",
    job_title: "Job Title",
    is_active: "Active Status",
    due_date: "Due Date",
    follow_up_at: "Follow-up Date",
    entity_type: "Module",
    created_at: "Created At",
    updated_at: "Updated At",
    seat_limit: "Seat Limit",
    currency_code: "Currency",
    tax_rate: "Tax Rate (%)",
  };
  if (custom[key]) return custom[key];
  return key
    .replace(/_/g, " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

function humanizeAction(action: string): string {
  const map: Record<string, string> = {
    "auth.login_success": "User Login (Success)",
    "auth.login_failure": "Login Attempt Failed",
    "auth.logout": "User Logout",
    "auth.employee_view_enter": "Started Employee View",
    "auth.employee_view_exit": "Exited Employee View",
    "lead.created": "Lead Created",
    "lead.updated": "Lead Updated",
    "lead.deleted": "Lead Deleted",
    "lead.converted": "Lead Converted",
    "lead.assigned": "Lead Assigned",
    "lead.follow_up_scheduled": "Follow-Up Scheduled",
    "lead.follow_up_cleared": "Follow-Up Cleared",
    "customer.created": "Customer Created",
    "customer.updated": "Customer Updated",
    "customer.deleted": "Customer Deleted",
    "property.created": "Property Created",
    "property.updated": "Property Updated",
    "property.deleted": "Property Deleted",
    "task.created": "Task Created",
    "task.updated": "Task Updated",
    "task.completed": "Task Completed",
    "task.reopened": "Task Reopened",
    "task.deleted": "Task Deleted",
    "calendar.event_created": "Calendar Event Created",
    "calendar.event_updated": "Calendar Event Updated",
    "calendar.event_rescheduled": "Calendar Event Rescheduled",
    "calendar.event_deleted": "Calendar Event Deleted",
    "finance.invoice.created": "Invoice Created",
    "finance.invoice.updated": "Invoice Updated",
    "finance.invoice.issued": "Invoice Issued",
    "finance.invoice.cancelled": "Invoice Cancelled",
    "finance.payment.recorded": "Payment Recorded",
    "finance.payment.reversed": "Payment Reversed",
    "user.created": "Team Member Created",
    "user.deactivated": "User Deactivated",
    "user.reactivated": "User Reactivated",
    "user.permission_change": "Permissions Changed",
    "user.profile_update": "Profile Updated",
    "user.password_change": "Password Changed",
    "workspace.settings_update": "Workspace Settings Updated",
    "lead_options.updated": "Lead Options Updated",
  };
  if (map[action]) return map[action];
  return action
    .replace(/_/g, " ")
    .replace(/\./g, " · ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(key: string, val: any): string {
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "boolean") return val ? "Yes / Active" : "No / Inactive";
  const lowerKey = key.toLowerCase();
  if (
    (lowerKey.includes("budget") ||
      lowerKey.includes("amount") ||
      lowerKey.includes("price") ||
      lowerKey.includes("cost") ||
      lowerKey.includes("revenue") ||
      lowerKey.includes("total") ||
      lowerKey.includes("balance")) &&
    typeof val === "number"
  ) {
    return `₹${formatIndianNumber(val)}`;
  }
  if (typeof val === "object") {
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }
  return String(val);
}

function extractDiffs(metadata: any): FieldDiff[] {
  if (!metadata || typeof metadata !== "object") return [];
  const diffs: FieldDiff[] = [];

  if (metadata.diff && typeof metadata.diff === "object" && !Array.isArray(metadata.diff)) {
    for (const [k, v] of Object.entries(metadata.diff)) {
      if (v && typeof v === "object") {
        const item = v as any;
        const b = item.before !== undefined ? item.before : item.old;
        const a = item.after !== undefined ? item.after : item.new;
        diffs.push({
          field: k,
          label: humanizeFieldName(k),
          before: b,
          after: a,
        });
      }
    }
  }

  if (
    diffs.length === 0 &&
    metadata.before &&
    metadata.after &&
    typeof metadata.before === "object" &&
    typeof metadata.after === "object"
  ) {
    const allKeys = Array.from(new Set([...Object.keys(metadata.before), ...Object.keys(metadata.after)]));
    for (const k of allKeys) {
      const b = metadata.before[k];
      const a = metadata.after[k];
      if (JSON.stringify(b) !== JSON.stringify(a)) {
        diffs.push({
          field: k,
          label: humanizeFieldName(k),
          before: b,
          after: a,
        });
      }
    }
  }

  return diffs;
}

export const Route = createFileRoute("/app/audit-logs")({
  head: () => ({
    meta: [
      { title: "Audit Logs · BLUETORN CRM" },
      {
        name: "description",
        content: "Database-backed append-only security and operational audit trail for workspace activities.",
      },
      { property: "og:title", content: "Audit Logs · BLUETORN CRM" },
      {
        property: "og:description",
        content: "Database-backed append-only security and operational audit trail for workspace activities.",
      },
    ],
  }),
  component: AuditLogsRoute,
});

function AuditLogsRoute() {
  return (
    <PermissionGate requires={["view_audit_logs", "view.audit_logs"]}>
      <AuditLogsPage />
    </PermissionGate>
  );
}

function AuditLogsPage() {
  const { workspace } = useSession();

  // Filters state
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedActor, setSelectedActor] = useState("all");
  const [selectedModule, setSelectedModule] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Selected event for detail inspection modal
  const [inspectEvent, setInspectEvent] = useState<AuditLogItem | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);

  // Debounce search input
  const handleSearchChange = (val: string) => {
    setSearch(val);
    setPage(1);
    // Simple 300ms debounce
    const timeout = setTimeout(() => {
      setDebouncedSearch(val);
    }, 300);
    return () => clearTimeout(timeout);
  };

  const resetFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setSelectedActor("all");
    setSelectedModule("all");
    setSelectedStatus("all");
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  // Query workspace settings for retention days
  const settingsQuery = useQuery({
    queryKey: ["workspace-settings", workspace?.id],
    queryFn: () => (workspace ? getWorkspaceSettingsFn({ data: { workspaceId: workspace.id } }) : null),
    enabled: Boolean(workspace?.id),
  });

  // Query audit logs from server
  const auditQuery = useQuery({
    queryKey: [
      "audit-logs",
      workspace?.id,
      page,
      pageSize,
      debouncedSearch,
      selectedActor,
      selectedModule,
      selectedStatus,
      startDate,
      endDate,
    ],
    queryFn: () =>
      listWorkspaceAuditLogs({
        page,
        pageSize,
        search: debouncedSearch.trim() || undefined,
        actorId: selectedActor !== "all" ? selectedActor : undefined,
        module: selectedModule !== "all" ? selectedModule : undefined,
        status: selectedStatus !== "all" ? selectedStatus : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
    enabled: Boolean(workspace?.id),
  });

  const data = auditQuery.data;
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const retentionDays = settingsQuery.data?.audit_retention_days ?? 180;

  const parseMetadata = (raw: any): Record<string, any> | null => {
    if (!raw) return null;
    if (typeof raw === "object") return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return { rawText: String(raw) };
    }
  };

  const handleCopyJson = (obj: any) => {
    navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const getActionBadgeTone = (action: string): "neutral" | "brand" | "success" | "warning" | "danger" => {
    const act = action.toLowerCase();
    if (act.includes("delete") || act.includes("void") || act.includes("cancel") || act.includes("failed")) {
      return "danger";
    }
    if (act.includes("create") || act.includes("record") || act.includes("convert")) {
      return "success";
    }
    if (act.includes("update") || act.includes("edit") || act.includes("assign")) {
      return "brand";
    }
    return "neutral";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Logs"
        description="Comprehensive, append-only security and operational audit trail with workspace isolation."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => auditQuery.refetch()}
            disabled={auditQuery.isFetching}
            className="gap-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${auditQuery.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {/* Metrics Header */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total Audit Events"
          value={total.toLocaleString("en-IN")}
          hint="Recorded workspace events"
          icon={Activity}
        />
        <MetricCard
          label="Retention Policy"
          value={`${retentionDays} Days`}
          hint="Automated MariaDB retention"
          icon={Clock}
        />
        <MetricCard
          label="Monitored Modules"
          value={String(data?.modules.length ?? 0)}
          hint="Active business subsystems"
          icon={Layers}
        />
        <MetricCard
          label="Audited Actors"
          value={String(data?.actors.length ?? 0)}
          hint="Active workspace users"
          icon={User}
        />
      </div>

      {/* Retention Notice Callout */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-lg border border-border/80 bg-muted/40 p-4 text-xs">
        <div className="flex items-center gap-2.5">
          <Shield className="h-4 w-4 text-primary shrink-0" />
          <p className="text-muted-foreground">
            <strong className="text-foreground font-medium">Immutable Security Audit:</strong> All business mutations, logins, and configurations are permanently recorded with authenticated session identity. Logs older than {retentionDays} days are cleaned by the centralized retention scheduler.
          </p>
        </div>
      </div>

      {/* Filters Card */}
      <SectionCard title="Filter & Search Events" description="Search actions, records, team members, and date ranges.">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search action, record ID, or user..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>

            {/* Module Filter */}
            <Select
              value={selectedModule}
              onValueChange={(val) => {
                setSelectedModule(val);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="All Modules" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Modules</SelectItem>
                {(data?.modules ?? []).map((mod) => (
                  <SelectItem key={mod} value={mod} className="capitalize">
                    {mod.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Actor Filter */}
            <Select
              value={selectedActor}
              onValueChange={(val) => {
                setSelectedActor(val);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="All Team Members" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Team Members</SelectItem>
                {(data?.actors ?? []).map((act) => (
                  <SelectItem key={act.id} value={act.id}>
                    {act.name} {act.email ? `(${act.email})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status Filter */}
            <Select
              value={selectedStatus}
              onValueChange={(val) => {
                setSelectedStatus(val);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="All Results" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Results</SelectItem>
                <SelectItem value="success">Success Only</SelectItem>
                <SelectItem value="failed">Failed / Errors</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                <span>From:</span>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setPage(1);
                  }}
                  className="h-8 w-36 text-xs"
                />
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>To:</span>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setPage(1);
                  }}
                  className="h-8 w-36 text-xs"
                />
              </div>
            </div>

            {(debouncedSearch || selectedActor !== "all" || selectedModule !== "all" || selectedStatus !== "all" || startDate || endDate) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
              >
                Reset Filters
              </Button>
            )}
          </div>
        </div>
      </SectionCard>

      {/* Audit Log Table */}
      <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
        {auditQuery.isLoading ? (
          <div className="p-8">
            <LoadingState label="Loading audit logs from database..." />
          </div>
        ) : auditQuery.isError ? (
          <div className="p-8">
            <ErrorState error={auditQuery.error} onRetry={() => auditQuery.refetch()} />
          </div>
        ) : items.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={Shield}
              title="No audit events found"
              description={
                debouncedSearch || selectedActor !== "all" || selectedModule !== "all" || startDate || endDate
                  ? "No audit records match the current filter criteria."
                  : "No audit events recorded for this workspace yet."
              }
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
                  <tr>
                    <th className="py-3 px-4">User / Actor</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Module / Record</th>
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-4">Result</th>
                    <th className="py-3 px-4 text-right">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((event) => {
                    const parsed = parseMetadata(event.metadata);
                    return (
                      <tr
                        key={event.id}
                        className="hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => setInspectEvent(event)}
                      >
                        <td className="py-3 px-4">
                          <div className="font-medium text-foreground">
                            {event.actor_name || event.actor_label || "System"}
                          </div>
                          {event.actor_email && (
                            <div className="text-[11px] text-muted-foreground">{event.actor_email}</div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge
                            label={event.action}
                            tone={getActionBadgeTone(event.action)}
                          />
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium capitalize text-foreground">
                            {event.entity_type ? event.entity_type.replace(/_/g, " ") : "—"}
                          </div>
                          {event.entity_id && (
                            <div className="text-[11px] font-mono text-muted-foreground truncate max-w-[140px]" title={event.entity_id}>
                              {event.entity_id}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-muted-foreground">
                          <div className="text-foreground font-medium">{formatAuditTimestamp(event.created_at)}</div>
                        </td>
                        <td className="py-3 px-4">
                          {event.status === "failed" ? (
                            <span className="inline-flex items-center gap-1 font-medium text-destructive text-[11px]">
                              <XCircle className="h-3.5 w-3.5" /> Failed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-medium text-success text-[11px]">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Success
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              setInspectEvent(event);
                            }}
                            title="Inspect Event"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Server-Side Pagination */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
              <div>
                Showing <strong className="text-foreground">{(page - 1) * pageSize + 1}</strong> to{" "}
                <strong className="text-foreground">{Math.min(page * pageSize, total)}</strong> of{" "}
                <strong className="text-foreground">{total.toLocaleString("en-IN")}</strong> events
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || auditQuery.isFetching}
                  className="h-7 px-2.5 text-xs gap-1"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Previous
                </Button>
                <span className="text-xs">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || auditQuery.isFetching}
                  className="h-7 px-2.5 text-xs gap-1"
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Event Details Inspection Modal */}
      <Dialog open={Boolean(inspectEvent)} onOpenChange={(open) => !open && setInspectEvent(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {inspectEvent && (() => {
            const meta = parseMetadata(inspectEvent.metadata) || {};
            const diffs = extractDiffs(meta);
            const actorRole =
              meta["actorRole"] || meta["role"] || (inspectEvent.actor_email?.includes("admin") ? "Admin" : "Team Member");
            const recordTitle =
              meta["lead_name"] ||
              meta["task_title"] ||
              meta["customer_name"] ||
              meta["title"] ||
              meta["invoice_no"] ||
              meta["payment_number"] ||
              meta["full_name"] ||
              meta["user_code"];

            return (
              <>
                <DialogHeader className="border-b border-border pb-3">
                  <div className="flex items-center justify-between pr-6">
                    <div className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-primary" />
                      <DialogTitle className="text-base font-semibold">
                        {humanizeAction(inspectEvent.action)}
                      </DialogTitle>
                    </div>
                    <StatusBadge
                      label={inspectEvent.action}
                      tone={getActionBadgeTone(inspectEvent.action)}
                    />
                  </div>
                  <DialogDescription className="text-xs text-muted-foreground mt-1">
                    Event ID: <code className="font-mono text-[11px] bg-muted px-1 py-0.5 rounded">{inspectEvent.id}</code>
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 pt-2 text-xs">
                  {/* Grid: WHO and WHAT HAPPENED */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* WHO */}
                    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        <User className="h-3.5 w-3.5 text-primary" />
                        <span>Who</span>
                      </div>
                      <div className="space-y-1">
                        <div>
                          <span className="text-[11px] text-muted-foreground block">Name</span>
                          <span className="font-medium text-foreground text-sm">
                            {inspectEvent.actor_name || inspectEvent.actor_label || "System"}
                          </span>
                        </div>
                        <div>
                          <span className="text-[11px] text-muted-foreground block">Email</span>
                          <span className="text-foreground">
                            {inspectEvent.actor_email || "System / Automated"}
                          </span>
                        </div>
                        <div>
                          <span className="text-[11px] text-muted-foreground block">Role</span>
                          <span className="inline-block font-medium capitalize text-foreground bg-muted px-1.5 py-0.5 rounded text-[11px]">
                            {actorRole}
                          </span>
                        </div>
                        {inspectEvent.actor_id && (
                          <div>
                            <span className="text-[11px] text-muted-foreground block">Actor ID</span>
                            <span className="font-mono text-[10px] text-muted-foreground truncate block" title={inspectEvent.actor_id}>
                              {inspectEvent.actor_id}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* WHAT HAPPENED */}
                    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        <Activity className="h-3.5 w-3.5 text-primary" />
                        <span>What Happened</span>
                      </div>
                      <div className="space-y-1">
                        <div>
                          <span className="text-[11px] text-muted-foreground block">Action</span>
                          <span className="font-medium text-foreground">
                            {humanizeAction(inspectEvent.action)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[11px] text-muted-foreground block">Module</span>
                          <span className="font-medium capitalize text-foreground">
                            {inspectEvent.entity_type ? inspectEvent.entity_type.replace(/_/g, " ") : "System"}
                          </span>
                        </div>
                        <div>
                          <span className="text-[11px] text-muted-foreground block">Record</span>
                          <div className="text-foreground font-medium">
                            {recordTitle ? (
                              <span>{recordTitle}</span>
                            ) : inspectEvent.entity_id ? (
                              <code className="font-mono text-[11px] text-muted-foreground bg-muted px-1 rounded truncate block max-w-full">
                                {inspectEvent.entity_id}
                              </code>
                            ) : (
                              <span className="text-muted-foreground">Workspace Level</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Grid: WHEN and RESULT */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* WHEN */}
                    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        <Clock className="h-3.5 w-3.5 text-primary" />
                        <span>When</span>
                      </div>
                      <div className="space-y-1">
                        <div>
                          <span className="text-[11px] text-muted-foreground block">Date & Time (IST)</span>
                          <span className="font-semibold text-foreground text-sm block">
                            {formatAuditTimestamp(inspectEvent.created_at)}
                          </span>
                          <span className="text-[11px] text-muted-foreground">Timezone: Asia/Kolkata (IST)</span>
                        </div>
                        <div>
                          <span className="text-[11px] text-muted-foreground block">Relative</span>
                          <span className="text-foreground">{formatAuditRelativeTime(inspectEvent.created_at)}</span>
                        </div>
                      </div>
                    </div>

                    {/* RESULT */}
                    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                        <span>Result</span>
                      </div>
                      <div className="space-y-1">
                        <div>
                          <span className="text-[11px] text-muted-foreground block">Execution Status</span>
                          {inspectEvent.status === "failed" ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-destructive text-sm mt-0.5">
                              <XCircle className="h-4 w-4" /> Failed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-semibold text-success text-sm mt-0.5">
                              <CheckCircle2 className="h-4 w-4" /> Success
                            </span>
                          )}
                        </div>
                        {(meta["reason"] || meta["error"]) && (
                          <div className="mt-1 rounded bg-destructive/10 border border-destructive/20 p-2">
                            <span className="text-[10px] uppercase font-semibold text-destructive block mb-0.5">
                              Reason / Error
                            </span>
                            <span className="text-destructive font-medium text-xs">{meta["reason"] || meta["error"]}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* CHANGES (Before / After Comparison) */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      <Layers className="h-3.5 w-3.5 text-primary" />
                      <span>Changes</span>
                    </div>

                    {diffs.length > 0 ? (
                      <div className="divide-y divide-border rounded-lg border border-border bg-card overflow-hidden">
                        {diffs.map((d) => (
                          <div key={d.field} className="p-3">
                            <div className="font-semibold text-foreground text-xs mb-2">
                              {d.label}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="rounded-md bg-muted/40 p-2.5 border border-border/50">
                                <span className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">
                                  Before
                                </span>
                                <span className="font-mono text-muted-foreground text-xs break-words">
                                  {formatValue(d.field, d.before)}
                                </span>
                              </div>
                              <div className="rounded-md bg-primary/5 p-2.5 border border-primary/20">
                                <span className="text-[10px] uppercase font-semibold text-primary block mb-1">
                                  After
                                </span>
                                <span className="font-mono text-foreground font-semibold text-xs break-words">
                                  {formatValue(d.field, d.after)}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-border bg-card p-3">
                        <p className="text-xs text-muted-foreground">
                          {inspectEvent.action.includes("create") || inspectEvent.action.includes("record")
                            ? "Initial creation event — record initialized with default and provided values."
                            : inspectEvent.action.includes("delete") || inspectEvent.action.includes("cancel")
                            ? "Deletion or cancellation event — record transitioned to inactive/removed state."
                            : "Operation executed successfully. No field-level diff was required."}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* CONTEXT (IP, Browser / Device) */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      <Globe className="h-3.5 w-3.5 text-primary" />
                      <span>Context</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-border bg-card p-3">
                      <div>
                        <span className="text-[11px] text-muted-foreground block">IP Address</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="font-mono text-xs text-foreground">
                            {inspectEvent.ip_address || "Localhost / Internal"}
                          </span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[11px] text-muted-foreground block">Device / Browser</span>
                        <div
                          className="flex items-center gap-1.5 mt-0.5 truncate"
                          title={inspectEvent.user_agent || "Direct Server / API"}
                        >
                          <Monitor className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-xs text-foreground truncate">
                            {inspectEvent.user_agent || "Direct Server / API"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* TECHNICAL DETAILS ▼ (Collapsible) */}
                  <details className="group rounded-lg border border-border bg-muted/20 p-3">
                    <summary className="flex cursor-pointer items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground">
                      <span className="flex items-center gap-1.5">
                        <FileCode className="h-3.5 w-3.5 text-primary" />
                        Technical Details & Raw Payload
                      </span>
                      <span className="text-[11px] group-open:rotate-180 transition-transform">▼</span>
                    </summary>
                    <div className="mt-3 space-y-2 pt-2 border-t border-border/50">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">Sanitized JSON payload</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyJson(meta)}
                          className="h-6 text-[10px] gap-1 px-2"
                        >
                          {copiedJson ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                          {copiedJson ? "Copied" : "Copy JSON"}
                        </Button>
                      </div>
                      <pre className="font-mono text-[11px] p-3 rounded-lg border border-border bg-card overflow-x-auto max-h-56 leading-relaxed text-foreground">
                        {JSON.stringify(meta, null, 2)}
                      </pre>
                    </div>
                  </details>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
