import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { updateCustomer, listMembers, qk, type Customer } from "@/lib/crm-api";
import { useSession } from "@/hooks/use-session";
import { toast } from "sonner";

export function AssignCustomerDialog({
  open,
  onOpenChange,
  customer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
}) {
  const { workspace } = useSession();
  const queryClient = useQueryClient();
  const [assignedTo, setAssignedTo] = useState<string>("unassigned");

  useEffect(() => {
    if (customer) {
      setAssignedTo(customer.assigned_to ?? "unassigned");
    }
  }, [customer, open]);

  const membersQuery = useQuery({
    queryKey: qk.members(workspace.id),
    queryFn: () => listMembers(workspace.id),
    enabled: !!workspace.id && open,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!customer) return;
      const targetAssignedTo = assignedTo === "unassigned" ? null : assignedTo;
      return updateCustomer(customer.id, {
        assigned_to: targetAssignedTo,
      });
    },
    onSuccess: () => {
      if (customer) {
        queryClient.invalidateQueries({ queryKey: qk.customer(customer.id) });
        queryClient.invalidateQueries({ queryKey: qk.customers(workspace.id) });
      }
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      const memberName =
        assignedTo === "unassigned"
          ? "Unassigned"
          : membersQuery.data?.find((m) => m.id === assignedTo)?.full_name || "team member";
      toast.success(
        assignedTo === "unassigned"
          ? "Customer unassigned successfully."
          : `Customer assigned to ${memberName}.`,
      );
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to assign customer.");
    },
  });

  if (!customer) return null;

  const currentMember = membersQuery.data?.find((m) => m.id === customer.assigned_to);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" />
              {customer.assigned_to ? "Reassign Customer" : "Assign Customer"}
            </DialogTitle>
            <DialogDescription>
              Assign <strong className="text-foreground">{customer.name}</strong> to a team member
              in this workspace.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="rounded-md border border-border bg-muted/40 p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer:</span>
                <span className="font-semibold text-foreground">{customer.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Currently assigned to:</span>
                <span className="font-medium text-foreground">
                  {currentMember ? currentMember.full_name : "Unassigned"}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="assignCustomerEmployee">Select Team Member</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger id="assignCustomerEmployee">
                  <SelectValue placeholder="Select team member" />
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
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {customer.assigned_to ? "Save Reassignment" : "Assign Customer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
