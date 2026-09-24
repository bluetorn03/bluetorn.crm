import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { listEvents, listInvoices, listLeads, listTasks, qk } from "@/lib/crm-api";
import { useSession } from "@/hooks/use-session";
import { formatDate, formatTime } from "@/lib/format";
import { getOverdueDays } from "@/lib/date-utils";
import { AlertTriangle, CalendarClock, ArrowUpRight } from "lucide-react";

export const Route = createFileRoute("/app/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar · BLUETORN CRM" },
      { name: "description", content: "Visits, follow-ups, meetings and payment due dates in one calendar." },
      { property: "og:title", content: "Calendar · BLUETORN CRM" },
      { property: "og:description", content: "Visits, follow-ups and payment dates in one calendar." },
    ],
  }),
  component: CalendarPage,
});

type Ev = {
  id: string;
  title: string;
  at: string;
  kind: "Visit" | "Follow-up" | "Task" | "Payment";
  linkUrl?: string | undefined;
};

const kindClass: Record<Ev["kind"], string> = {
  Visit: "border-primary/30 bg-primary/10 text-primary",
  "Follow-up": "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  Task: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  Payment: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

function CalendarPage() {
  const { workspace } = useSession();
  const [view, setView] = useState<"Day" | "Week" | "Month">("Week");

  const eventsQuery = useQuery({
    queryKey: qk.events(workspace.id),
    queryFn: () => listEvents(workspace.id),
    enabled: !!workspace.id,
  });

  const tasksQuery = useQuery({
    queryKey: qk.tasks(workspace.id),
    queryFn: () => listTasks(workspace.id),
    enabled: !!workspace.id,
  });

  const leadsQuery = useQuery({
    queryKey: qk.leads(workspace.id),
    queryFn: () => listLeads(workspace.id),
    enabled: !!workspace.id,
  });

  const invoicesQuery = useQuery({
    queryKey: qk.invoices(workspace.id),
    queryFn: () => listInvoices(workspace.id),
    enabled: !!workspace.id,
  });

  const calEvents = eventsQuery.data ?? [];
  const taskList = tasksQuery.data ?? [];
  const leadList = leadsQuery.data ?? [];
  const invoiceList = invoicesQuery.data ?? [];

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Build all events
  const events: Ev[] = [
    ...calEvents.map((v) => ({
      id: v.id,
      title: `${v.type || "Visit"} · ${v.title}`,
      at: v.start_at,
      kind: "Visit" as const,
      linkUrl: v.lead_id
        ? `/app/leads/${v.lead_id}`
        : v.customer_id
          ? `/app/customers/${v.customer_id}`
          : undefined,
    })),
    ...leadList
      .filter((l) => l.next_follow_up && l.status !== "Won" && l.status !== "Lost")
      .map((l) => ({
        id: `fu-${l.id}`,
        title: `Scheduled Follow-up · ${l.name}${l.phone ? ` (${l.phone})` : ""}`,
        at: l.next_follow_up!,
        kind: "Follow-up" as const,
        linkUrl: `/app/leads/${l.id}`,
      })),
    ...taskList
      .filter((t) => (t.status === "Open" || t.status === "In Progress") && t.due_at)
      .map((t) => ({
        id: `task-${t.id}`,
        title: `Task · ${t.title}`,
        at: t.due_at!,
        kind: "Task" as const,
        linkUrl: t.lead_id
          ? `/app/leads/${t.lead_id}`
          : t.customer_id
            ? `/app/customers/${t.customer_id}`
            : "/app/tasks",
      })),
    ...invoiceList
      .filter((i) => i.due_date && i.status !== "Paid" && i.status !== "Cancelled")
      .map((i) => ({
        id: i.id,
        title: `Payment Due · Invoice #${i.invoice_number}`,
        at: i.due_date!,
        kind: "Payment" as const,
        linkUrl: `/app/finance/invoices/${i.id}`,
      })),
  ].sort((a, b) => +new Date(a.at) - +new Date(b.at));

  // Separate overdue items from normal upcoming
  const overdueEvents = events.filter((e) => {
    const t = new Date(e.at);
    return !isNaN(t.getTime()) && t < todayStart;
  });
  const overdueIds = new Set(overdueEvents.map((e) => e.kind + e.id));

  // Normal date-ranged events (exclude overdue)
  const days = view === "Day" ? 1 : view === "Week" ? 7 : 30;
  const start = new Date(todayStart);
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  const visible = events.filter((e) => {
    if (overdueIds.has(e.kind + e.id)) return false; // exclude overdue from normal
    const t = +new Date(e.at);
    return !isNaN(t) && t >= +start && t < +end;
  });

  const byDay = visible.reduce<Record<string, Ev[]>>((acc, e) => {
    const k = formatDate(e.at);
    (acc[k] ||= []).push(e);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <PageHeader
        title="Calendar"
        description="One unified schedule for visits, lead follow-ups, tasks, and payment dues."
        actions={
          <div className="border-border bg-card flex gap-1 rounded-lg border p-1">
            {(["Day", "Week", "Month"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={
                  "rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer " +
                  (view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")
                }
              >
                {v}
              </button>
            ))}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(kindClass) as Ev["kind"][]).map((k) => (
          <span key={k} className={"rounded-full border px-2.5 py-0.5 text-xs font-medium " + kindClass[k]}>
            {k}
          </span>
        ))}
      </div>

      {/* Overdue Section */}
      {overdueEvents.length > 0 && (
        <SectionCard
          title="Overdue"
          description={`${overdueEvents.length} overdue item(s) require attention`}
          bodyClassName="p-0"
        >
          <ul className="divide-border divide-y">
            {overdueEvents.map((e) => {
              const overdueDays = getOverdueDays(e.at);
              return (
                <li key={e.kind + e.id} className="hover:bg-accent/40 transition-colors border-l-2 border-l-red-500">
                  {e.linkUrl ? (
                    <Link
                      to={e.linkUrl as any}
                      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-5"
                    >
                      <span className={"rounded-full border px-2.5 py-0.5 text-[11px] font-medium shrink-0 " + kindClass[e.kind]}>
                        {e.kind}
                      </span>
                      <div className="min-w-0">
                        <span className="truncate text-sm font-medium flex items-center gap-1 group">
                          <span className="truncate">{e.title}</span>
                          <ArrowUpRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-primary shrink-0" />
                        </span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-muted-foreground text-xs">
                            Due: {formatDate(e.at)} {formatTime(e.at)}
                          </span>
                          {overdueDays > 0 && (
                            <span className="text-red-600 dark:text-red-400 text-xs font-medium flex items-center gap-0.5">
                              <AlertTriangle className="h-3 w-3" />
                              Overdue by {overdueDays} day{overdueDays === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-red-600 dark:text-red-400 text-xs font-medium shrink-0">
                        {formatDate(e.at)}
                      </span>
                    </Link>
                  ) : (
                    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-5">
                      <span className={"rounded-full border px-2.5 py-0.5 text-[11px] font-medium shrink-0 " + kindClass[e.kind]}>
                        {e.kind}
                      </span>
                      <div className="min-w-0">
                        <span className="truncate text-sm font-medium">{e.title}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-muted-foreground text-xs">
                            Due: {formatDate(e.at)} {formatTime(e.at)}
                          </span>
                          {overdueDays > 0 && (
                            <span className="text-red-600 dark:text-red-400 text-xs font-medium flex items-center gap-0.5">
                              <AlertTriangle className="h-3 w-3" />
                              Overdue by {overdueDays} day{overdueDays === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-red-600 dark:text-red-400 text-xs font-medium shrink-0">
                        {formatDate(e.at)}
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </SectionCard>
      )}

      {/* Normal Calendar Events */}
      {Object.keys(byDay).length === 0 && overdueEvents.length === 0 ? (
        <SectionCard>
          <div className="py-6 text-center text-muted-foreground text-sm flex flex-col items-center justify-center gap-2">
            <CalendarClock className="h-8 w-8 text-muted-foreground/60" />
            <p>Nothing scheduled in this date range.</p>
          </div>
        </SectionCard>
      ) : (
        Object.entries(byDay).map(([day, items]) => (
          <SectionCard key={day} title={day} bodyClassName="p-0">
            <ul className="divide-border divide-y">
              {items.map((e) => (
                <li key={e.kind + e.id} className="hover:bg-accent/40 transition-colors">
                  {e.linkUrl ? (
                    <Link
                      to={e.linkUrl as any}
                      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-5"
                    >
                      <span className={"rounded-full border px-2.5 py-0.5 text-[11px] font-medium shrink-0 " + kindClass[e.kind]}>
                        {e.kind}
                      </span>
                      <span className="min-w-0 truncate text-sm font-medium flex items-center gap-1 group">
                        <span className="truncate">{e.title}</span>
                        <ArrowUpRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-primary shrink-0" />
                      </span>
                      <span className="text-muted-foreground text-xs shrink-0">{formatTime(e.at)}</span>
                    </Link>
                  ) : (
                    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-5">
                      <span className={"rounded-full border px-2.5 py-0.5 text-[11px] font-medium shrink-0 " + kindClass[e.kind]}>
                        {e.kind}
                      </span>
                      <span className="min-w-0 truncate text-sm font-medium">{e.title}</span>
                      <span className="text-muted-foreground text-xs shrink-0">{formatTime(e.at)}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </SectionCard>
        ))
      )}
    </div>
  );
}
