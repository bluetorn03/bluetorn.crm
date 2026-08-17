import { useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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
import { createProperty, propertyTypes, propertyStatuses, qk } from "@/lib/crm-api";
import { useSession } from "@/hooks/use-session";
import { toast } from "sonner";

const emptyForm = {
  name: "",
  location: "",
  type: "Apartment" as string,
  status: "Available" as string,
  price: "",
  areaSqft: "",
  bedrooms: "",
  description: "",
};

export function AddPropertyDialog({
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
      createProperty({
        workspace_id: workspace.id,
        created_by: user.id,
        name: form.name.trim(),
        location: form.location.trim() || null,
        type: form.type,
        status: form.status,
        price: parseFloat(form.price) || 0,
        currency: workspace.currency,
        area_sqft: form.areaSqft ? parseInt(form.areaSqft, 10) : null,
        bedrooms: form.bedrooms ? parseInt(form.bedrooms, 10) : null,
        description: form.description.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.properties(workspace.id) });
      toast.success("Property created successfully.");
      setForm(emptyForm);
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to create property.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Property name is required.");
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Property</DialogTitle>
            <DialogDescription>
              List a new property with type, pricing and details.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="propName">Property Name *</Label>
              <Input
                id="propName"
                placeholder="e.g. Azure Heights — 1204"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="propLocation">Location</Label>
              <Input
                id="propLocation"
                placeholder="e.g. Bandra West, Mumbai"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="propType">Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm({ ...form, type: v })}
                >
                  <SelectTrigger id="propType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {propertyTypes.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="propStatus">Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v })}
                >
                  <SelectTrigger id="propStatus">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {propertyStatuses.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="propPrice">Price ({workspace.currency})</Label>
                <Input
                  id="propPrice"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="propArea">Area (sq.ft)</Label>
                <Input
                  id="propArea"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={form.areaSqft}
                  onChange={(e) => setForm({ ...form, areaSqft: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="propBeds">Bedrooms</Label>
                <Input
                  id="propBeds"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={form.bedrooms}
                  onChange={(e) => setForm({ ...form, bedrooms: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="propDesc">Description</Label>
              <Input
                id="propDesc"
                placeholder="Key highlights, e.g. Sea facing, ready possession"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Create Property
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
