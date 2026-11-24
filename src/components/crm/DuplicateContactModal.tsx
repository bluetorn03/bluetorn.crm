import { AlertTriangle, UserCheck, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ExistingContactMatch } from "@/lib/crm-api";

interface DuplicateContactModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  match: ExistingContactMatch | null;
  phoneNumber?: string;
  isEmployee: boolean;
  onReassign?: () => void;
  isReassigning?: boolean;
}

export function DuplicateContactModal({
  open,
  onOpenChange,
  match,
  phoneNumber,
  isEmployee,
  onReassign,
  isReassigning,
}: DuplicateContactModalProps) {
  if (!match) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-amber-500/30">
        <DialogHeader>
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-5 w-5" />
            <DialogTitle>Duplicate Contact Detected</DialogTitle>
          </div>
          <DialogDescription className="text-xs pt-1">
            An entry with this contact information already exists in your workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phone Number:</span>
              <span className="font-mono font-semibold text-foreground">
                {phoneNumber || match.phone || "N/A"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Existing Record:</span>
              <span className="font-medium text-foreground">{match.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Currently Assigned To:</span>
              <span className="font-semibold text-primary">
                {match.assignedToName || "Unassigned"}
                {match.assignedToRole ? ` (${match.assignedToRole})` : ""}
              </span>
            </div>
          </div>

          {isEmployee ? (
            <p className="text-xs text-muted-foreground leading-relaxed">
              As a team employee, you cannot create a duplicate contact. If you need to work this
              client, please contact your workspace <strong>Owner or Manager</strong> to reassign
              this contact to you.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground leading-relaxed">
              As an Owner or Manager, you can either cancel creation or immediately reassign this
              existing record to the newly selected team member.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>

          {!isEmployee && onReassign && (
            <Button
              size="sm"
              onClick={onReassign}
              disabled={isReassigning}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isReassigning ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <UserCheck className="mr-1.5 h-4 w-4" />
              )}
              Reassign Existing Record
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
