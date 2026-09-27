import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Building2,
  CheckCircle,
  DollarSign,
  FileText,
  IndianRupee,
  Layers,
  LineChart,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { MetricCard } from "@/components/common/MetricCard";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { DataState } from "@/components/common/DataState";
import { PermissionGate } from "@/components/app/PermissionGate";
import { Progress } from "@/components/ui/progress";
import {
  listLeads,
  getFinanceReports,
  leadStatuses,
  qk,
  type FinanceReportsData,
} from "@/lib/crm-api";
import { useSession } from "@/hooks/use-session";
import { formatMoney, formatDate } from "@/lib/format";

export const Route = createFileRoute("/app/reports")({
  head: () => ({
    meta: [
      { title: "Reports & Analytics · BLUETORN CRM" },
      { name: "description", content: "Real MySQL analytics for revenue, collections, pipeline, and team performance." },
      { property: "og:title", content: "Reports & Analytics · BLUETORN CRM" },
      {
        property: "og:description",
        content: "Real MySQL analytics for revenue, collections, pipeline, and team performance.",
      },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  return (
    <PermissionGate requires={["view.reports", "finance.reports.view", "manage.finance"]}>
      <ReportsContent />
    </PermissionGate>
  );
}

const pipelineStages = leadStatuses.filter((s) => s !== "Lost");

function ReportsContent() {
  const { workspace, can } = useSession();
  const canViewFinanceReports = can("finance.reports.view");

  const leadsQuery = useQuery({
    queryKey: qk.leads(workspace.id),
    queryFn: () => listLeads(workspace.id),
    enabled: !!workspace.id,
  });

  const financeReportsQuery = useQuery({
    queryKey: ["finance-reports", workspace.id],
    queryFn: () => getFinanceReports(workspace.id),
    enabled: !!workspace.id && canViewFinanceReports,
  });

  const currency = (workspace.currency ?? "INR") as any;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Analytics"
        description="Live workspace performance aggregated directly from your MySQL database."
      />

      {/* Finance & Collections Section (Shown if user has finance.reports.view permission) */}
      {canViewFinanceReports && (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Financial & Revenue Performance
            </h2>
          </div>

          <DataState query={financeReportsQuery} loadingLabel="Aggregating finance reports from MySQL…">
            {(fin: FinanceReportsData) => (
              <>
                {/* Finance Metric Cards */}
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    label="Revenue (Month-to-Date)"
                    value={formatMoney(fin.revenueMtd, currency, true)}
                    hint="Collected in current month"
                    icon={TrendingUp}
                  />
                  <MetricCard
                    label="Revenue (Year-to-Date)"
                    value={formatMoney(fin.revenueYtd, currency, true)}
                    hint="Collected this fiscal year"
                    icon={IndianRupee}
                  />
                  <MetricCard
                    label="Total Invoiced"
                    value={formatMoney(fin.totalInvoiced, currency, true)}
                    hint={`${fin.invoiceCount} total invoices issued`}
                    icon={FileText}
                  />
                  <MetricCard
                    label="Total Collected"
                    value={formatMoney(fin.totalPaid, currency, true)}
                    hint={`${fin.paymentCount} recorded payments`}
                    icon={Wallet}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="p-4 rounded-xl border border-border bg-card">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Outstanding Receivables
                        </p>
                        <p className="text-2xl font-bold text-foreground mt-1 font-mono">
                          {formatMoney(fin.totalOutstanding, currency)}
                        </p>
                      </div>
                      <div className="h-10 w-10 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center">
                        <AlertCircle className="h-5 w-5" />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Balance pending on issued & partially paid invoices
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/5">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-xs font-semibold text-destructive uppercase tracking-wider">
                          Overdue Balance
                        </p>
                        <p className="text-2xl font-bold text-destructive mt-1 font-mono">
                          {formatMoney(fin.totalOverdue, currency)}
                        </p>
                      </div>
                      <div className="h-10 w-10 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
                        <AlertCircle className="h-5 w-5" />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Invoices past their due date with unpaid balance
                    </p>
                  </div>
                </div>

                {/* Status & Method Distributions */}
                <div className="grid gap-6 lg:grid-cols-2">
                  {/* Invoice Status Distribution */}
                  <SectionCard
                    title="Invoice Status Breakdown"
                    description="Real-time distribution across all workspace invoices."
                  >
                    <div className="space-y-3">
                      {fin.statusDistribution.length === 0 ? (
                        <p className="py-4 text-center text-xs text-muted-foreground">
                          No invoices recorded yet.
                        </p>
                      ) : (
                        fin.statusDistribution.map((s) => (
                          <div
                            key={s.status}
                            className="flex items-center justify-between p-2.5 rounded-lg bg-muted/20 border border-border"
                          >
                            <div className="flex items-center gap-2">
                              <StatusBadge
                                label={s.status}
                                tone={
                                  s.status === "Paid"
                                    ? "success"
                                    : s.status === "Overdue" || s.status === "Cancelled"
                                      ? "danger"
                                      : s.status === "Partially Paid"
                                        ? "warning"
                                        : "neutral"
                                }
                              />
                              <span className="text-xs text-muted-foreground">
                                ({s.count} {s.count === 1 ? "invoice" : "invoices"})
                              </span>
                            </div>
                            <span className="font-semibold text-sm text-foreground font-mono">
                              {formatMoney(s.total, currency)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </SectionCard>

                  {/* Payment Methods */}
                  <SectionCard
                    title="Collections by Payment Method"
                    description="Settlement channel breakdown for received funds."
                  >
                    <div className="space-y-3">
                      {fin.methodDistribution.length === 0 ? (
                        <p className="py-4 text-center text-xs text-muted-foreground">
                          No payments recorded yet.
                        </p>
                      ) : (
                        fin.methodDistribution.map((m) => (
                          <div
                            key={m.method}
                            className="flex items-center justify-between p-2.5 rounded-lg bg-muted/20 border border-border"
                          >
                            <span className="text-sm font-medium text-foreground">
                              {m.method}
                            </span>
                            <div className="text-right">
                              <span className="font-semibold text-sm text-emerald-600 dark:text-emerald-400 font-mono">
                                {formatMoney(m.total, currency)}
                              </span>
                              <span className="text-xs text-muted-foreground ml-2">
                                ({m.count} txns)
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </SectionCard>
                </div>

                {/* Team Financial Attribution */}
                {fin.teamAttribution.length > 0 && (
                  <SectionCard
                    title="Team Financial Attribution"
                    description="Invoices created and payments collected by team members."
                    bodyClassName="p-0"
                  >
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-wider">
                            <th className="px-4 py-2.5">Team Member</th>
                            <th className="px-4 py-2.5 text-right">Invoices Created</th>
                            <th className="px-4 py-2.5 text-right">Payments Recorded</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {fin.teamAttribution.map((emp) => (
                            <tr key={emp.userId} className="hover:bg-muted/20">
                              <td className="px-4 py-3 font-medium text-foreground">
                                {emp.userName}
                              </td>
                              <td className="px-4 py-3 text-right font-mono font-medium">{emp.invoicesCreated}</td>
                              <td className="px-4 py-3 text-right font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                                {emp.paymentsCollected}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </SectionCard>
                )}
              </>
            )}
          </DataState>
        </div>
      )}

      {/* CRM Leads & Pipeline Analytics */}
      <div className="space-y-6 pt-4 border-t border-border">
        <div className="flex items-center gap-2">
          <LineChart className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Sales & Lead Conversion Analytics
          </h2>
        </div>

        <DataState query={leadsQuery} loadingLabel="Loading lead analytics…">
          {(leads) => {
            const totalLeads = leads.length;
            const wonLeads = leads.filter((l) => l.status === "Won").length;
            const overallConversionRate =
              totalLeads > 0 ? Math.round((wonLeads / totalLeads) * 100) : 0;

            const wonRevenue = leads
              .filter((l) => l.status === "Won")
              .reduce((sum, l) => sum + Number(l.budget || 0), 0);

            // Source stats derived from actual database leads
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

            // Pipeline snapshot from actual database leads
            const pipelineSnapshot = pipelineStages.map((stage) => ({
              stage,
              count: leads.filter((l) => l.status === stage).length,
            }));
            const maxPipelineCount = Math.max(1, ...pipelineSnapshot.map((p) => p.count));

            return (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <MetricCard
                    label="Lead Conversion Rate"
                    value={`${overallConversionRate}%`}
                    hint={`${wonLeads} deals won out of ${totalLeads} captured`}
                    icon={TrendingUp}
                  />
                  <MetricCard
                    label="Active Workspace Leads"
                    value={String(totalLeads)}
                    hint="Stored in live MySQL CRM"
                    icon={Sparkles}
                  />
                  <MetricCard
                    label="Won Deal Pipeline Value"
                    value={formatMoney(wonRevenue, currency, true)}
                    hint="Cumulative closed deal budget"
                    icon={CheckCircle}
                  />
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <SectionCard
                    title="Pipeline Stage Distribution"
                    description="Active deals per CRM workflow stage"
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
                    description="Attribution and conversion rate by acquisition channel"
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
    </div>
  );
}
