import { useState, useMemo } from "react";
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
  createCustomer,
  listMembers,
  listWorkspaceCustomFields,
  checkDuplicatesBatch,
  reassignContact,
  customerTypes,
  customerStatuses,
  qk,
  type ExistingContactMatch,
  type WorkspaceCustomField,
} from "@/lib/crm-api";
import { CustomFieldsRenderer } from "@/components/crm/CustomFieldsRenderer";
import { DuplicateContactModal } from "@/components/crm/DuplicateContactModal";
import { MoneyInput } from "@/components/common/MoneyInput";
import { useSession } from "@/hooks/use-session";
import { toast } from "sonner";

const emptyForm = {
  name: "",
  phone: "",
  email: "",
  type: "Buyer" as string,
  status: "Prospect" as string,
  city: "",
  value: "",
  notes: "",
  assigned_to: "unassigned",
  custom_fields: {} as Record<string, any>,
};

export function AddCustomerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

  const [form, setForm] = useState(emptyForm);
  const [duplicateMatch, setDuplicateMatch] = useState<ExistingContactMatch | null>(null);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [isReassigning, setIsReassigning] = useState(false);

  const membersQuery = useQuery({
    queryKey: qk.members(workspace.id),
    queryFn: () => listMembers(workspace.id),
    enabled: !!workspace.id && open,
  });

  const fieldsQuery = useQuery({
    queryKey: qk.customFields(workspace.id, "customer"),
    queryFn: () => listWorkspaceCustomFields(workspace.id, "customer"),
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

  const mutation = useMutation({
    mutationFn: () =>
      createCustomer({
        workspace_id: workspace.id,
        created_by: user.id,
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        type: form.type,
        status: form.status,
        city: form.city.trim() || null,
        value: parseFloat(form.value) || 0,
        notes: form.notes.trim() || null,
        assigned_to: canAssign && form.assigned_to !== "unassigned" ? form.assigned_to : null,
        custom_fields: Object.keys(form.custom_fields).length > 0 ? form.custom_fields : null,
        currency: workspace.currency,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.customers(workspace.id) });
      toast.success("Customer created successfully.");
      setForm(emptyForm);
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to create customer.");
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Customer name is required.");
      return;
    }

    if (form.phone.trim() || form.email.trim()) {
      setCheckingDuplicate(true);
      try {
        const res = await checkDuplicatesBatch(workspace.id, "customer", [
          { tempId: "form", phone: form.phone.trim(), email: form.email.trim() },
        ]);
        if (res.matches["form"]) {
          setDuplicateMatch(res.matches["form"]);
          setDuplicateOpen(true);
          setCheckingDuplicate(false);
          return;
        }
      } catch {
        // Proceed if duplicate check encounters issue
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
      await reassignContact(workspace.id, "customer", duplicateMatch.id, targetUser);
      queryClient.invalidateQueries({ queryKey: qk.customers(workspace.id) });
      toast.success("Existing customer successfully reassigned!");
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
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Customer</DialogTitle>
            <DialogDescription>
              Create a customer profile with contact and classification.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Core Name */}
            <div className="space-y-1.5">
              <Label htmlFor="custName">{getLabel("name", "Name")} *</Label>
              <Input
                id="custName"
                placeholder={getPlaceholder("name", "Full name")}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>

            {/* Phone & Email */}
            {(isVisible("phone") || isVisible("email")) && (
              <div className="grid grid-cols-2 gap-3">
                {isVisible("phone") && (
                  <div className="space-y-1.5">
                    <Label htmlFor="custPhone">
                      {getLabel("phone", "Phone")}
                      {isRequired("phone") && <span className="text-destructive ml-0.5">*</span>}
                    </Label>
                    <Input
                      id="custPhone"
                      placeholder={getPlaceholder("phone", "+91 98200 00000")}
                      value={form.phone}
                      required={isRequired("phone")}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    />
                  </div>
                )}
                {isVisible("email") && (
                  <div className="space-y-1.5">
                    <Label htmlFor="custEmail">
                      {getLabel("email", "Email")}
                      {isRequired("email") && <span className="text-destructive ml-0.5">*</span>}
                    </Label>
                    <Input
                      id="custEmail"
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

            {/* Type & Status */}
            {(isVisible("type") || isVisible("status")) && (
              <div className="grid grid-cols-2 gap-3">
                {isVisible("type") && (
                  <div className="space-y-1.5">
                    <Label htmlFor="custType">{getLabel("type", "Type")}</Label>
                    <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                      <SelectTrigger id="custType">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {customerTypes.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {isVisible("status") && (
                  <div className="space-y-1.5">
                    <Label htmlFor="custStatus">{getLabel("status", "Status")}</Label>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                      <SelectTrigger id="custStatus">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {customerStatuses.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {/* City & Value */}
            {(isVisible("city") || isVisible("value")) && (
              <div className="grid grid-cols-2 gap-3">
                {isVisible("city") && (
                  <div className="space-y-1.5">
                    <Label htmlFor="custCity">{getLabel("city", "City")}</Label>
                    <Input
                      id="custCity"
                      placeholder={getPlaceholder("city", "e.g. Mumbai")}
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                    />
                  </div>
                )}

                {isVisible("value") && (
                  <div className="space-y-1.5">
                    <Label htmlFor="custValue">
                      {getLabel("value", `Value (${workspace.currency})`)}
                    </Label>
                    <MoneyInput
                      id="custValue"
                      currency={workspace.currency}
                      placeholder={getPlaceholder("value", "e.g. 50,00,000")}
                      value={form.value}
                      onChange={(numericVal) =>
                        setForm({ ...form, value: numericVal > 0 ? String(numericVal) : "" })
                      }
                      showAmountInWords
                    />
                  </div>
                )}
              </div>
            )}

            {/* Assigned Employee */}
            {canAssign && isVisible("assigned_to") && (
              <div className="space-y-1.5">
                <Label htmlFor="custAssigned">{getLabel("assigned_to", "Assigned Employee")}</Label>
                <Select
                  value={form.assigned_to}
                  onValueChange={(v) => setForm({ ...form, assigned_to: v })}
                >
                  <SelectTrigger id="custAssigned">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned (No owner)</SelectItem>
                    {membersQuery.data?.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Notes */}
            {isVisible("notes") && (
              <div className="space-y-1.5">
                <Label htmlFor="custNotes">{getLabel("notes", "Notes")}</Label>
                <Input
                  id="custNotes"
                  placeholder={getPlaceholder("notes", "Customer notes...")}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            )}

            {/* Dynamic Custom Fields */}
            <CustomFieldsRenderer
              workspaceId={workspace.id}
              entityType="customer"
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
              Create Customer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>

      <DuplicateContactModal
        open={duplicateOpen}
        onOpenChange={setDuplicateOpen}
        match={duplicateMatch}
        phoneNumber={form.phone}
        isEmployee={role === "Employee" || dbRole === "employee"}
        onReassign={handleReassign}
        isReassigning={isReassigning}
      />
    </Dialog>
  );
}
