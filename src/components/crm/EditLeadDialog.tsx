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
  leadSources,
  leadStatuses,
  qk,
  type Lead,
} from "@/lib/crm-api";
import { useSession } from "@/hooks/use-session";
import { toast } from "sonner";

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

  const [form, setForm] = useState({
    name: lead.name ?? "",
    phone: lead.phone ?? "",
    email: lead.email ?? "",
    source: lead.source ?? "Manual Entry",
    campaign: lead.campaign ?? "",
    requirement: lead.requirement ?? "",
    budget: lead.budget !== null && lead.budget !== undefined ? String(lead.budget) : "",
    status: lead.status ?? "New",
    score: lead.score !== null && lead.score !== undefined ? String(lead.score) : "50",
    assigned_to: lead.assigned_to ?? "unassigned",
    customer_id: lead.customer_id ?? "none",
    property_id: lead.property_id ?? "none",
    notes: lead.notes ?? "",
  });

  useEffect(() => {
    if (lead) {
      setForm({
        name: lead.name ?? "",
        phone: lead.phone ?? "",
        email: lead.email ?? "",
        source: lead.source ?? "Manual Entry",
        campaign: lead.campaign ?? "",
        requirement: lead.requirement ?? "",
        budget: lead.budget !== null && lead.budget !== undefined ? String(lead.budget) : "",
        status: lead.status ?? "New",
        score: lead.score !== null && lead.score !== undefined ? String(lead.score) : "50",
        assigned_to: lead.assigned_to ?? "unassigned",
        customer_id: lead.customer_id ?? "none",
        property_id: lead.property_id ?? "none",
        notes: lead.notes ?? "",
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
      const scoreNum = parseInt(form.score, 10);

      const patchPayload: Partial<Lead> = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        source: form.source,
        campaign: form.campaign.trim() || null,
        requirement: form.requirement.trim() || null,
        budget: isNaN(budgetNum) ? 0 : budgetNum,
        status: form.status,
        customer_id: form.customer_id === "none" ? null : form.customer_id,
        property_id: form.property_id === "none" ? null : form.property_id,
        notes: form.notes.trim() || null,
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
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v })}
                >
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
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">{lead.score}/100</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="editLeadSource">Source *</Label>
                <Select
                  value={form.source}
                  onValueChange={(v) => setForm({ ...form, source: v })}
                >
                  <SelectTrigger id="editLeadSource">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {leadSources.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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

            <div className="space-y-1.5">
              <Label htmlFor="editLeadCampaign">Campaign</Label>
              <Input
                id="editLeadCampaign"
                placeholder="e.g. Sea View Launch — Jun"
                value={form.campaign}
                onChange={(e) => setForm({ ...form, campaign: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="editLeadReq">Requirement</Label>
              <Input
                id="editLeadReq"
                placeholder="e.g. 3 BHK, sea facing, Bandra"
                value={form.requirement}
                onChange={(e) => setForm({ ...form, requirement: e.target.value })}
              />
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
