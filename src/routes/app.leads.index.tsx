import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  ChevronRight,
  Edit,
  MoreVertical,
  Plus,
  Search,
  Sparkles,
  Trash2,
  UserCheck,
  Zap,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { DataState } from "@/components/common/DataState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { listLeads, listMembers, updateLead, logLeadActivity, leadStatuses, qk, type Lead } from "@/lib/crm-api";
import { useSession } from "@/hooks/use-session";
import { formatDateTime, formatMoney } from "@/lib/format";
import { AddLeadDialog } from "@/components/crm/AddLeadDialog";
import { EditLeadDialog } from "@/components/crm/EditLeadDialog";
import { ScheduleFollowUpDialog } from "@/components/crm/ScheduleFollowUpDialog";
import { DeleteLeadDialog } from "@/components/crm/DeleteLeadDialog";
import { AssignLeadDialog } from "@/components/crm/AssignLeadDialog";
import { toast } from "sonner";

export const Route = createFileRoute("/app/leads/")({
  head: () => ({
    meta: [
      { title: "Leads · BLUETORN CRM" },
      { name: "description", content: "Every lead with source, campaign, owner and next follow-up." },
      { property: "og:title", content: "Leads · BLUETORN CRM" },
      { property: "og:description", content: "Track leads from ads, WhatsApp and your website." },
    ],
  }),
  component: LeadsPage,
});

function LeadsPage() {
  const { workspace, user, role, dbRole } = useSession();
  const queryClient = useQueryClient();

  const canAssign =
    role === "Owner" ||
    role === "Manager" ||
    role === "Super Admin" ||
    dbRole === "owner" ||
    dbRole === "manager" ||
    dbRole === "super_admin";

  const [status, setStatus] = useState<string>("All");
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  // Active dialog states
  const [assigningLead, setAssigningLead] = useState<Lead | null>(null);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [followUpLead, setFollowUpLead] = useState<Lead | null>(null);
  const [deletingLead, setDeletingLead] = useState<Lead | null>(null);

  const leadsQuery = useQuery({
    queryKey: qk.leads(workspace.id),
    queryFn: () => listLeads(workspace.id),
    enabled: !!workspace.id,
  });

  const membersQuery = useQuery({
    queryKey: qk.members(workspace.id),
    queryFn: () => listMembers(workspace.id),
    enabled: !!workspace.id,
  });
  const memberMap = new Map((membersQuery.data ?? []).map((m) => [m.id, m.full_name]));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Leads"
        description="Captured automatically from ads, forms and WhatsApp."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/app/leads/pipeline">Pipeline View</Link>
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Add Lead
            </Button>
          </>
        }
      />

      <AddLeadDialog open={addOpen} onOpenChange={setAddOpen} />

      {/* Automation Cards */}
      <SectionCard title="Automatic lead capture" description="Live sources feeding this workspace">
        {(() => {
          const allLeads = leadsQuery.data ?? [];
          const countBySource = (srcKeys: string[]) =>
            allLeads.filter((l) => srcKeys.some((k) => l.source.toLowerCase().includes(k.toLowerCase()))).length;

          const cards = [
            { name: "Meta Ads", campaign: "Facebook & Meta campaigns", src: ["Meta Ads", "Facebook"], count: countBySource(["Meta Ads", "Facebook"]) },
            { name: "Google Ads", campaign: "Search & Display ads", src: ["Google Ads"], count: countBySource(["Google Ads"]) },
            { name: "Website forms", campaign: "Contact & enquiry forms", src: ["Website"], count: countBySource(["Website"]) },
            { name: "Landing pages", campaign: "Campaign landing pages", src: ["Landing Page"], count: countBySource(["Landing Page"]) },
            { name: "WhatsApp", campaign: "Click-to-chat & API", src: ["WhatsApp"], count: countBySource(["WhatsApp"]) },
            { name: "Instagram Ads", campaign: "Reels & Story ads", src: ["Instagram"], count: countBySource(["Instagram"]) },
          ];

          return (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {cards.map((c) => (
                <div key={c.name} className="border-border bg-background flex items-center gap-3 rounded-lg border p-3">
                  <span className="bg-accent text-accent-foreground grid h-8 w-8 shrink-0 place-items-center rounded-lg">
                    <Zap className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="text-muted-foreground truncate text-xs">{c.campaign}</p>
                  </div>
                  <span className="text-muted-foreground ml-auto shrink-0 text-xs font-semibold">
                    {c.count} lead{c.count === 1 ? "" : "s"}
                  </span>
                </div>
              ))}
            </div>
          );
        })()}
      </SectionCard>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="text-muted-foreground absolute top-2.5 left-3 h-4 w-4" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search leads by name..." className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-1">
          {["All", ...leadStatuses].map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer " +
                (status === s ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground")
              }
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Leads List */}
      <DataState query={leadsQuery} loadingLabel="Loading leads…">
        {(leads) => {
          const rows = leads.filter(
            (l) =>
              (status === "All" || l.status === status) &&
              l.name.toLowerCase().includes(q.toLowerCase()),
          );

          if (rows.length === 0) {
            return (
              <EmptyState
                icon={Sparkles}
                title="No leads in this view"
                description="Adjust the filters or add a lead manually."
                action={<Button onClick={() => setAddOpen(true)}>Add Lead</Button>}
              />
            );
          }

          return (
            <SectionCard bodyClassName="p-0">
              <ul className="divide-border divide-y">
                {rows.map((l) => (
                  <li key={l.id} className="hover:bg-accent/40 transition-colors">
                    <div className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
                      {/* Clickable main link */}
                      <Link
                        to="/app/leads/$leadId"
                        params={{ leadId: l.id }}
                        className="min-w-0 flex-1 block"
                      >
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold hover:text-primary transition-colors">
                              {l.name}
                            </p>
                            <p className="text-muted-foreground truncate text-xs mt-0.5">
                              {l.requirement || "No requirement specified"} · {formatMoney(l.budget, (l.currency ?? workspace.currency) as any, true)}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <StatusBadge label={l.source} tone="info" />
                              {l.campaign && <StatusBadge label={l.campaign} tone="neutral" />}
                              {l.external_id && <StatusBadge label={l.external_id} tone="neutral" />}
                              {l.created_by && memberMap.get(l.created_by) && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-300">
                                  By: {memberMap.get(l.created_by)}
                                </span>
                              )}
                              <span className="inline-flex items-center gap-1 rounded-full bg-muted border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                                Assigned: {l.assigned_to ? memberMap.get(l.assigned_to) || "Assigned" : "Unassigned"}
                              </span>
                            </div>
                          </div>

                          <div className="shrink-0 text-right">
                            <StatusBadge label={l.status} />
                            <p className="text-muted-foreground mt-1.5 text-[11px]">
                              Score: <span className="font-semibold text-foreground">{l.score}</span>
                            </p>
                            <p className="text-muted-foreground text-[11px] mt-0.5">
                              {l.next_follow_up
                                ? `Follow-up: ${formatDateTime(l.next_follow_up)}`
                                : `Received ${formatDateTime(l.received_at)}`}
                            </p>
                          </div>
                        </div>
                      </Link>

                      {/* Row Action Dropdown */}
                      <div className="shrink-0 ml-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link to="/app/leads/$leadId" params={{ leadId: l.id }}>
                                <ChevronRight className="mr-2 h-4 w-4" /> View Details
                              </Link>
                            </DropdownMenuItem>
                            {canAssign && (
                              <DropdownMenuItem onClick={() => setAssigningLead(l)}>
                                <UserCheck className="mr-2 h-4 w-4" /> {l.assigned_to ? "Reassign Lead" : "Assign Lead"}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => setEditingLead(l)}>
                              <Edit className="mr-2 h-4 w-4" /> Edit Lead
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setFollowUpLead(l)}>
                              <CalendarClock className="mr-2 h-4 w-4" /> Schedule Follow-Up
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeletingLead(l)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Delete Lead
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </SectionCard>
          );
        }}
      </DataState>

      {/* Row Action Dialogs */}
      {assigningLead && (
        <AssignLeadDialog
          open={!!assigningLead}
          onOpenChange={(open) => !open && setAssigningLead(null)}
          lead={assigningLead}
        />
      )}

      {editingLead && (
        <EditLeadDialog
          open={!!editingLead}
          onOpenChange={(open) => !open && setEditingLead(null)}
          lead={editingLead}
        />
      )}

      {followUpLead && (
        <ScheduleFollowUpDialog
          open={!!followUpLead}
          onOpenChange={(open) => !open && setFollowUpLead(null)}
          lead={followUpLead}
        />
      )}

      {deletingLead && (
        <DeleteLeadDialog
          open={!!deletingLead}
          onOpenChange={(open) => !open && setDeletingLead(null)}
          lead={deletingLead}
        />
      )}
    </div>
  );
}
