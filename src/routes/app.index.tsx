import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarClock,
  CheckSquare,
  Clock,
  IndianRupee,
  MapPin,
  Sparkles,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { MetricCard } from "@/components/common/MetricCard";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { AiInsightCard } from "@/components/common/AiInsightCard";
import { Timeline } from "@/components/common/Timeline";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useSession } from "@/hooks/use-session";
import { formatMoney, formatTime, type CurrencyCode } from "@/lib/format";
import { getDashboardData, qk } from "@/lib/crm-api";

export const Route = createFileRoute("/app/")({
  head: () => ({
    meta: [
      { title: "Home · BLUETORN CRM" },
      {
        name: "description",
        content: "Your daily business overview: leads, follow-ups, tasks, visits and money.",
      },
      { property: "og:title", content: "Home · BLUETORN CRM" },
      { property: "og:description", content: "Your daily business overview in BLUETORN CRM." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { user, role, can, workspace } = useSession();

  const dashboardQuery = useQuery({
    queryKey: qk.dashboard(workspace.id),
    queryFn: () => getDashboardData(workspace.id, role, user.name),
    enabled: !!workspace.id,
  });

  const dash = dashboardQuery.data;

  const pipeline = dash?.pipelineSnapshot ?? [
    { stage: "New", count: 0 },
    { stage: "Contacted", count: 0 },
    { stage: "Interested", count: 0 },
    { stage: "Visit / Meeting", count: 0 },
    { stage: "Negotiation", count: 0 },
    { stage: "Won", count: 0 },
  ];
  const maxStage = Math.max(...pipeline.map((p) => p.count), 1);

  const visits = dash?.todayScheduleVisits ?? [];
  const myTasks = dash?.todayScheduleTasks ?? [];
  const overdue = dash?.pendingInvoices ?? [];
  const activities = dash?.recentActivities ?? [];
  const upcomingVisits = dash?.upcomingVisitsList ?? [];

  const curr = (workspace.currency as CurrencyCode) || "INR";

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Good day, ${user.name.split(" ")[0]}`}
        description={`${workspace.name} · ${workspace.code} · ${role} view`}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/app/calendar">Today's schedule</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/app/leads">Work my leads</Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="New Leads"
          value={String(dash?.newLeadsCount ?? 0)}
          hint="active stage"
          icon={Sparkles}
          to="/app/leads"
        />
        <MetricCard
          label="Pending Follow-ups"
          value={String(dash?.pendingFollowUpsCount ?? 0)}
          hint="needs action"
          icon={Clock}
          to="/app/leads"
        />
        <MetricCard
          label="Tasks Due Today"
          value={String(dash?.tasksDueTodayCount ?? 0)}
          hint="assigned to you"
          icon={CheckSquare}
          to="/app/tasks"
        />
        <MetricCard
          label="Upcoming Visits"
          value={String(dash?.upcomingVisitsCount ?? 0)}
          hint="scheduled"
          icon={MapPin}
          to="/app/calendar"
        />
        {can("view.finance") ? (
          <>
            <MetricCard
              label="Revenue (MTD)"
              value={formatMoney(dash?.mtdRevenue ?? 0, curr, true)}
              icon={IndianRupee}
              to="/app/reports"
            />
            <MetricCard
              label="Pending Payments"
              value={formatMoney(dash?.pendingPaymentsAmount ?? 0, curr, true)}
              hint={`${dash?.pendingInvoicesCount ?? 0} invoices`}
              icon={Wallet}
              to="/app/finance/invoices"
            />
          </>
        ) : (
          <div className="border-border bg-card text-muted-foreground rounded-xl border border-dashed p-5 text-sm sm:col-span-2 xl:col-span-1">
            Finance figures are hidden for the Employee role.
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          className="lg:col-span-2"
          title="Today's schedule"
          description="Visits, follow-ups and meetings"
          action={
            <Button asChild variant="ghost" size="sm">
              <Link to="/app/calendar">
                Open calendar <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          }
          bodyClassName="divide-border divide-y p-0"
        >
          {visits.length === 0 && myTasks.length === 0 && (
            <p className="text-muted-foreground p-4 text-sm">
              No scheduled events or open tasks for today.
            </p>
          )}
          {visits.slice(0, 3).map((v) =>
            v.propertyId ? (
              <Link
                key={v.id}
                to="/app/properties/$propertyId"
                params={{ propertyId: v.propertyId }}
                className="hover:bg-accent/50 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors sm:px-5"
              >
                <span className="bg-accent text-accent-foreground grid h-9 w-9 shrink-0 place-items-center rounded-lg">
                  <MapPin className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    Site visit · {v.propertyName}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {v.leadName} · {v.assignedTo}
                  </span>
                </span>
                <span className="text-muted-foreground text-xs font-medium">
                  {formatTime(v.scheduledAt)}
                </span>
              </Link>
            ) : (
              <Link
                key={v.id}
                to="/app/calendar"
                className="hover:bg-accent/50 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors sm:px-5"
              >
                <span className="bg-accent text-accent-foreground grid h-9 w-9 shrink-0 place-items-center rounded-lg">
                  <MapPin className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    Site visit · {v.propertyName}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {v.leadName} · {v.assignedTo}
                  </span>
                </span>
                <span className="text-muted-foreground text-xs font-medium">
                  {formatTime(v.scheduledAt)}
                </span>
              </Link>
            ),
          )}
          {myTasks.slice(0, 3).map((t) => (
            <Link
              key={t.id}
              to="/app/tasks"
              className="hover:bg-accent/50 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors sm:px-5"
            >
              <span className="bg-accent text-accent-foreground grid h-9 w-9 shrink-0 place-items-center rounded-lg">
                <CheckSquare className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{t.title}</span>
                <span className="text-muted-foreground block truncate text-xs">
                  {t.relatedType}: {t.relatedLabel} · {t.assignedTo}
                </span>
              </span>
              <span className="text-muted-foreground text-xs font-medium">
                {formatTime(t.dueAt || new Date().toISOString())}
              </span>
            </Link>
          ))}
        </SectionCard>

        <SectionCard title="Lead pipeline snapshot" description="Live counts by stage">
          <ul className="space-y-3">
            {pipeline.map((s) => (
              <li key={s.stage}>
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate">{s.stage}</span>
                  <span className="text-muted-foreground font-medium">{s.count}</span>
                </div>
                <Progress value={(s.count / maxStage) * 100} className="mt-1.5 h-1.5" />
              </li>
            ))}
          </ul>
          <Button asChild variant="outline" size="sm" className="mt-4 w-full">
            <Link to="/app/leads/pipeline">Open pipeline</Link>
          </Button>
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard className="lg:col-span-2" title="Recent activity">
          {activities.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No recent activity logged in this workspace.
            </p>
          ) : (
            <Timeline items={activities.slice(0, 5)} />
          )}
        </SectionCard>

        <div className="space-y-4">
          {can("view.finance") && (
            <SectionCard title="Pending finance items" bodyClassName="p-0">
              {overdue.length === 0 ? (
                <p className="text-muted-foreground p-4 text-sm">No pending or overdue invoices.</p>
              ) : (
                <ul className="divide-border divide-y">
                  {overdue.map((i) => (
                    <li key={i.id}>
                      <Link
                        to="/app/finance/invoices/$invoiceId"
                        params={{ invoiceId: i.id }}
                        className="hover:bg-accent/50 flex items-center gap-3 px-4 py-3 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{i.number}</p>
                          <p className="text-muted-foreground truncate text-xs">{i.customer}</p>
                        </div>
                        <StatusBadge label={i.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          )}
          <AiInsightCard
            lines={[
              `${dash?.pendingFollowUpsCount ?? 0} leads require follow-up attention.`,
              `${dash?.newLeadsCount ?? 0} new leads active in the workspace pipeline.`,
              dash?.pendingInvoicesCount
                ? `${dash.pendingInvoicesCount} invoices pending payment settlement.`
                : "All issued invoices are settled up to date.",
            ]}
          />
          <SectionCard title="Team performance" description="Preview">
            <p className="text-muted-foreground text-sm">
              Manager and Owner roles see per-user leads, visits and revenue in Reports.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3 w-full">
              <Link to="/app/reports">View reports</Link>
            </Button>
          </SectionCard>
        </div>
      </div>

      <SectionCard title="Upcoming" description="Next 7 days" bodyClassName="p-0">
        {upcomingVisits.length === 0 ? (
          <p className="text-muted-foreground p-4 text-sm">No upcoming site visits scheduled.</p>
        ) : (
          <ul className="divide-border divide-y">
            {upcomingVisits.map((v) => (
              <li
                key={v.id}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-5"
              >
                <CalendarClock className="text-muted-foreground h-4 w-4" />
                <span className="min-w-0 truncate text-sm">
                  {v.propertyName} · {v.leadName}
                </span>
                <StatusBadge label={v.status} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
