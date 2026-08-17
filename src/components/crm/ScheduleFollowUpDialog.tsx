import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { DateTimeField } from "@/components/common/DateTimeField";
import { updateLead, logLeadActivity, qk, type Lead } from "@/lib/crm-api";
import { useSession } from "@/hooks/use-session";
import { formatDateTime } from "@/lib/format";
import { toast } from "sonner";

const followUpTypes = [
  "Call",
  "WhatsApp",
  "Meeting",
  "Site Visit",
  "Email",
  "Review Requirement",
  "Other",
] as const;

export function ScheduleFollowUpDialog({
  open,
  onOpenChange,
  lead,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead;
}) {
  const { workspace, user } = useSession();
  const queryClient = useQueryClient();

  const [dateValue, setDateValue] = useState<string | null>(lead?.next_follow_up ?? null);
  const [type, setType] = useState<string>("Call");
  const [note, setNote] = useState<string>("");

  useEffect(() => {
    if (lead) {
      setDateValue(lead.next_follow_up ?? null);
      setNote("");
    }
  }, [lead, open]);

  const saveMutation = useMutation<void, Error, boolean>({
    mutationFn: async (clear: boolean = false) => {
      const nextDate = clear ? null : dateValue;
      if (!clear && !nextDate) {
        throw new Error("Please select a date and time for the follow-up.");
      }

      await updateLead(lead.id, {
        next_follow_up: nextDate,
      });

      // Log activity
      const activityNote = clear
        ? "Scheduled follow-up cancelled / cleared."
        : `${type} scheduled for ${formatDateTime(nextDate!)}${note.trim() ? ` — "${note.trim()}"` : ""}`;

      await logLeadActivity({
        workspace_id: workspace.id,
        lead_id: lead.id,
        type: clear ? "Follow-up Cancelled" : "Follow-up",
        note: activityNote,
        actor_id: user.id,
        actor_label: user.name,
      }).catch((err) => console.warn("Activity log error", err));
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: qk.lead(lead.id) });
      queryClient.invalidateQueries({ queryKey: qk.leads(workspace.id) });
      queryClient.invalidateQueries({ queryKey: qk.leadActivity(lead.id) });
      toast.success(variables ? "Follow-up cancelled." : "Follow-up scheduled successfully.");
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to schedule follow-up.");
    },
  });

  const handleSave = () => {
    saveMutation.mutate(false);
  };

  const handleClear = () => {
    saveMutation.mutate(true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            {lead?.next_follow_up ? "Edit Follow-Up" : "Schedule Follow-Up"}
          </DialogTitle>
          <DialogDescription>
            Set the next follow-up date and reminder for {lead?.name}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3">
          <div className="space-y-1.5">
            <DateTimeField
              label="Follow-up Date & Time *"
              value={dateValue}
              onChange={setDateValue}
              withTime
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fuType">Activity Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="fuType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {followUpTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fuNote">Agenda / Notes</Label>
            <Textarea
              id="fuNote"
              placeholder="e.g. Call to discuss 3 BHK pricing and send brochures..."
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          {lead?.next_follow_up ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive self-start"
              onClick={handleClear}
              disabled={saveMutation.isPending}
            >
              <Trash2 className="mr-1.5 h-4 w-4" /> Cancel / Clear Follow-Up
            </Button>
          ) : (
            <div />
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saveMutation.isPending}
            >
              Close
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saveMutation.isPending || !dateValue}
            >
              {saveMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Save Follow-Up
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
