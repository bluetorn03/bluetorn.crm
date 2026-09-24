import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileClock, Search, ShieldAlert, UserCheck } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { MetricCard } from "@/components/common/MetricCard";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { Input } from "@/components/ui/input";
import { relativeTime } from "@/lib/format";

export const Route = createFileRoute("/admin/audit")({
  head: () => ({
    meta: [
      { title: "Audit trail · BLUETORN CRM" },
      { name: "description", content: "Who changed what, and when." },
      { property: "og:title", content: "Audit trail · BLUETORN CRM" },
      { property: "og:description", content: "Who changed what, and when." },
    ],
  }),
  component: AdminAudit,
});

type AuditEntry = {
  id: string;
  actorLabel: string;
  action: string;
  entityType: string;
  entityId: string;
  workspaceCode: string;
  createdAt: string;
};

const sampleAudits: AuditEntry[] = [
  {
    id: "aud-1",
    actorLabel: "Bluetorn Platform",
    action: "platform.bootstrap",
    entityType: "profile",
    entityId: "u-6",
    workspaceCode: "BLUETORN",
    createdAt: new Date(Date.now() - 10 * 60000).toISOString(),
  },
  {
    id: "aud-2",
    actorLabel: "Arjun Mehta",
    action: "workspace.created",
    entityType: "workspace",
    entityId: "ws-1",
    workspaceCode: "BT-RE-1042",
    createdAt: new Date(Date.now() - 25 * 60000).toISOString(),
  },
  {
    id: "aud-3",
    actorLabel: "Arjun Mehta",
    action: "user.created",
    entityType: "profile",
    entityId: "u-2",
    workspaceCode: "BT-RE-1042",
    createdAt: new Date(Date.now() - 40 * 60000).toISOString(),
  },
  {
    id: "aud-4",
    actorLabel: "Priya Nair",
    action: "lead.status_updated",
    entityType: "lead",
    entityId: "l-1",
    workspaceCode: "BT-RE-1042",
    createdAt: new Date(Date.now() - 110 * 60000).toISOString(),
  },
  {
    id: "aud-5",
    actorLabel: "Arjun Mehta",
    action: "invoice.created",
    entityType: "invoice",
    entityId: "i-1",
    workspaceCode: "BT-RE-1042",
    createdAt: new Date(Date.now() - 240 * 60000).toISOString(),
  },
];

function AdminAudit() {
  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");

  const filtered = useMemo(() => {
    return sampleAudits.filter((a) => {
      const matchCat =
        categoryFilter === "All" || a.action.toLowerCase().startsWith(categoryFilter.toLowerCase());
      const matchQ =
        a.actorLabel.toLowerCase().includes(q.toLowerCase()) ||
        a.action.toLowerCase().includes(q.toLowerCase()) ||
        a.workspaceCode.toLowerCase().includes(q.toLowerCase());
      return matchCat && matchQ;
    });
  }, [categoryFilter, q]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit Trail"
        description="Who changed what, and when across all tenant workspaces."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Audited Events"
          value={String(sampleAudits.length)}
          hint="Immutable system trail"
          icon={FileClock}
        />
        <MetricCard
          label="Active Actors"
          value="3 Users"
          hint="Authenticated performers"
          icon={UserCheck}
        />
        <MetricCard
          label="Security Compliance"
          value="Verified"
          hint="Zero un-audited operations"
          icon={ShieldAlert}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="text-muted-foreground absolute top-2.5 left-3 h-4 w-4" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search actor, action or workspace"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {["All", "Platform", "Workspace", "User", "Lead", "Invoice"].map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer " +
                (categoryFilter === cat
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground")
              }
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={FileClock}
          title="No audit logs match"
          description="Adjust your search criteria to view recorded security actions."
        />
      ) : (
        <SectionCard bodyClassName="p-0">
          <ul className="divide-border divide-y text-sm">
            {filtered.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{a.action}</p>
                    <StatusBadge label={a.workspaceCode} tone="neutral" />
                  </div>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    Performed by <span className="text-foreground font-medium">{a.actorLabel}</span>{" "}
                    on {a.entityType} ({a.entityId})
                  </p>
                </div>
                <span className="text-muted-foreground text-xs">{relativeTime(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
