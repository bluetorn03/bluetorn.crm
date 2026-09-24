import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Award, IndianRupee, LineChart, MapPin, Sparkles, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { MetricCard } from "@/components/common/MetricCard";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { DataState } from "@/components/common/DataState";
import { PermissionGate } from "@/components/app/PermissionGate";
import { Progress } from "@/components/ui/progress";
import {
  listLeads,
  listInvoices,
  listPayments,
  listMembers,
  leadStatuses,
  qk,
} from "@/lib/crm-api";
import { useSession } from "@/hooks/use-session";
import { formatMoney } from "@/lib/format";

export const Route = createFileRoute("/app/reports")({
  head: () => ({
    meta: [
      { title: "Reports · BLUETORN CRM" },
      { name: "description", content: "Conversion, source performance and revenue at a glance." },
      { property: "og:title", content: "Reports · BLUETORN CRM" },
      {
        property: "og:description",
        content: "Conversion, source performance and revenue at a glance.",
      },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  return (
    <PermissionGate requires="view.reports">
      <ReportsContent />
    </PermissionGate>
  );
}

const pipelineStages = leadStatuses.filter((s) => s !== "Lost");

function ReportsContent() {
  const { workspace } = useSession();

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

  const paymentsQuery = useQuery({
    queryKey: qk.payments(workspace.id),
    queryFn: () => listPayments(workspace.id),
    enabled: !!workspace.id,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports & Analytics"
        description="Conversion, source performance and team revenue at a glance."
      />

      <DataState query={leadsQuery} loadingLabel="Loading report data…">
        {(leads) => {
          const totalLeads = leads.length;
          const wonLeads = leads.filter((l) => l.status === "Won").length;
          const overallConversionRate =
            totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0;

          const wonRevenue = leads
            .filter((l) => l.status === "Won")
            .reduce((sum, l) => sum + l.budget, 0);

          const totalCollected = (paymentsQuery.data ?? [])
            .filter((p) => p.status === "Received")
            .reduce((sum, p) => sum + p.amount, 0);

          // Source stats derived from actual leads
          const sourceCounts = new Map<string, { total: number; won: number }>();
          for (const l of leads) {
            const entry = sourceCounts.get(l.source) ?? { total: 0, won: 0 };
            entry.total += 1;
            if (l.status === "Won") entry.won += 1;
            sourceCounts.set(l.source, entry);
          }
          const sourceStats = Array.from(sourceCounts.entries()).map(
            ([source, { total, won }]) => ({
              source,
              total,
              won,
              rate: total > 0 ? Math.round((won / total) * 100) : 0,
            }),
          );

          // Pipeline snapshot from actual leads
          const pipelineSnapshot = pipelineStages.map((stage) => ({
            stage,
            count: leads.filter((l) => l.status === stage).length,
          }));
          const maxPipelineCount = Math.max(1, ...pipelineSnapshot.map((p) => p.count));

          const currency = (workspace.currency ?? "INR") as any;

          return (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Overall Conversion Rate"
                  value={`${overallConversionRate}%`}
                  hint={`${wonLeads} won out of ${totalLeads} total leads`}
                  icon={TrendingUp}
                />
                <MetricCard
                  label="Total Active Leads"
                  value={String(totalLeads)}
                  hint="Captured in workspace"
                  icon={Sparkles}
                />
                <MetricCard
                  label="Payments Collected"
                  value={formatMoney(totalCollected, currency, true)}
                  hint="Received payments total"
                  icon={MapPin}
                />
                <MetricCard
                  label="Closed Revenue"
                  value={formatMoney(wonRevenue, currency, true)}
                  hint="Cumulative won deal budgets"
                  icon={IndianRupee}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <SectionCard
                  title="Pipeline Stage Distribution"
                  description="Active deals per stage"
                >
                  <ul className="space-y-3.5">
                    {pipelineSnapshot.map((s) => (
                      <li key={s.stage}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{s.stage}</span>
                          <span className="text-muted-foreground font-semibold">
                            {s.count} deals
                          </span>
                        </div>
                        <Progress
                          value={(s.count / maxPipelineCount) * 100}
                          className="mt-1.5 h-2"
                        />
                      </li>
                    ))}
                  </ul>
                </SectionCard>

                <SectionCard
                  title="Lead Source Performance"
                  description="Attribution and conversion rate by channel"
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-border text-muted-foreground border-b text-xs uppercase">
                          <th className="py-2">Source</th>
                          <th className="py-2 text-right">Leads</th>
                          <th className="py-2 text-right">Won</th>
                          <th className="py-2 text-right">Conversion</th>
                        </tr>
                      </thead>
                      <tbody className="divide-border divide-y">
                        {sourceStats.length === 0 ? (
                          <tr>
                            <td
                              colSpan={4}
                              className="py-6 text-center text-muted-foreground text-sm"
                            >
                              No lead data available yet.
                            </td>
                          </tr>
                        ) : (
                          sourceStats.map((item) => (
                            <tr key={item.source}>
                              <td className="py-2.5 font-medium">
                                <StatusBadge label={item.source} tone="info" />
                              </td>
                              <td className="py-2.5 text-right font-medium">{item.total}</td>
                              <td className="py-2.5 text-right font-medium text-success">
                                {item.won}
                              </td>
                              <td className="py-2.5 text-right font-semibold">{item.rate}%</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </SectionCard>
              </div>
            </>
          );
        }}
      </DataState>
    </div>
  );
}
