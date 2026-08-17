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
import { deleteLead, qk, type Lead } from "@/lib/crm-api";
import { useSession } from "@/hooks/use-session";
import { toast } from "sonner";

export function DeleteLeadDialog({
  open,
  onOpenChange,
  lead,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead;
  onDeleted?: () => void;
}) {
  const { workspace } = useSession();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => deleteLead(lead.id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: qk.lead(lead.id) });
      queryClient.invalidateQueries({ queryKey: qk.leads(workspace.id) });
      toast.success(`Lead "${lead.name}" deleted successfully.`);
      onOpenChange(false);
      onDeleted?.();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to delete lead.");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <DialogTitle className="text-center">Delete Lead</DialogTitle>
          <DialogDescription className="text-center">
            Are you sure you want to delete <strong className="text-foreground">{lead.name}</strong>?
            This will permanently remove this lead and its associated timeline activity. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

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
            disabled={mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Delete Lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
