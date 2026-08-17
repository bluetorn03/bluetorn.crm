import { useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Plus, Loader2 } from "lucide-react";
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
import { createLead, leadSources, leadStatuses, qk, type Lead } from "@/lib/crm-api";
import { useSession } from "@/hooks/use-session";
import { toast } from "sonner";

const emptyForm = {
  name: "",
  phone: "",
  email: "",
  source: "Manual Entry" as string,
  campaign: "",
  requirement: "",
  budget: "",
};

export function AddLeadDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { workspace, user } = useSession();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);

  const mutation = useMutation({
    mutationFn: () =>
      createLead({
        workspace_id: workspace.id,
        created_by: user.id,
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        source: form.source,
        campaign: form.campaign.trim() || null,
        requirement: form.requirement.trim() || null,
        budget: parseFloat(form.budget) || 0,
        currency: workspace.currency,
        status: "New",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.leads(workspace.id) });
      toast.success("Lead created successfully.");
      setForm(emptyForm);
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to create lead.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Lead name is required.");
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Lead</DialogTitle>
            <DialogDescription>
              Capture a new lead with source, contact and requirement.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="leadName">Name *</Label>
              <Input
                id="leadName"
                placeholder="Full name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="leadPhone">Phone</Label>
                <Input
                  id="leadPhone"
                  placeholder="+91 98200 00000"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="leadEmail">Email</Label>
                <Input
                  id="leadEmail"
                  type="email"
                  placeholder="name@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="leadSource">Source *</Label>
                <Select
                  value={form.source}
                  onValueChange={(v) => setForm({ ...form, source: v })}
                >
                  <SelectTrigger id="leadSource">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {leadSources.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="leadBudget">Budget ({workspace.currency})</Label>
                <Input
                  id="leadBudget"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={form.budget}
                  onChange={(e) => setForm({ ...form, budget: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="leadCampaign">Campaign</Label>
              <Input
                id="leadCampaign"
                placeholder="e.g. Sea View Launch — Jun"
                value={form.campaign}
                onChange={(e) => setForm({ ...form, campaign: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="leadReq">Requirement</Label>
              <Input
                id="leadReq"
                placeholder="e.g. 3 BHK, sea facing, Bandra"
                value={form.requirement}
                onChange={(e) => setForm({ ...form, requirement: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Create Lead
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
