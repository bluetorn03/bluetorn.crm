import { useState } from "react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  createLead,
  listCustomers,
  listProperties,
  listMembers,
  qk,
} from "@/lib/crm-api";
import { LeadOptionSelect } from "@/components/crm/LeadOptionSelect";
import { MoneyInput } from "@/components/common/MoneyInput";
import { useSession } from "@/hooks/use-session";
import { toast } from "sonner";

interface AddLeadFormState {
  name: string;
  phone: string;
  email: string;
  source_option_id: string | null;
  budget: string;
  customer_id: string;
  property_id: string;
  assigned_to: string;
  requirement: string;
  location_option_id: string | null;
  purpose_option_id: string | null;
  possession_timeline_option_id: string | null;
  transaction_timeline_option_id: string | null;
  phase_option_id: string | null;
}

const emptyForm: AddLeadFormState = {
  name: "",
  phone: "",
  email: "",
  source_option_id: null,
  budget: "",
  customer_id: "none",
  property_id: "none",
  assigned_to: "unassigned",
  requirement: "",
  location_option_id: null,
  purpose_option_id: null,
  possession_timeline_option_id: null,
  transaction_timeline_option_id: null,
  phase_option_id: null,
};

export function AddLeadDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { workspace, user, role, dbRole } = useSession();
  const queryClient = useQueryClient();
  const isEmployeeRole = dbRole === "employee" || role === "Employee";
  const [form, setForm] = useState<AddLeadFormState>(() => ({
    ...emptyForm,
    assigned_to: isEmployeeRole ? user.id : "unassigned",
  }));

  const customersQuery = useQuery({
    queryKey: qk.customers(workspace.id),
    queryFn: () => listCustomers(workspace.id),
    enabled: !!workspace.id && open,
  });

  const propertiesQuery = useQuery({
    queryKey: qk.properties(workspace.id),
    queryFn: () => listProperties(workspace.id),
    enabled: !!workspace.id && open,
  });

  const membersQuery = useQuery({
    queryKey: qk.members(workspace.id),
    queryFn: () => listMembers(workspace.id),
    enabled: !!workspace.id && open,
  });

  const mutation = useMutation({
    mutationFn: () =>
      createLead({
        workspace_id: workspace.id,
        created_by: user.id,
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        source_option_id: form.source_option_id,
        requirement: form.requirement.trim() || null,
        budget: parseFloat(form.budget) || 0,
        currency: workspace.currency,
        status: "New",
        customer_id: form.customer_id === "none" ? null : form.customer_id,
        property_id: form.property_id === "none" ? null : form.property_id,
        assigned_to: form.assigned_to === "unassigned" ? null : form.assigned_to,
        location_option_id: form.location_option_id,
        purpose_option_id: form.purpose_option_id,
        possession_timeline_option_id: form.possession_timeline_option_id,
        transaction_timeline_option_id: form.transaction_timeline_option_id,
        phase_option_id: form.phase_option_id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.leads(workspace.id) });
      toast.success("Lead created successfully.");
      setForm({
        ...emptyForm,
        assigned_to: isEmployeeRole ? user.id : "unassigned",
      });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to create lead.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Lead name is required.");
      return;
    }
    if (!form.source_option_id) {
      toast.error("Source is required. Please select a lead source.");
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Lead</DialogTitle>
            <DialogDescription>
              Capture a new lead with source, preferences, customer and property linking.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="leadName">Name *</Label>
              <Input
                id="leadName"
                placeholder="Full name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="leadPhone">Phone</Label>
                <Input
                  id="leadPhone"
                  placeholder="+91 98200 00000"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="leadEmail">Email</Label>
                <Input
                  id="leadEmail"
                  type="email"
                  placeholder="name@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <LeadOptionSelect
                type="source"
                label="Source"
                required
                value={form.source_option_id}
                onChange={(v) => setForm({ ...form, source_option_id: v })}
                placeholder="Select source"
              />
              <div className="space-y-1.5">
                <Label htmlFor="leadBudget">Budget ({workspace.currency})</Label>
                <MoneyInput
                  id="leadBudget"
                  currency={workspace.currency}
                  placeholder="e.g. 50,00,000"
                  value={form.budget}
                  onChange={(numericVal) =>
                    setForm({ ...form, budget: numericVal > 0 ? String(numericVal) : "" })
                  }
                  showAmountInWords
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="leadCustomer">Link Customer</Label>
                <Select
                  value={form.customer_id}
                  onValueChange={(v) => setForm({ ...form, customer_id: v })}
                >
                  <SelectTrigger id="leadCustomer">
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
                <Label htmlFor="leadProperty">Interested Property</Label>
                <Select
                  value={form.property_id}
                  onValueChange={(v) => setForm({ ...form, property_id: v })}
                >
                  <SelectTrigger id="leadProperty">
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

            {!isEmployeeRole && (
              <div className="space-y-1.5">
                <Label htmlFor="leadAssigned">Assigned To</Label>
                <Select
                  value={form.assigned_to}
                  onValueChange={(v) => setForm({ ...form, assigned_to: v })}
                >
                  <SelectTrigger id="leadAssigned">
                    <SelectValue placeholder="Unassigned" />
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
                />
                <LeadOptionSelect
                  type="purpose"
                  label="Purpose"
                  value={form.purpose_option_id}
                  onChange={(v) => setForm({ ...form, purpose_option_id: v })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <LeadOptionSelect
                  type="possession_timeline"
                  label="Possession Timeline"
                  value={form.possession_timeline_option_id}
                  onChange={(v) => setForm({ ...form, possession_timeline_option_id: v })}
                />
                <LeadOptionSelect
                  type="transaction_timeline"
                  label="Transaction Timeline"
                  value={form.transaction_timeline_option_id}
                  onChange={(v) => setForm({ ...form, transaction_timeline_option_id: v })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <LeadOptionSelect
                  type="phase"
                  label="Phase"
                  value={form.phase_option_id}
                  onChange={(v) => setForm({ ...form, phase_option_id: v })}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="leadReq">Requirement</Label>
                  <Input
                    id="leadReq"
                    placeholder="e.g. 3 BHK, sea facing, Bandra"
                    value={form.requirement}
                    onChange={(e) => setForm({ ...form, requirement: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Create Lead
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
