import { useState, useMemo } from "react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
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
  createLead,
  listCustomers,
  listProperties,
  listMembers,
  listWorkspaceCustomFields,
  checkDuplicatesBatch,
  reassignContact,
  qk,
  type ExistingContactMatch,
  type WorkspaceCustomField,
} from "@/lib/crm-api";
import { LeadOptionSelect } from "@/components/crm/LeadOptionSelect";
import { CustomFieldsRenderer } from "@/components/crm/CustomFieldsRenderer";
import { DuplicateContactModal } from "@/components/crm/DuplicateContactModal";
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
  notes: string;
  location_option_id: string | null;
  purpose_option_id: string | null;
  possession_timeline_option_id: string | null;
  transaction_timeline_option_id: string | null;
  phase_option_id: string | null;
  custom_fields: Record<string, any>;
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
  notes: "",
  location_option_id: null,
  purpose_option_id: null,
  possession_timeline_option_id: null,
  transaction_timeline_option_id: null,
  phase_option_id: null,
  custom_fields: {},
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

  const fieldsQuery = useQuery({
    queryKey: qk.customFields(workspace.id, "lead"),
    queryFn: () => listWorkspaceCustomFields(workspace.id, "lead"),
    enabled: !!workspace.id && open,
  });

  const fieldsMap = useMemo(() => {
    const map = new Map<string, WorkspaceCustomField>();
    (fieldsQuery.data || []).forEach((f) => map.set(f.field_key, f));
    return map;
  }, [fieldsQuery.data]);

  const isVisible = (key: string) => fieldsMap.get(key)?.is_visible !== false;
  const getLabel = (key: string, def: string) => fieldsMap.get(key)?.field_label || def;
  const getPlaceholder = (key: string, def: string) => fieldsMap.get(key)?.placeholder || def;
  const isRequired = (key: string, def = false) => fieldsMap.get(key)?.is_required ?? def;

  const [duplicateMatch, setDuplicateMatch] = useState<ExistingContactMatch | null>(null);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [isReassigning, setIsReassigning] = useState(false);

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
        notes: form.notes.trim() || null,
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
        custom_fields: form.custom_fields,
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Lead name is required.");
      return;
    }
    if (!form.source_option_id) {
      toast.error("Source is required. Please select a lead source.");
      return;
    }

    if (form.phone.trim() || form.email.trim()) {
      setCheckingDuplicate(true);
      try {
        const res = await checkDuplicatesBatch(workspace.id, "lead", [
          { tempId: "form", phone: form.phone.trim(), email: form.email.trim() },
        ]);
        if (res.matches["form"]) {
          setDuplicateMatch(res.matches["form"]);
          setDuplicateOpen(true);
          setCheckingDuplicate(false);
          return;
        }
      } catch {
        // Proceed if duplicate check fails
      } finally {
        setCheckingDuplicate(false);
      }
    }

    mutation.mutate();
  };

  const handleReassign = async () => {
    if (!duplicateMatch) return;
    setIsReassigning(true);
    try {
      const targetUser = form.assigned_to !== "unassigned" ? form.assigned_to : user.id;
      await reassignContact(workspace.id, "lead", duplicateMatch.id, targetUser);
      queryClient.invalidateQueries({ queryKey: qk.leads(workspace.id) });
      toast.success("Existing lead successfully reassigned!");
      setDuplicateOpen(false);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to reassign contact.");
    } finally {
      setIsReassigning(false);
    }
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
              <Label htmlFor="leadName">{getLabel("name", "Name")} *</Label>
              <Input
                id="leadName"
                placeholder={getPlaceholder("name", "Full name")}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>

            {(isVisible("phone") || isVisible("email")) && (
              <div className="grid grid-cols-2 gap-3">
                {isVisible("phone") && (
                  <div className="space-y-1.5">
                    <Label htmlFor="leadPhone">
                      {getLabel("phone", "Phone")}
                      {isRequired("phone") && <span className="text-destructive ml-0.5">*</span>}
                    </Label>
                    <Input
                      id="leadPhone"
                      placeholder={getPlaceholder("phone", "+91 98200 00000")}
                      value={form.phone}
                      required={isRequired("phone")}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    />
                  </div>
                )}
                {isVisible("email") && (
                  <div className="space-y-1.5">
                    <Label htmlFor="leadEmail">
                      {getLabel("email", "Email")}
                      {isRequired("email") && <span className="text-destructive ml-0.5">*</span>}
                    </Label>
                    <Input
                      id="leadEmail"
                      type="email"
                      placeholder={getPlaceholder("email", "name@example.com")}
                      value={form.email}
                      required={isRequired("email")}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                  </div>
                )}
              </div>
            )}

            {(isVisible("source") || isVisible("budget")) && (
              <div className="grid grid-cols-2 gap-3">
                {isVisible("source") && (
                  <LeadOptionSelect
                    type="source"
                    label={getLabel("source", "Source")}
                    required={isRequired("source", true)}
                    value={form.source_option_id}
                    onChange={(v) => setForm({ ...form, source_option_id: v })}
                    placeholder={getPlaceholder("source", "Select source")}
                  />
                )}
                {isVisible("budget") && (
                  <div className="space-y-1.5">
                    <Label htmlFor="leadBudget">
                      {getLabel("budget", `Budget (${workspace.currency})`)}
                    </Label>
                    <MoneyInput
                      id="leadBudget"
                      currency={workspace.currency}
                      placeholder={getPlaceholder("budget", "e.g. 50,00,000")}
                      value={form.budget}
                      onChange={(numericVal) =>
                        setForm({ ...form, budget: numericVal > 0 ? String(numericVal) : "" })
                      }
                      showAmountInWords
                    />
                  </div>
                )}
              </div>
            )}

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

            {!isEmployeeRole && isVisible("assigned_to") && (
              <div className="space-y-1.5">
                <Label htmlFor="leadAssigned">{getLabel("assigned_to", "Assigned To")}</Label>
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
                {isVisible("location") && (
                  <LeadOptionSelect
                    type="location"
                    label={getLabel("location", "Location")}
                    value={form.location_option_id}
                    onChange={(v) => setForm({ ...form, location_option_id: v })}
                  />
                )}
                {isVisible("purpose") && (
                  <LeadOptionSelect
                    type="purpose"
                    label={getLabel("purpose", "Purpose")}
                    value={form.purpose_option_id}
                    onChange={(v) => setForm({ ...form, purpose_option_id: v })}
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {isVisible("possession_timeline") && (
                  <LeadOptionSelect
                    type="possession_timeline"
                    label={getLabel("possession_timeline", "Possession Timeline")}
                    value={form.possession_timeline_option_id}
                    onChange={(v) => setForm({ ...form, possession_timeline_option_id: v })}
                  />
                )}
                {isVisible("transaction_timeline") && (
                  <LeadOptionSelect
                    type="transaction_timeline"
                    label={getLabel("transaction_timeline", "Transaction Timeline")}
                    value={form.transaction_timeline_option_id}
                    onChange={(v) => setForm({ ...form, transaction_timeline_option_id: v })}
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {isVisible("phase") && (
                  <LeadOptionSelect
                    type="phase"
                    label={getLabel("phase", "Phase")}
                    value={form.phase_option_id}
                    onChange={(v) => setForm({ ...form, phase_option_id: v })}
                  />
                )}
                {isVisible("requirement") && (
                  <div className="space-y-1.5">
                    <Label htmlFor="leadReq">{getLabel("requirement", "Requirement")}</Label>
                    <Input
                      id="leadReq"
                      placeholder={getPlaceholder("requirement", "e.g. 3 BHK, sea facing, Bandra")}
                      value={form.requirement}
                      onChange={(e) => setForm({ ...form, requirement: e.target.value })}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Lead Notes */}
            {isVisible("notes") && (
              <div className="space-y-1.5">
                <Label htmlFor="leadNotes">{getLabel("notes", "Notes")}</Label>
                <Textarea
                  id="leadNotes"
                  placeholder={getPlaceholder("notes", "Client conversation notes...")}
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            )}

            {/* Dynamic Custom Fields per Workspace */}
            <CustomFieldsRenderer
              workspaceId={workspace.id}
              entityType="lead"
              values={form.custom_fields}
              onChange={(newVals) => setForm({ ...form, custom_fields: newVals })}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending || checkingDuplicate}>
              {(mutation.isPending || checkingDuplicate) && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              Create Lead
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>

      <DuplicateContactModal
        open={duplicateOpen}
        onOpenChange={setDuplicateOpen}
        match={duplicateMatch}
        phoneNumber={form.phone}
        isEmployee={isEmployeeRole}
        onReassign={handleReassign}
        isReassigning={isReassigning}
      />
    </Dialog>
  );
}
