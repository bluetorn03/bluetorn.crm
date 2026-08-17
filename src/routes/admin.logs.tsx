import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, AlertTriangle, CheckCircle, Database, Search, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { MetricCard } from "@/components/common/MetricCard";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { Input } from "@/components/ui/input";
import { relativeTime } from "@/lib/format";

export const Route = createFileRoute("/admin/logs")({
  head: () => ({
    meta: [
      { title: "System logs · BLUETORN CRM" },
      { name: "description", content: "Platform events and integration health." },
      { property: "og:title", content: "System logs · BLUETORN CRM" },
      { property: "og:description", content: "Platform events and integration health." },
    ],
  }),
  component: AdminLogs,
});

type LogEntry = {
  id: string;
  timestamp: string;
  level: "info" | "warning" | "error" | "security";
  source: string;
  message: string;
  details?: string;
};

const sampleLogs: LogEntry[] = [
  {
    id: "log-1",
    timestamp: new Date(Date.now() - 2 * 60000).toISOString(),
    level: "info",
    source: "AuthService",
    message: "User session authenticated for BT-RE-1042 / arjun.mehta",
  },
  {
    id: "log-2",
    timestamp: new Date(Date.now() - 15 * 60000).toISOString(),
    level: "security",
    source: "RBACEngine",
    message: "Super Admin authorization verified for platform bootstrap query",
  },
  {
    id: "log-3",
    timestamp: new Date(Date.now() - 45 * 60000).toISOString(),
    level: "info",
    source: "DatabaseCluster",
    message: "Automated WAL backup completed successfully (14.2 MB)",
  },
  {
    id: "log-4",
    timestamp: new Date(Date.now() - 120 * 60000).toISOString(),
    level: "warning",
    source: "RateLimiter",
    message: "High request frequency detected from IP 103.21.244.12 — throttled 2 requests",
  },
  {
    id: "log-5",
    timestamp: new Date(Date.now() - 360 * 60000).toISOString(),
    level: "info",
    source: "WorkspaceManager",
    message: "New tenant workspace 'Skyline Realty' (BT-RE-1042) activated",
  },
];

const levelTones: Record<LogEntry["level"], "info" | "warning" | "danger" | "brand"> = {
  info: "info",
  warning: "warning",
  error: "danger",
  security: "brand",
};

function AdminLogs() {
  const [levelFilter, setLevelFilter] = useState<string>("All");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    return sampleLogs.filter((log) => {
      const matchLevel = levelFilter === "All" || log.level === levelFilter.toLowerCase();
      const matchQ =
        log.message.toLowerCase().includes(q.toLowerCase()) ||
        log.source.toLowerCase().includes(q.toLowerCase());
      return matchLevel && matchQ;
    });
  }, [levelFilter, q]);

  return (
    <div className="space-y-5">
      <PageHeader title="System Logs" description="Real-time platform events, security logs and integration health." />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="System Status" value="Healthy" hint="All services operational" icon={CheckCircle} />
        <MetricCard label="Database Latency" value="12ms" hint="Optimal connection pool" icon={Database} />
        <MetricCard label="Error Rate" value="0.00%" hint="Last 24 hours" icon={Activity} />
        <MetricCard label="Security Checks" value="100% Passed" hint="Zero unauthorized breaches" icon={ShieldCheck} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="text-muted-foreground absolute top-2.5 left-3 h-4 w-4" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search log source or message"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {["All", "Info", "Warning", "Error", "Security"].map((lvl) => (
            <button
              key={lvl}
              onClick={() => setLevelFilter(lvl)}
              className={
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer " +
                (levelFilter === lvl
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground")
              }
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No system logs match"
          description="Adjust your search criteria to view system events."
        />
      ) : (
        <SectionCard bodyClassName="p-0">
          <ul className="divide-border divide-y font-mono text-xs">
            {filtered.map((log) => (
              <li key={log.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="flex items-center gap-3 min-w-0">
                  <StatusBadge label={log.level.toUpperCase()} tone={levelTones[log.level]} />
                  <span className="text-muted-foreground shrink-0 font-semibold">{log.source}:</span>
                  <span className="truncate text-foreground font-sans text-sm">{log.message}</span>
                </div>
                <span className="text-muted-foreground shrink-0 text-[11px] font-sans">
                  {relativeTime(log.timestamp)}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}

