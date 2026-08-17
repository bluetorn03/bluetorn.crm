import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarCheck2,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  Edit,
  Mail,
  MessageCircle,
  MessageSquarePlus,
  Phone,
  Send,
  Sparkles,
  Trash2,
  UserCheck,
  Zap,
} from "lucide-react";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { DataState } from "@/components/common/DataState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getLead,
  updateLead,
  listLeadActivity,
  logLeadActivity,
  listProperties,
  listMembers,
  leadStatuses,
  qk,
  type Lead,
  type LeadActivity,
} from "@/lib/crm-api";
import { useSession } from "@/hooks/use-session";
import { formatDateTime, formatMoney } from "@/lib/format";
import { EditLeadDialog } from "@/components/crm/EditLeadDialog";
import { ScheduleFollowUpDialog } from "@/components/crm/ScheduleFollowUpDialog";
import { DeleteLeadDialog } from "@/components/crm/DeleteLeadDialog";
import { toast } from "sonner";

export const Route = createFileRoute("/app/leads/$leadId")({
  head: () => ({
    meta: [
      { title: "Lead Detail · BLUETORN CRM" },
      { name: "description", content: "Lead detail with source attribution, follow-ups, timeline and matched properties." },
      { property: "og:title", content: "Lead Detail · BLUETORN CRM" },
      { property: "og:description", content: "Lead detail with attribution, follow-ups and matched properties." },
    ],
  }),
  component: LeadDetailPage,
});

function LeadDetailPage() {
  const { leadId } = Route.useParams();
  const { workspace } = useSession();

  const leadQuery = useQuery({
    queryKey: qk.lead(leadId),
    queryFn: () => getLead(leadId),
    enabled: !!leadId,
  });

  return (
    <DataState query={leadQuery} loadingLabel="Loading lead details…">
      {(lead) => {
        if (!lead || (lead.workspace_id && lead.workspace_id !== workspace.id)) {
          return (
            <EmptyState
              icon={Sparkles}
              title="Lead not found"
              description="This lead may have been merged, deleted, or belongs to another workspace."
              action={
                <Button asChild>
                  <Link to="/app/leads">Back to leads</Link>
                </Button>
              }
            />
          );
        }
        return <LeadDetailView lead={lead} />;
      }}
    </DataState>
  );
}

function LeadDetailView({ lead }: { lead: Lead }) {
  const { workspace, user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // New activity form state
  const [activityNote, setActivityNote] = useState("");
  const [activityType, setActivityType] = useState<string>("Note");

  const activitiesQuery = useQuery({
    queryKey: qk.leadActivity(lead.id),
    queryFn: () => listLeadActivity(lead.id),
    enabled: !!lead.id,
  });

  const propertiesQuery = useQuery({
    queryKey: qk.properties(workspace.id),
    queryFn: () => listProperties(workspace.id),
    enabled: !!workspace.id,
  });

  const membersQuery = useQuery({
    queryKey: qk.members(workspace.id),
    queryFn: () => listMembers(workspace.id),
    enabled: !!workspace.id,
  });

  // Status mutation
  const statusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      await updateLead(lead.id, { status: newStatus });
      await logLeadActivity({
        workspace_id: workspace.id,
        lead_id: lead.id,
        type: "Status Change",
        note: `Status updated from ${lead.status} to ${newStatus}`,
        actor_id: user.id,
        actor_label: user.name,
      }).catch((err) => console.warn("Activity log error", err));
    },
    onSuccess: (_, newStatus) => {
      queryClient.invalidateQueries({ queryKey: qk.lead(lead.id) });
      queryClient.invalidateQueries({ queryKey: qk.leads(workspace.id) });
      queryClient.invalidateQueries({ queryKey: qk.leadActivity(lead.id) });
      toast.success(`Lead status updated to ${newStatus}`);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update status.");
    },
  });

  // Complete / Clear follow-up mutation
  const completeFollowUpMutation = useMutation({
    mutationFn: async () => {
      await updateLead(lead.id, { next_follow_up: null });
      await logLeadActivity({
        workspace_id: workspace.id,
        lead_id: lead.id,
        type: "Follow-up Completed",
        note: `Follow-up completed on ${formatDateTime(new Date().toISOString())}`,
        actor_id: user.id,
        actor_label: user.name,
      }).catch((err) => console.warn("Activity log error", err));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.lead(lead.id) });
      queryClient.invalidateQueries({ queryKey: qk.leads(workspace.id) });
      queryClient.invalidateQueries({ queryKey: qk.leadActivity(lead.id) });
      toast.success("Follow-up marked as completed.");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update follow-up.");
    },
  });

  // Activity log mutation
  const logActivityMutation = useMutation({
    mutationFn: async () => {
      if (!activityNote.trim()) throw new Error("Please enter a note or activity detail.");
      return await logLeadActivity({
        workspace_id: workspace.id,
        lead_id: lead.id,
        type: activityType,
        note: activityNote.trim(),
        actor_id: user.id,
        actor_label: user.name,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.leadActivity(lead.id) });
      setActivityNote("");
      toast.success("Activity logged to timeline.");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to log activity.");
    },
  });

  const assignedMember = membersQuery.data?.find((m) => m.id === lead.assigned_to);
  const interestedProperty = propertiesQuery.data?.find((p) => p.id === lead.property_id);
  const matchedProperties = propertiesQuery.data?.slice(0, 4) ?? [];

  const cleanPhone = lead.phone ? lead.phone.replace(/[^0-9]/g, "") : "";
  const phoneUrl = lead.phone ? `tel:${lead.phone.replace(/[^0-9+]/g, "")}` : undefined;
  const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}` : undefined;
  const mailUrl = lead.email ? `mailto:${lead.email}` : undefined;

  const isFollowUpDue = lead.next_follow_up && new Date(lead.next_follow_up) <= new Date();

  return (
    <div className="space-y-5">
      {/* Top navigation & action bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/app/leads">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Leads
          </Link>
        </Button>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Edit className="mr-1.5 h-4 w-4" /> Edit Lead
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="mr-1.5 h-4 w-4" /> Delete
          </Button>
        </div>
      </div>

      {/* Main Lead Banner */}
      <div className="bg-card border-border elev-1 rounded-xl border p-4 sm:p-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-semibold sm:text-2xl">{lead.name}</h1>
            </div>
            <p className="text-muted-foreground mt-1 truncate text-xs sm:text-sm">
              {lead.phone || "No phone"} {lead.email ? `· ${lead.email}` : ""}
            </p>
          </div>
          <div className="text-right">
            <StatusBadge label={lead.status} />
            <p className="text-muted-foreground mt-1.5 text-xs font-medium">
              Score: <span className="text-foreground font-semibold">{lead.score}/100</span>
            </p>
          </div>
        </div>

        {/* Quick Contact & Action Buttons */}
        <div className="mt-5 flex flex-wrap items-center gap-2 pt-3 border-t border-border">
          {phoneUrl ? (
            <Button size="sm" variant="outline" asChild>
              <a href={phoneUrl}>
                <Phone className="mr-1.5 h-4 w-4 text-emerald-600" /> Call
              </a>
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled>
              <Phone className="mr-1.5 h-4 w-4" /> Call
            </Button>
          )}

          {waUrl ? (
            <Button size="sm" variant="outline" asChild>
              <a href={waUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="mr-1.5 h-4 w-4 text-emerald-600" /> WhatsApp
              </a>
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled>
              <MessageCircle className="mr-1.5 h-4 w-4" /> WhatsApp
            </Button>
          )}

          {mailUrl ? (
            <Button size="sm" variant="outline" asChild>
              <a href={mailUrl}>
                <Mail className="mr-1.5 h-4 w-4 text-blue-600" /> Email
              </a>
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled>
              <Mail className="mr-1.5 h-4 w-4" /> Email
            </Button>
          )}

          <Button size="sm" onClick={() => setFollowUpOpen(true)}>
            <CalendarPlus className="mr-1.5 h-4 w-4" />
            {lead.next_follow_up ? "Edit Follow-Up" : "Schedule Follow-Up"}
          </Button>
        </div>
      </div>

      {/* Next Follow-Up Highlight Box */}
      {lead.next_follow_up && (
        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm ${
            isFollowUpDue
              ? "border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-200"
              : "border-primary/20 bg-primary/5 text-foreground"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-background/80 shadow-xs">
              <CalendarClock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">Next Scheduled Follow-Up</span>
                {isFollowUpDue && (
                  <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                    Due / Today
                  </span>
                )}
              </div>
              <p className="text-muted-foreground text-xs mt-0.5">
                {formatDateTime(lead.next_follow_up)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => completeFollowUpMutation.mutate()}
              disabled={completeFollowUpMutation.isPending}
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4 text-emerald-600" /> Mark Completed
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setFollowUpOpen(true)}>
              Reschedule
            </Button>
          </div>
        </div>
      )}

      {/* Grid Layout: Left Details, Right Sidebar */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left Column (2 Cols) */}
        <div className="space-y-4 lg:col-span-2">
          {/* Lead Details */}
          <SectionCard title="Lead details">
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              {[
                ["Requirement", lead.requirement ?? "No requirement specified"],
                [
                  "Budget",
                  lead.budget
                    ? formatMoney(lead.budget, (lead.currency ?? workspace.currency) as any)
                    : "Not specified",
                ],
                ["Assigned to", assignedMember ? assignedMember.full_name : "Unassigned"],
                ["Received", formatDateTime(lead.received_at)],
                [
                  "Next follow-up",
                  lead.next_follow_up ? formatDateTime(lead.next_follow_up) : "Not scheduled",
                ],
                ["Lead score", `${lead.score}/100`],
              ].map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-muted-foreground text-xs">{k}</dt>
                  <dd className="mt-0.5 font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </SectionCard>

          {/* Source & Attribution */}
          <SectionCard title="Source & attribution">
            <div className="flex flex-wrap gap-2">
              <StatusBadge label={lead.source} tone="info" />
              {lead.campaign && <StatusBadge label={`Campaign: ${lead.campaign}`} tone="neutral" />}
              {lead.external_id && <StatusBadge label={`External ID: ${lead.external_id}`} tone="neutral" />}
              <StatusBadge label={`Created ${formatDateTime(lead.created_at)}`} tone="neutral" />
            </div>
          </SectionCard>

          {/* Notes */}
          {lead.notes && (
            <SectionCard title="Lead Notes / Preferences">
              <p className="text-muted-foreground whitespace-pre-wrap text-sm leading-relaxed">
                {lead.notes}
              </p>
            </SectionCard>
          )}

          {/* Matched Properties */}
          <SectionCard
            title="Matched properties"
            description="Active inventory matching buyer profile"
          >
            {matchedProperties.length === 0 ? (
              <p className="text-muted-foreground text-sm">No properties found in workspace.</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {matchedProperties.map((p) => (
                  <li key={p.id}>
                    <Link
                      to="/app/properties/$propertyId"
                      params={{ propertyId: p.id }}
                      className={`border-border hover:elev-1 flex gap-3 rounded-lg border p-3 transition-shadow ${
                        p.id === lead.property_id ? "ring-2 ring-primary/40 bg-primary/5" : ""
                      }`}
                    >
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt=""
                          loading="lazy"
                          width={64}
                          height={64}
                          className="h-16 w-16 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <div className="bg-muted flex h-16 w-16 shrink-0 items-center justify-center rounded-md text-muted-foreground">
                          <Building2 className="h-6 w-6" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{p.name}</p>
                        <p className="text-muted-foreground truncate text-xs">{p.location || "—"}</p>
                        <p className="mt-1 text-xs font-semibold">
                          {formatMoney(p.price, (p.currency ?? "INR") as any, true)}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {/* Activity Timeline & Composer */}
          <SectionCard
            title="Activity & timeline"
            description="Complete history of calls, notes, and follow-ups"
          >
            {/* Quick Composer */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                logActivityMutation.mutate();
              }}
              className="mb-5 rounded-lg border border-border bg-muted/30 p-3 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MessageSquarePlus className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold">Log Activity / Note</span>
                </div>
                <Select value={activityType} onValueChange={setActivityType}>
                  <SelectTrigger className="h-8 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["Note", "Call", "WhatsApp", "Meeting", "Site Visit", "Email"].map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Textarea
                placeholder={`Write ${activityType.toLowerCase()} notes, client response or discussion details...`}
                rows={2}
                value={activityNote}
                onChange={(e) => setActivityNote(e.target.value)}
                className="text-sm bg-background"
              />

              <div className="flex justify-end">
                <Button
                  size="sm"
                  type="submit"
                  disabled={logActivityMutation.isPending || !activityNote.trim()}
                >
                  <Send className="mr-1.5 h-3.5 w-3.5" /> Post Activity
                </Button>
              </div>
            </form>

            {/* Timeline Items */}
            <DataState query={activitiesQuery} loadingLabel="Loading timeline…">
              {(activities) => {
                if (!activities || activities.length === 0) {
                  return (
                    <div className="py-6 text-center text-muted-foreground text-sm">
                      No activity recorded yet. Post a note or schedule a follow-up above.
                    </div>
                  );
                }

                return (
                  <ol className="relative space-y-4">
                    {activities.map((act, idx) => (
                      <li key={act.id} className="relative flex gap-3">
                        {idx !== activities.length - 1 && (
                          <span className="bg-border absolute top-8 left-[15px] h-[calc(100%+8px)] w-px" />
                        )}
                        <span className="bg-accent text-accent-foreground grid h-8 w-8 shrink-0 place-items-center rounded-full">
                          {act.type === "Call" && <Phone className="h-3.5 w-3.5" />}
                          {act.type === "WhatsApp" && <MessageCircle className="h-3.5 w-3.5" />}
                          {act.type === "Meeting" && <CalendarPlus className="h-3.5 w-3.5" />}
                          {act.type === "Site Visit" && <Building2 className="h-3.5 w-3.5" />}
                          {act.type === "Email" && <Mail className="h-3.5 w-3.5" />}
                          {act.type === "Status Change" && <Zap className="h-3.5 w-3.5" />}
                          {act.type === "Follow-up" && <CalendarClock className="h-3.5 w-3.5" />}
                          {act.type === "Follow-up Completed" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                          {act.type !== "Call" &&
                            act.type !== "WhatsApp" &&
                            act.type !== "Meeting" &&
                            act.type !== "Site Visit" &&
                            act.type !== "Email" &&
                            act.type !== "Status Change" &&
                            act.type !== "Follow-up" &&
                            act.type !== "Follow-up Completed" && (
                              <MessageSquarePlus className="h-3.5 w-3.5" />
                            )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium">
                              {act.actor_label || "Team member"}{" "}
                              <span className="text-muted-foreground font-normal text-xs">
                                ({act.type})
                              </span>
                            </p>
                            <span className="text-muted-foreground text-xs shrink-0">
                              {formatDateTime(act.created_at)}
                            </span>
                          </div>
                          {act.note && (
                            <p className="text-muted-foreground mt-1 text-xs whitespace-pre-wrap">
                              {act.note}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                );
              }}
            </DataState>
          </SectionCard>
        </div>

        {/* Right Column (1 Col) */}
        <div className="space-y-4">
          {/* Status Progression */}
          <SectionCard title="Lead status / Stage">
            <p className="text-muted-foreground text-xs mb-3">
              Click to advance or move the lead stage:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {leadStatuses.map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => statusMutation.mutate(s)}
                  disabled={statusMutation.isPending}
                  className={
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer " +
                    (s === lead.status
                      ? "bg-primary text-primary-foreground border-primary shadow-xs"
                      : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground")
                  }
                >
                  {s}
                </button>
              ))}
            </div>
          </SectionCard>

          {/* Interested Property */}
          <SectionCard title="Interested property">
            {interestedProperty ? (
              <Link
                to="/app/properties/$propertyId"
                params={{ propertyId: interestedProperty.id }}
                className="block group"
              >
                {interestedProperty.image_url ? (
                  <img
                    src={interestedProperty.image_url}
                    alt={interestedProperty.name}
                    loading="lazy"
                    width={400}
                    height={200}
                    className="h-32 w-full rounded-lg object-cover group-hover:opacity-90 transition-opacity"
                  />
                ) : (
                  <div className="h-28 w-full bg-muted flex items-center justify-center rounded-lg text-muted-foreground">
                    <Building2 className="h-8 w-8" />
                  </div>
                )}
                <p className="mt-2 text-sm font-semibold group-hover:text-primary transition-colors">
                  {interestedProperty.name}
                </p>
                <p className="text-muted-foreground text-xs">
                  {interestedProperty.location || "Location not set"} · {formatMoney(interestedProperty.price, (interestedProperty.currency ?? "INR") as any, true)}
                </p>
              </Link>
            ) : (
              <div className="text-muted-foreground text-sm space-y-2">
                <p>No property linked yet.</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => setEditOpen(true)}
                >
                  Link Property
                </Button>
              </div>
            )}
          </SectionCard>

          {/* Quick Actions */}
          <SectionCard title="Quick actions">
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => setFollowUpOpen(true)}
              >
                <CalendarPlus className="mr-2 h-4 w-4" /> Schedule Next Follow-Up
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => setEditOpen(true)}
              >
                <Edit className="mr-2 h-4 w-4" /> Edit Lead Details
              </Button>
              <Button asChild variant="outline" size="sm" className="w-full justify-start">
                <Link to="/app/leads/pipeline">
                  <Zap className="mr-2 h-4 w-4" /> View in Pipeline
                </Link>
              </Button>
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Dialogs */}
      <EditLeadDialog open={editOpen} onOpenChange={setEditOpen} lead={lead} />
      <ScheduleFollowUpDialog
        open={followUpOpen}
        onOpenChange={setFollowUpOpen}
        lead={lead}
      />
      <DeleteLeadDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        lead={lead}
        onDeleted={() => navigate({ to: "/app/leads" })}
      />
    </div>
  );
}
