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
import { formatDate, relativeTime } from "@/lib/format";

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
                          <div className="text-foreground">{formatDate(event.created_at)}</div>
                          <div className="text-[10px] text-muted-foreground">{relativeTime(event.created_at)}</div>
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
          {inspectEvent && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between pr-6">
                  <DialogTitle className="text-base font-semibold flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    Audit Event Details
                  </DialogTitle>
                  <StatusBadge
                    label={inspectEvent.action}
                    tone={getActionBadgeTone(inspectEvent.action)}
                  />
                </div>
                <DialogDescription className="text-xs text-muted-foreground">
                  Recorded on {formatDate(inspectEvent.created_at)} ({relativeTime(inspectEvent.created_at)})
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 pt-2 text-xs">
                {/* Core Overview */}
                <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/30 p-3">
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Actor (Who)</span>
                    <strong className="text-foreground font-medium block">
                      {inspectEvent.actor_name || inspectEvent.actor_label || "System"}
                    </strong>
                    {inspectEvent.actor_email && (
                      <span className="text-muted-foreground text-[10px] block">{inspectEvent.actor_email}</span>
                    )}
                    {inspectEvent.actor_id && (
                      <span className="font-mono text-[10px] text-muted-foreground block truncate">
                        ID: {inspectEvent.actor_id}
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Record Target (What)</span>
                    <strong className="text-foreground font-medium block capitalize">
                      {inspectEvent.entity_type ? inspectEvent.entity_type.replace(/_/g, " ") : "Workspace"}
                    </strong>
                    {inspectEvent.entity_id && (
                      <span className="font-mono text-[10px] text-muted-foreground block truncate">
                        ID: {inspectEvent.entity_id}
                      </span>
                    )}
                    <span className="block mt-1">
                      Status:{" "}
                      <strong className={inspectEvent.status === "failed" ? "text-destructive" : "text-success"}>
                        {inspectEvent.status?.toUpperCase() || "SUCCESS"}
                      </strong>
                    </span>
                  </div>
                </div>

                {/* Before vs After Diff if available */}
                {(() => {
                  const meta = parseMetadata(inspectEvent.metadata);
                  if (!meta) return null;
                  const hasDiff = meta["before"] !== undefined || meta["after"] !== undefined;
                  if (!hasDiff) return null;

                  return (
                    <div className="space-y-1.5">
                      <h4 className="font-medium text-foreground text-xs">State Changes (Before vs After)</h4>
                      <div className="grid grid-cols-2 gap-2 rounded-lg border border-border p-3 bg-card">
                        <div className="space-y-1">
                          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                            Before
                          </span>
                          <pre className="font-mono text-[11px] p-2 bg-muted/40 rounded border border-border/60 overflow-x-auto text-muted-foreground">
                            {JSON.stringify(meta["before"] ?? {}, null, 2)}
                          </pre>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[11px] font-semibold text-primary uppercase tracking-wider block">
                            After
                          </span>
                          <pre className="font-mono text-[11px] p-2 bg-primary/5 rounded border border-primary/20 overflow-x-auto text-foreground">
                            {JSON.stringify(meta["after"] ?? {}, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Metadata Payload */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-foreground text-xs flex items-center gap-1.5">
                      <FileCode className="h-3.5 w-3.5 text-muted-foreground" />
                      Event Metadata (Sanitized)
                    </h4>
                    {inspectEvent.metadata && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyJson(parseMetadata(inspectEvent.metadata))}
                        className="h-6 text-[10px] gap-1 px-2"
                      >
                        {copiedJson ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                        {copiedJson ? "Copied" : "Copy JSON"}
                      </Button>
                    )}
                  </div>
                  <pre className="font-mono text-[11px] p-3 rounded-lg border border-border bg-muted/30 overflow-x-auto max-h-56 leading-relaxed">
                    {JSON.stringify(parseMetadata(inspectEvent.metadata) ?? {}, null, 2)}
                  </pre>
                </div>

                {/* Request Metadata (IP, User Agent) */}
                {(inspectEvent.ip_address || inspectEvent.user_agent) && (
                  <div className="space-y-1.5 pt-1">
                    <h4 className="font-medium text-foreground text-xs">Request Context</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-muted-foreground rounded-lg border border-border p-2.5 bg-muted/20">
                      {inspectEvent.ip_address && (
                        <div className="flex items-center gap-1.5">
                          <Globe className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="font-mono">IP: {inspectEvent.ip_address}</span>
                        </div>
                      )}
                      {inspectEvent.user_agent && (
                        <div className="flex items-center gap-1.5 truncate" title={inspectEvent.user_agent}>
                          <Monitor className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="truncate">Client: {inspectEvent.user_agent}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
