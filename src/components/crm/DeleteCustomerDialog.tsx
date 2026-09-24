import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteCustomer, qk, type Customer } from "@/lib/crm-api";
import { useSession } from "@/hooks/use-session";
import { toast } from "sonner";

export function DeleteCustomerDialog({
  open,
  onOpenChange,
  customer,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer;
  onDeleted?: () => void;
}) {
  const { workspace, dbRole } = useSession();
  const queryClient = useQueryClient();

  const isEmployee = dbRole === "employee";

  const mutation = useMutation({
    mutationFn: () => deleteCustomer(customer.id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: qk.customer(customer.id) });
      queryClient.invalidateQueries({ queryKey: qk.customers(workspace.id) });
      toast.success(`Customer "${customer.name}" deleted successfully.`);
      onOpenChange(false);
      onDeleted?.();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to delete customer.");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <DialogTitle className="text-center">Delete Customer</DialogTitle>
          <DialogDescription className="text-center">
            Are you sure you want to delete{" "}
            <strong className="text-foreground">{customer.name}</strong>? This will permanently
            remove this customer record and relationship history. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {isEmployee && (
          <p className="text-xs text-destructive text-center font-medium">
            Note: Only owners or managers have permission to permanently delete customers.
          </p>
        )}

        <DialogFooter className="gap-2 sm:gap-0 mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || isEmployee}
          >
            {mutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Delete Customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
