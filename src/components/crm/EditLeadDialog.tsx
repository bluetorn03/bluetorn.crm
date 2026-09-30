import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  updateLead,
  logLeadActivity,
  listMembers,
  listProperties,
  listCustomers,
  leadStatuses,
  qk,
  type Lead,
} from "@/lib/crm-api";
import { LeadOptionSelect } from "@/components/crm/LeadOptionSelect";
import { useSession } from "@/hooks/use-session";
import { toast } from "sonner";

interface EditLeadFormState {
  name: string;
  phone: string;
  email: string;
  source_option_id: string | null;
  requirement: string;
  budget: string;
  status: string;
  score: string;
  assigned_to: string;
  customer_id: string;
  property_id: string;
  notes: string;
  location_option_id: string | null;
  purpose_option_id: string | null;
  possession_timeline_option_id: string | null;
  transaction_timeline_option_id: string | null;
  phase_option_id: string | null;
}

export function EditLeadDialog({
  open,
  onOpenChange,
  lead,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead;
}) {
  const { workspace, user, role, dbRole } = useSession();
  const queryClient = useQueryClient();

  const canAssign =
    role === "Owner" ||
    role === "Manager" ||
    role === "Super Admin" ||
    dbRole === "owner" ||
    dbRole === "manager" ||
    dbRole === "super_admin";

  const [form, setForm] = useState<EditLeadFormState>({
    name: lead.name ?? "",
    phone: lead.phone ?? "",
    email: lead.email ?? "",
    source_option_id: lead.source_option_id ?? null,
    requirement: lead.requirement ?? "",
    budget: lead.budget !== null && lead.budget !== undefined ? String(lead.budget) : "",
    status: lead.status ?? "New",
    score: lead.score !== null && lead.score !== undefined ? String(lead.score) : "50",
    assigned_to: lead.assigned_to ?? "unassigned",
    customer_id: lead.customer_id ?? "none",
    property_id: lead.property_id ?? "none",
    notes: lead.notes ?? "",
    location_option_id: lead.location_option_id ?? null,
    purpose_option_id: lead.purpose_option_id ?? null,
    possession_timeline_option_id: lead.possession_timeline_option_id ?? null,
    transaction_timeline_option_id: lead.transaction_timeline_option_id ?? null,
    phase_option_id: lead.phase_option_id ?? null,
  });

  useEffect(() => {
    if (lead) {
      setForm({
        name: lead.name ?? "",
        phone: lead.phone ?? "",
        email: lead.email ?? "",
        source_option_id: lead.source_option_id ?? null,
        requirement: lead.requirement ?? "",
        budget: lead.budget !== null && lead.budget !== undefined ? String(lead.budget) : "",
        status: lead.status ?? "New",
        score: lead.score !== null && lead.score !== undefined ? String(lead.score) : "50",
        assigned_to: lead.assigned_to ?? "unassigned",
        customer_id: lead.customer_id ?? "none",
        property_id: lead.property_id ?? "none",
        notes: lead.notes ?? "",
        location_option_id: lead.location_option_id ?? null,
        purpose_option_id: lead.purpose_option_id ?? null,
        possession_timeline_option_id: lead.possession_timeline_option_id ?? null,
        transaction_timeline_option_id: lead.transaction_timeline_option_id ?? null,
        phase_option_id: lead.phase_option_id ?? null,
      });
    }
  }, [lead, open]);

  const membersQuery = useQuery({
    queryKey: qk.members(workspace.id),
    queryFn: () => listMembers(workspace.id),
    enabled: !!workspace.id && open,
  });

  const propertiesQuery = useQuery({
    queryKey: qk.properties(workspace.id),
    queryFn: () => listProperties(workspace.id),
    enabled: !!workspace.id && open,
  });

  const customersQuery = useQuery({
    queryKey: qk.customers(workspace.id),
    queryFn: () => listCustomers(workspace.id),
    enabled: !!workspace.id && open,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const budgetNum = parseFloat(form.budget);

      const patchPayload: Partial<Lead> = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        source_option_id: form.source_option_id,
        requirement: form.requirement.trim() || null,
        budget: isNaN(budgetNum) ? 0 : budgetNum,
        status: form.status,
        customer_id: form.customer_id === "none" ? null : form.customer_id,
        property_id: form.property_id === "none" ? null : form.property_id,
        notes: form.notes.trim() || null,
        location_option_id: form.location_option_id,
        purpose_option_id: form.purpose_option_id,
        possession_timeline_option_id: form.possession_timeline_option_id,
        transaction_timeline_option_id: form.transaction_timeline_option_id,
        phase_option_id: form.phase_option_id,
      };

      if (canAssign) {
        patchPayload.assigned_to = form.assigned_to === "unassigned" ? null : form.assigned_to;
      }

      const updated = await updateLead(lead.id, patchPayload);

      // Log activity if status changed
      if (form.status !== lead.status) {
        await logLeadActivity({
          workspace_id: workspace.id,
          lead_id: lead.id,
          type: "Status Change",
          note: `Status updated from ${lead.status} to ${form.status}`,
          actor_id: user.id,
          actor_label: user.name,
        }).catch((err) => console.warn("Activity log error", err));
      }

      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.lead(lead.id) });
      queryClient.invalidateQueries({ queryKey: qk.leads(workspace.id) });
      queryClient.invalidateQueries({ queryKey: qk.leadActivity(lead.id) });
      toast.success("Lead updated successfully.");
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update lead.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Lead name is required.");
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Lead</DialogTitle>
            <DialogDescription>
              Update lead details, requirement, assignment, and status.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="editLeadName">Name *</Label>
              <Input
                id="editLeadName"
                placeholder="Full name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="editLeadPhone">Phone</Label>
                <Input
                  id="editLeadPhone"
                  placeholder="+91 98200 00000"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="editLeadEmail">Email</Label>
                <Input
                  id="editLeadEmail"
                  type="email"
                  placeholder="name@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="editLeadStatus">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger id="editLeadStatus">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {leadStatuses.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Lead Score</Label>
                <div className="flex h-9 items-center justify-between rounded-md border border-input bg-muted/30 px-3 text-xs font-medium">
                  <span className="text-muted-foreground">Deterministic Engine</span>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                    {lead.score}/100
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <LeadOptionSelect
                type="source"
                label="Source"
                required
                value={form.source_option_id}
                onChange={(v) => setForm({ ...form, source_option_id: v })}
                historicalValue={
                  lead.source_option_id
                    ? {
                        id: lead.source_option_id,
                        name: lead.source_option_name || lead.source,
                        is_active: false,
                      }
                    : null
                }
              />

              <div className="space-y-1.5">
                <Label htmlFor="editLeadBudget">Budget ({workspace.currency})</Label>
                <Input
                  id="editLeadBudget"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={form.budget}
                  onChange={(e) => setForm({ ...form, budget: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="editLeadCustomer">Link Customer</Label>
                <Select
                  value={form.customer_id}
                  onValueChange={(v) => setForm({ ...form, customer_id: v })}
                >
                  <SelectTrigger id="editLeadCustomer">
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {customersQuery.data?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="editLeadProperty">Interested Property</Label>
                <Select
                  value={form.property_id}
                  onValueChange={(v) => setForm({ ...form, property_id: v })}
                >
                  <SelectTrigger id="editLeadProperty">
                    <SelectValue placeholder="Select property" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {propertiesQuery.data?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {canAssign && (
              <div className="space-y-1.5">
                <Label htmlFor="editLeadAssigned">Assigned To</Label>
                <Select
                  value={form.assigned_to}
                  onValueChange={(v) => setForm({ ...form, assigned_to: v })}
                >
                  <SelectTrigger id="editLeadAssigned">
                    <SelectValue placeholder="Select team member" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {membersQuery.data?.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Configurable Requirements & Preferences */}
            <div className="border-t border-border pt-3 space-y-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Preferences & Timelines
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <LeadOptionSelect
                  type="location"
                  label="Location"
                  value={form.location_option_id}
                  onChange={(v) => setForm({ ...form, location_option_id: v })}
                  historicalValue={
                    lead.location_option_id
                      ? {
                          id: lead.location_option_id,
                          name: lead.location_name || "Historical Location",
                          is_active: false,
                        }
                      : null
                  }
                />
                <LeadOptionSelect
                  type="purpose"
                  label="Purpose"
                  value={form.purpose_option_id}
                  onChange={(v) => setForm({ ...form, purpose_option_id: v })}
                  historicalValue={
                    lead.purpose_option_id
                      ? {
                          id: lead.purpose_option_id,
                          name: lead.purpose_name || "Historical Purpose",
                          is_active: false,
                        }
                      : null
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <LeadOptionSelect
                  type="possession_timeline"
                  label="Possession Timeline"
                  value={form.possession_timeline_option_id}
                  onChange={(v) => setForm({ ...form, possession_timeline_option_id: v })}
                  historicalValue={
                    lead.possession_timeline_option_id
                      ? {
                          id: lead.possession_timeline_option_id,
                          name: lead.possession_timeline_name || "Historical Possession Timeline",
                          is_active: false,
                        }
                      : null
                  }
                />
                <LeadOptionSelect
                  type="transaction_timeline"
                  label="Transaction Timeline"
                  value={form.transaction_timeline_option_id}
                  onChange={(v) => setForm({ ...form, transaction_timeline_option_id: v })}
                  historicalValue={
                    lead.transaction_timeline_option_id
                      ? {
                          id: lead.transaction_timeline_option_id,
                          name: lead.transaction_timeline_name || "Historical Transaction Timeline",
                          is_active: false,
                        }
                      : null
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <LeadOptionSelect
                  type="phase"
                  label="Phase"
                  value={form.phase_option_id}
                  onChange={(v) => setForm({ ...form, phase_option_id: v })}
                  historicalValue={
                    lead.phase_option_id
                      ? {
                          id: lead.phase_option_id,
                          name: lead.phase_name || "Historical Phase",
                          is_active: false,
                        }
                      : null
                  }
                />
                <div className="space-y-1.5">
                  <Label htmlFor="editLeadReq">Requirement</Label>
                  <Input
                    id="editLeadReq"
                    placeholder="e.g. 3 BHK, sea facing, Bandra"
                    value={form.requirement}
                    onChange={(e) => setForm({ ...form, requirement: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="editLeadNotes">Notes</Label>
              <Textarea
                id="editLeadNotes"
                placeholder="Key remarks or preferences..."
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
