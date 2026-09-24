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
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md max-h-[calc(100dvh-2rem)] sm:max-h-[90dvh] flex flex-col p-4 sm:p-6 overflow-hidden gap-0 rounded-lg">
        <DialogHeader className="shrink-0 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <CalendarClock className="h-5 w-5 text-primary shrink-0" />
            <span className="truncate">{lead?.next_follow_up ? "Edit Follow-Up" : "Schedule Follow-Up"}</span>
          </DialogTitle>
          <DialogDescription className="truncate text-xs sm:text-sm">
            Set the next follow-up date and reminder for {lead?.name}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 py-4 pr-0.5 min-w-0 w-full">
          <div className="space-y-1.5 min-w-0 w-full">
            <DateTimeField
              label="Follow-up Date & Time *"
              value={dateValue}
              onChange={setDateValue}
              withTime
            />
          </div>

          <div className="space-y-1.5 min-w-0 w-full">
            <Label htmlFor="fuType">Activity Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="fuType" className="w-full h-9 text-xs sm:text-sm">
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

          <div className="space-y-1.5 min-w-0 w-full">
            <Label htmlFor="fuNote">Agenda / Notes</Label>
            <Textarea
              id="fuNote"
              placeholder="e.g. Call to discuss pricing and send brochures..."
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full text-xs sm:text-sm min-h-[70px]"
            />
          </div>
        </div>

        <DialogFooter className="shrink-0 pt-3 border-t border-border flex flex-col-reverse gap-2.5 sm:flex-row sm:items-center sm:justify-between w-full min-w-0">
          {lead?.next_follow_up ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive w-full sm:w-auto justify-center sm:justify-start text-xs sm:text-sm"
              onClick={handleClear}
              disabled={saveMutation.isPending}
            >
              <Trash2 className="mr-1.5 h-4 w-4 shrink-0" /> Clear Follow-Up
            </Button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 sm:flex-none"
              onClick={() => onOpenChange(false)}
              disabled={saveMutation.isPending}
            >
              Close
            </Button>
            <Button
              type="button"
              size="sm"
              className="flex-1 sm:flex-none"
              onClick={handleSave}
              disabled={saveMutation.isPending || !dateValue}
            >
              {saveMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin shrink-0" />}
              Save Follow-Up
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
