import { useState, useEffect, useMemo } from "react";
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
  updateCustomer,
  listMembers,
  listWorkspaceCustomFields,
  customerTypes,
  customerStatuses,
  qk,
  type Customer,
  type WorkspaceCustomField,
} from "@/lib/crm-api";
import { CustomFieldsRenderer } from "@/components/crm/CustomFieldsRenderer";
import { MoneyInput } from "@/components/common/MoneyInput";
import { useSession } from "@/hooks/use-session";
import { toast } from "sonner";

export function EditCustomerDialog({
  open,
  onOpenChange,
  customer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer;
}) {
  const { workspace, role, dbRole } = useSession();
  const queryClient = useQueryClient();

  const canAssign =
    role === "Owner" ||
    role === "Manager" ||
    role === "Super Admin" ||
    dbRole === "owner" ||
    dbRole === "manager" ||
    dbRole === "super_admin";

  const [form, setForm] = useState({
    name: customer.name ?? "",
    phone: customer.phone ?? "",
    email: customer.email ?? "",
    type: customer.type ?? "Buyer",
    status: customer.status ?? "Prospect",
    city: customer.city ?? "",
    value: customer.value !== undefined && customer.value !== null ? String(customer.value) : "0",
    assigned_to: customer.assigned_to ?? "unassigned",
    notes: customer.notes ?? "",
    custom_fields:
      customer.custom_fields
        ? typeof customer.custom_fields === "string"
          ? JSON.parse(customer.custom_fields)
          : customer.custom_fields
        : {},
  });

  useEffect(() => {
    if (customer) {
      setForm({
        name: customer.name ?? "",
        phone: customer.phone ?? "",
        email: customer.email ?? "",
        type: customer.type ?? "Buyer",
        status: customer.status ?? "Prospect",
        city: customer.city ?? "",
        value: customer.value !== undefined && customer.value !== null ? String(customer.value) : "0",
        assigned_to: customer.assigned_to ?? "unassigned",
        notes: customer.notes ?? "",
        custom_fields:
          customer.custom_fields
            ? typeof customer.custom_fields === "string"
              ? JSON.parse(customer.custom_fields)
              : customer.custom_fields
            : {},
      });
    }
  }, [customer, open]);

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

  const mutation = useMutation({
    mutationFn: () => {
      const payload: Partial<Customer> = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        type: form.type,
        status: form.status,
        city: form.city.trim() || null,
        value: parseFloat(form.value) || 0,
        notes: form.notes.trim() || null,
        custom_fields: Object.keys(form.custom_fields).length > 0 ? form.custom_fields : null,
      };
      if (canAssign) {
        payload.assigned_to = form.assigned_to !== "unassigned" ? form.assigned_to : null;
      }
      return updateCustomer(customer.id, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.customer(customer.id) });
      queryClient.invalidateQueries({ queryKey: qk.customers(workspace.id) });
      toast.success("Customer updated successfully.");
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update customer.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Customer name is required.");
      return;
    }
    mutation.mutate();
  };

  const assignedMember = membersQuery.data?.find((m) => m.id === customer.assigned_to);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
            <DialogDescription>
              Update contact information, classification, and details.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Core Name */}
            <div className="space-y-1.5">
              <Label htmlFor="editCustName">{getLabel("name", "Name")} *</Label>
              <Input
                id="editCustName"
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
                    <Label htmlFor="editCustPhone">{getLabel("phone", "Phone")}</Label>
                    <Input
                      id="editCustPhone"
                      placeholder={getPlaceholder("phone", "+91 98200 00000")}
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    />
                  </div>
                )}
                {isVisible("email") && (
                  <div className="space-y-1.5">
                    <Label htmlFor="editCustEmail">{getLabel("email", "Email")}</Label>
                    <Input
                      id="editCustEmail"
                      type="email"
                      placeholder={getPlaceholder("email", "name@example.com")}
                      value={form.email}
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
                    <Label htmlFor="editCustType">{getLabel("type", "Type")}</Label>
                    <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                      <SelectTrigger id="editCustType">
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
                    <Label htmlFor="editCustStatus">{getLabel("status", "Status")}</Label>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                      <SelectTrigger id="editCustStatus">
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
                    <Label htmlFor="editCustCity">{getLabel("city", "City")}</Label>
                    <Input
                      id="editCustCity"
                      placeholder={getPlaceholder("city", "e.g. Mumbai")}
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                    />
                  </div>
                )}

                {isVisible("value") && (
                  <div className="space-y-1.5">
                    <Label htmlFor="editCustValue">
                      {getLabel("value", `Customer Value (${workspace.currency})`)}
                    </Label>
                    <MoneyInput
                      id="editCustValue"
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
            {isVisible("assigned_to") && (
              canAssign ? (
                <div className="space-y-1.5">
                  <Label htmlFor="editCustAssigned">{getLabel("assigned_to", "Assigned Employee")}</Label>
                  <Select
                    value={form.assigned_to}
                    onValueChange={(v) => setForm({ ...form, assigned_to: v })}
                  >
                    <SelectTrigger id="editCustAssigned">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned (No owner)</SelectItem>
                      {membersQuery.data?.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.full_name} {m.email ? `(${m.email})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>{getLabel("assigned_to", "Assigned Employee")}</Label>
                  <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground font-medium">
                    {assignedMember ? assignedMember.full_name : "Unassigned"}
                  </div>
                </div>
              )
            )}

            {/* Notes */}
            {isVisible("notes") && (
              <div className="space-y-1.5">
                <Label htmlFor="editCustNotes">{getLabel("notes", "Notes")}</Label>
                <Textarea
                  id="editCustNotes"
                  placeholder={getPlaceholder("notes", "Additional context, requirements, or discussion notes...")}
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            )}

            {/* DYNAMIC CUSTOM FIELDS */}
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
