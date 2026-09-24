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
import { updateLead, listMembers, qk, type Lead } from "@/lib/crm-api";
import { useSession } from "@/hooks/use-session";
import { toast } from "sonner";

export function AssignLeadDialog({
  open,
  onOpenChange,
  lead,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead | null;
}) {
  const { workspace } = useSession();
  const queryClient = useQueryClient();
  const [assignedTo, setAssignedTo] = useState<string>("unassigned");

  useEffect(() => {
    if (lead) {
      setAssignedTo(lead.assigned_to ?? "unassigned");
    }
  }, [lead, open]);

  const membersQuery = useQuery({
    queryKey: qk.members(workspace.id),
    queryFn: () => listMembers(workspace.id),
    enabled: !!workspace.id && open,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!lead) return;
      const targetAssignedTo = assignedTo === "unassigned" ? null : assignedTo;
      return updateLead(lead.id, {
        assigned_to: targetAssignedTo,
      });
    },
    onSuccess: () => {
      if (lead) {
        queryClient.invalidateQueries({ queryKey: qk.lead(lead.id) });
        queryClient.invalidateQueries({ queryKey: qk.leads(workspace.id) });
        queryClient.invalidateQueries({ queryKey: qk.leadActivity(lead.id) });
      }
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      const memberName =
        assignedTo === "unassigned"
          ? "Unassigned"
          : membersQuery.data?.find((m) => m.id === assignedTo)?.full_name || "team member";
      toast.success(
        assignedTo === "unassigned"
          ? "Lead unassigned successfully."
          : `Lead assigned to ${memberName}.`,
      );
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to assign lead.");
    },
  });

  if (!lead) return null;

  const currentMember = membersQuery.data?.find((m) => m.id === lead.assigned_to);

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
              {lead.assigned_to ? "Reassign Lead" : "Assign Lead"}
            </DialogTitle>
            <DialogDescription>
              Assign <strong className="text-foreground">{lead.name}</strong> to a team member in this workspace.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="rounded-md border border-border bg-muted/40 p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Lead:</span>
                <span className="font-semibold text-foreground">{lead.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Currently assigned to:</span>
                <span className="font-medium text-foreground">
                  {currentMember ? currentMember.full_name : "Unassigned"}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="assignEmployee">Select Team Member</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger id="assignEmployee">
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
              {lead.assigned_to ? "Save Reassignment" : "Assign Lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
