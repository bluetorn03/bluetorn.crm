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
  updateCustomer,
  listMembers,
  customerTypes,
  customerStatuses,
  qk,
  type Customer,
} from "@/lib/crm-api";
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
      });
    }
  }, [customer, open]);

  const membersQuery = useQuery({
    queryKey: qk.members(workspace.id),
    queryFn: () => listMembers(workspace.id),
    enabled: !!workspace.id && open,
  });

  const mutation = useMutation({
    mutationFn: () => {
      const payload: Parameters<typeof updateCustomer>[1] = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        type: form.type,
        status: form.status,
        city: form.city.trim() || null,
        value: parseFloat(form.value) || 0,
        notes: form.notes.trim() || null,
      };
      if (canAssign) {
        payload.assigned_to = form.assigned_to === "unassigned" ? null : form.assigned_to;
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
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
            <DialogDescription>
              Update contact information, classification, and details.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="editCustName">Name *</Label>
              <Input
                id="editCustName"
                placeholder="Full name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="editCustPhone">Phone</Label>
                <Input
                  id="editCustPhone"
                  placeholder="+91 98200 00000"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="editCustEmail">Email</Label>
                <Input
                  id="editCustEmail"
                  type="email"
                  placeholder="name@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="editCustType">Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm({ ...form, type: v })}
                >
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
              <div className="space-y-1.5">
                <Label htmlFor="editCustStatus">Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v })}
                >
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
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="editCustCity">City</Label>
                <Input
                  id="editCustCity"
                  placeholder="e.g. Mumbai"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="editCustValue">Customer Value ({workspace.currency})</Label>
                <Input
                  id="editCustValue"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value })}
                />
              </div>
            </div>
            {canAssign ? (
              <div className="space-y-1.5">
                <Label htmlFor="editCustAssigned">Assigned Employee</Label>
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
                <Label>Assigned Employee</Label>
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground font-medium">
                  {assignedMember ? assignedMember.full_name : "Unassigned"}
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="editCustNotes">Notes</Label>
              <Textarea
                id="editCustNotes"
                placeholder="Relationship notes or preferences..."
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
