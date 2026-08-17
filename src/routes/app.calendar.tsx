import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { invoices, siteVisits, tasks, leadById, propertyById } from "@/lib/mock-data";
import { formatDate, formatTime } from "@/lib/format";

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

type Ev = { id: string; title: string; at: string; kind: "Visit" | "Task" | "Payment" };

const kindClass: Record<Ev["kind"], string> = {
  Visit: "border-primary/30 bg-primary/10 text-primary",
  Task: "border-info/30 bg-info/10 text-info",
  Payment: "border-warning/30 bg-warning/10 text-warning",
};

function CalendarPage() {
  const [view, setView] = useState<"Day" | "Week" | "Month">("Week");

  const events: Ev[] = [
    ...siteVisits.map((v) => ({ id: v.id, title: `Visit · ${propertyById(v.propertyId)?.name} (${leadById(v.leadId)?.name})`, at: v.scheduledAt, kind: "Visit" as const })),
    ...tasks.filter((t) => t.status === "Open").map((t) => ({ id: t.id, title: `Task · ${t.title}`, at: t.dueAt, kind: "Task" as const })),
    ...invoices.map((i) => ({ id: i.id, title: `Payment due · ${i.number}`, at: i.dueAt, kind: "Payment" as const })),
  ].sort((a, b) => +new Date(a.at) - +new Date(b.at));

  const days = view === "Day" ? 1 : view === "Week" ? 7 : 30;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  const visible = events.filter((e) => +new Date(e.at) >= +start && +new Date(e.at) < +end);

  const byDay = visible.reduce<Record<string, Ev[]>>((acc, e) => {
    const k = formatDate(e.at);
    (acc[k] ||= []).push(e);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <PageHeader
        title="Calendar"
        description="One place for visits, follow-ups and money."
        actions={
          <div className="border-border bg-card flex gap-1 rounded-lg border p-1">
            {(["Day", "Week", "Month"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={"rounded-md px-3 py-1.5 text-xs font-medium " + (view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
              >
                {v}
              </button>
            ))}
          </div>
        }
      />
      <div className="flex flex-wrap gap-2">
        {(Object.keys(kindClass) as Ev["kind"][]).map((k) => (
          <span key={k} className={"rounded-full border px-2.5 py-0.5 text-xs font-medium " + kindClass[k]}>{k}</span>
        ))}
      </div>
      {Object.keys(byDay).length === 0 ? (
        <SectionCard><p className="text-muted-foreground text-sm">Nothing scheduled in this range.</p></SectionCard>
      ) : (
        Object.entries(byDay).map(([day, items]) => (
          <SectionCard key={day} title={day} bodyClassName="p-0">
            <ul className="divide-border divide-y">
              {items.map((e) => (
                <li key={e.kind + e.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-5">
                  <span className={"rounded-full border px-2 py-0.5 text-[11px] font-medium " + kindClass[e.kind]}>{e.kind}</span>
                  <span className="min-w-0 truncate text-sm">{e.title}</span>
                  <span className="text-muted-foreground text-xs">{formatTime(e.at)}</span>
                </li>
              ))}
            </ul>
          </SectionCard>
        ))
      )}
    </div>
  );
}
