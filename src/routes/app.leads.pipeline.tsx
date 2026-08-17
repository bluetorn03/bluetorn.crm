import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarClock,
  ChevronRight,
  ListFilter,
  Plus,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { DataState } from "@/components/common/DataState";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { listLeads, updateLead, logLeadActivity, leadStatuses, qk, type Lead } from "@/lib/crm-api";
import { useSession } from "@/hooks/use-session";
import { formatDateTime, formatMoney } from "@/lib/format";
import { AddLeadDialog } from "@/components/crm/AddLeadDialog";
import { toast } from "sonner";

export const Route = createFileRoute("/app/leads/pipeline")({
  head: () => ({
    meta: [
      { title: "Pipeline · BLUETORN CRM" },
      { name: "description", content: "Kanban pipeline view of your active deals." },
      { property: "og:title", content: "Pipeline · BLUETORN CRM" },
      { property: "og:description", content: "Kanban pipeline view of your active deals." },
    ],
  }),
  component: PipelinePage,
});

const pipelineStages = leadStatuses.filter((s) => s !== "Lost");

function PipelinePage() {
  const { workspace, user } = useSession();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  const leadsQuery = useQuery({
    queryKey: qk.leads(workspace.id),
    queryFn: () => listLeads(workspace.id),
    enabled: !!workspace.id,
  });

  const moveStageMutation = useMutation({
    mutationFn: async ({ leadId, currentStage, newStage }: { leadId: string; currentStage: string; newStage: string }) => {
      await updateLead(leadId, { status: newStage });
      await logLeadActivity({
        workspace_id: workspace.id,
        lead_id: leadId,
        type: "Status Change",
        note: `Pipeline stage moved from ${currentStage} to ${newStage}`,
        actor_id: user.id,
        actor_label: user.name,
      }).catch((err) => console.warn("Activity log error", err));
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: qk.leads(workspace.id) });
      queryClient.invalidateQueries({ queryKey: qk.lead(vars.leadId) });
      toast.success(`Moved deal to "${vars.newStage}"`);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to move stage.");
    },
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pipeline"
        description="Active deals organized across sales progression stages."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/app/leads">
                <ListFilter className="mr-1.5 h-4 w-4" /> List View
              </Link>
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Add Lead
            </Button>
          </>
        }
      />

      <AddLeadDialog open={addOpen} onOpenChange={setAddOpen} />

      <DataState query={leadsQuery} loadingLabel="Loading pipeline deals…">
        {(leads) => {
          const columns = pipelineStages.map((stage) => ({
            stage,
            items: leads.filter((l) => l.status === stage),
          }));

          return (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
              {columns.map((col) => {
                const totalValue = col.items.reduce((sum, item) => sum + (Number(item.budget) || 0), 0);
                return (
                  <SectionCard
                    key={col.stage}
                    title={col.stage}
                    description={`${col.items.length} deals · ${formatMoney(totalValue, (workspace.currency ?? "INR") as any, true)}`}
                    bodyClassName="p-2 space-y-2 bg-muted/20 min-h-[400px]"
                  >
                    {col.items.length === 0 ? (
                      <div className="p-4 text-center">
                        <EmptyState icon={Sparkles} title="Empty" description="No deals in this stage." />
                      </div>
                    ) : (
                      <ul className="space-y-2">
                        {col.items.map((l) => (
                          <li
                            key={l.id}
                            className="bg-card border-border rounded-lg border p-3 shadow-xs hover:border-primary/50 transition-colors"
                          >
                            <Link to="/app/leads/$leadId" params={{ leadId: l.id }} className="block">
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-semibold text-sm hover:text-primary transition-colors truncate">
                                  {l.name}
                                </p>
                                <span className="text-[11px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                  Score: {l.score}
                                </span>
                              </div>

                              <p className="text-muted-foreground truncate text-xs mt-1">
                                {l.requirement || "No requirement"}
                              </p>

                              <div className="mt-2 flex items-center justify-between">
                                <p className="text-xs font-bold text-foreground">
                                  {formatMoney(l.budget, (l.currency ?? workspace.currency) as any, true)}
                                </p>
                                <StatusBadge label={l.source} tone="neutral" />
                              </div>

                              {l.next_follow_up && (
                                <p className="text-[11px] text-primary mt-2 flex items-center gap-1">
                                  <CalendarClock className="h-3 w-3" />
                                  {formatDateTime(l.next_follow_up)}
                                </p>
                              )}
                            </Link>

                            {/* Quick Stage Move Dropdown */}
                            <div className="mt-2.5 pt-2 border-t border-border flex items-center justify-between">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                                  >
                                    Move stage <ChevronRight className="ml-1 h-3 w-3" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start">
                                  {leadStatuses.map((targetStage) => (
                                    <DropdownMenuItem
                                      key={targetStage}
                                      disabled={targetStage === l.status}
                                      onClick={() =>
                                        moveStageMutation.mutate({
                                          leadId: l.id,
                                          currentStage: l.status,
                                          newStage: targetStage,
                                        })
                                      }
                                    >
                                      {targetStage}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>

                              <Button asChild variant="ghost" size="sm" className="h-6 px-2 text-[11px]">
                                <Link to="/app/leads/$leadId" params={{ leadId: l.id }}>
                                  Details
                                </Link>
                              </Button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </SectionCard>
                );
              })}
            </div>
          );
        }}
      </DataState>
    </div>
  );
}
