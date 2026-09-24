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
  updateProperty,
  listMembers,
  propertyTypes,
  propertyStatuses,
  qk,
  type Property,
} from "@/lib/crm-api";
import { useSession } from "@/hooks/use-session";
import { toast } from "sonner";

export function EditPropertyDialog({
  open,
  onOpenChange,
  property,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property: Property;
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
    name: property.name ?? "",
    location: property.location ?? "",
    type: property.type ?? "Apartment",
    status: property.status ?? "Available",
    price: property.price !== undefined && property.price !== null ? String(property.price) : "",
    areaSqft: property.area_sqft !== undefined && property.area_sqft !== null ? String(property.area_sqft) : "",
    bedrooms: property.bedrooms !== undefined && property.bedrooms !== null ? String(property.bedrooms) : "",
    imageUrl: property.image_url ?? "",
    description: property.description ?? "",
    assigned_to: property.assigned_to ?? "unassigned",
  });

  useEffect(() => {
    if (property) {
      setForm({
        name: property.name ?? "",
        location: property.location ?? "",
        type: property.type ?? "Apartment",
        status: property.status ?? "Available",
        price: property.price !== undefined && property.price !== null ? String(property.price) : "",
        areaSqft: property.area_sqft !== undefined && property.area_sqft !== null ? String(property.area_sqft) : "",
        bedrooms: property.bedrooms !== undefined && property.bedrooms !== null ? String(property.bedrooms) : "",
        imageUrl: property.image_url ?? "",
        description: property.description ?? "",
        assigned_to: property.assigned_to ?? "unassigned",
      });
    }
  }, [property, open]);

  const membersQuery = useQuery({
    queryKey: qk.members(workspace.id),
    queryFn: () => listMembers(workspace.id),
    enabled: !!workspace.id && open,
  });

  const mutation = useMutation({
    mutationFn: () => {
      const payload: Parameters<typeof updateProperty>[1] = {
        name: form.name.trim(),
        location: form.location.trim() || null,
        type: form.type,
        status: form.status,
        price: parseFloat(form.price) || 0,
        area_sqft: form.areaSqft ? parseInt(form.areaSqft, 10) : null,
        bedrooms: form.bedrooms ? parseInt(form.bedrooms, 10) : null,
        image_url: form.imageUrl.trim() || null,
        description: form.description.trim() || null,
      };
      if (canAssign) {
        payload.assigned_to = form.assigned_to === "unassigned" ? null : form.assigned_to;
      }
      return updateProperty(property.id, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.property(property.id) });
      queryClient.invalidateQueries({ queryKey: qk.properties(workspace.id) });
      toast.success("Property updated successfully.");
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update property.");
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

  const assignedMember = membersQuery.data?.find((m) => m.id === property.assigned_to);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Property</DialogTitle>
            <DialogDescription>
              Update property specifications, pricing, status, and details.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="editPropName">Property Name *</Label>
              <Input
                id="editPropName"
                placeholder="e.g. Azure Heights — 1204"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="editPropLocation">Location</Label>
              <Input
                id="editPropLocation"
                placeholder="e.g. Bandra West, Mumbai"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="editPropType">Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm({ ...form, type: v })}
                >
                  <SelectTrigger id="editPropType">
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
                <Label htmlFor="editPropStatus">Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v })}
                >
                  <SelectTrigger id="editPropStatus">
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
                <Label htmlFor="editPropPrice">Price ({workspace.currency})</Label>
                <Input
                  id="editPropPrice"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="editPropArea">Area (sq.ft)</Label>
                <Input
                  id="editPropArea"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={form.areaSqft}
                  onChange={(e) => setForm({ ...form, areaSqft: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="editPropBeds">Bedrooms</Label>
                <Input
                  id="editPropBeds"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={form.bedrooms}
                  onChange={(e) => setForm({ ...form, bedrooms: e.target.value })}
                />
              </div>
            </div>
            {canAssign ? (
              <div className="space-y-1.5">
                <Label htmlFor="editPropAgent">Assigned Employee</Label>
                <Select
                  value={form.assigned_to}
                  onValueChange={(v) => setForm({ ...form, assigned_to: v })}
                >
                  <SelectTrigger id="editPropAgent">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned (No agent)</SelectItem>
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
              <Label htmlFor="editPropImage">Image URL</Label>
              <Input
                id="editPropImage"
                placeholder="https://..."
                value={form.imageUrl}
                onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="editPropDesc">Description</Label>
              <Textarea
                id="editPropDesc"
                placeholder="Key highlights, amenities or terms..."
                rows={3}
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
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
