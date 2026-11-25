import { useState, useEffect, useMemo } from "react";
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
import { ImageUpload } from "@/components/common/ImageUpload";
import { MoneyInput } from "@/components/common/MoneyInput";
import { CustomFieldsRenderer } from "@/components/crm/CustomFieldsRenderer";
import {
  updateProperty,
  listMembers,
  listWorkspaceCustomFields,
  propertyTypes,
  propertyStatuses,
  qk,
  type Property,
  type WorkspaceCustomField,
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
    areaSqft:
      property.area_sqft !== undefined && property.area_sqft !== null
        ? String(property.area_sqft)
        : "",
    bedrooms:
      property.bedrooms !== undefined && property.bedrooms !== null
        ? String(property.bedrooms)
        : "",
    imageUrl: property.image_url ?? "",
    description: property.description ?? "",
    assigned_to: property.assigned_to ?? "unassigned",
    custom_fields: (property.custom_fields || {}) as Record<string, any>,
  });

  useEffect(() => {
    if (property) {
      setForm({
        name: property.name ?? "",
        location: property.location ?? "",
        type: property.type ?? "Apartment",
        status: property.status ?? "Available",
        price:
          property.price !== undefined && property.price !== null ? String(property.price) : "",
        areaSqft:
          property.area_sqft !== undefined && property.area_sqft !== null
            ? String(property.area_sqft)
            : "",
        bedrooms:
          property.bedrooms !== undefined && property.bedrooms !== null
            ? String(property.bedrooms)
            : "",
        imageUrl: property.image_url ?? "",
        description: property.description ?? "",
        assigned_to: property.assigned_to ?? "unassigned",
        custom_fields: (property.custom_fields || {}) as Record<string, any>,
      });
    }
  }, [property, open]);

  const membersQuery = useQuery({
    queryKey: qk.members(workspace.id),
    queryFn: () => listMembers(workspace.id),
    enabled: !!workspace.id && open && canAssign,
  });

  const fieldsQuery = useQuery({
    queryKey: qk.customFields(workspace.id, "property"),
    queryFn: () => listWorkspaceCustomFields(workspace.id, "property"),
    enabled: !!workspace.id && open,
  });

  const fieldsMap = useMemo(() => {
    const map = new Map<string, WorkspaceCustomField>();
    (fieldsQuery.data || []).forEach((f) => map.set(f.field_key, f));
    return map;
  }, [fieldsQuery.data]);

  const isVisible = (key: string) => fieldsMap.get(key)?.is_visible !== false;
  const getLabel = (key: string, def: string) => fieldsMap.get(key)?.field_label || def;
  const getPlaceholder = (key: string, def: string) => fieldsMap.get(key)?.placeholder || def;

  const mutation = useMutation({
    mutationFn: () => {
      const payload: Partial<Property> = {
        name: form.name.trim(),
        location: form.location.trim() || null,
        type: form.type,
        status: form.status,
        price: parseFloat(form.price) || 0,
        area_sqft: form.areaSqft ? parseInt(form.areaSqft, 10) : null,
        bedrooms: form.bedrooms ? parseInt(form.bedrooms, 10) : null,
        image_url: form.imageUrl.trim() || null,
        description: form.description.trim() || null,
        custom_fields: Object.keys(form.custom_fields).length > 0 ? form.custom_fields : null,
      };
      if (canAssign) {
        payload.assigned_to = form.assigned_to !== "unassigned" ? form.assigned_to : null;
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
            {/* Core Name */}
            <div className="space-y-1.5">
              <Label htmlFor="editPropName">{getLabel("name", "Property Name")} *</Label>
              <Input
                id="editPropName"
                placeholder={getPlaceholder("name", "e.g. Azure Heights — 1204")}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>

            {/* Location */}
            {isVisible("location") && (
              <div className="space-y-1.5">
                <Label htmlFor="editPropLocation">{getLabel("location", "Location")}</Label>
                <Input
                  id="editPropLocation"
                  placeholder={getPlaceholder("location", "e.g. Bandra West, Mumbai")}
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                />
              </div>
            )}

            {/* Type & Status */}
            {(isVisible("type") || isVisible("status")) && (
              <div className="grid grid-cols-2 gap-3">
                {isVisible("type") && (
                  <div className="space-y-1.5">
                    <Label htmlFor="editPropType">{getLabel("type", "Type")}</Label>
                    <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
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
                )}

                {isVisible("status") && (
                  <div className="space-y-1.5">
                    <Label htmlFor="editPropStatus">{getLabel("status", "Status")}</Label>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
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
                )}
              </div>
            )}

            {/* Price, Area, Bedrooms */}
            {(isVisible("price") || isVisible("area_sqft") || isVisible("bedrooms")) && (
              <div className="grid grid-cols-3 gap-3">
                {isVisible("price") && (
                  <div className="space-y-1.5">
                    <Label htmlFor="editPropPrice">
                      {getLabel("price", `Price (${workspace.currency})`)}
                    </Label>
                    <MoneyInput
                      id="editPropPrice"
                      currency={workspace.currency}
                      placeholder={getPlaceholder("price", "e.g. 1,50,00,000")}
                      value={form.price}
                      onChange={(numericVal) =>
                        setForm({ ...form, price: numericVal > 0 ? String(numericVal) : "" })
                      }
                      showAmountInWords
                    />
                  </div>
                )}

                {isVisible("area_sqft") && (
                  <div className="space-y-1.5">
                    <Label htmlFor="editPropArea">{getLabel("area_sqft", "Area (sq.ft)")}</Label>
                    <Input
                      id="editPropArea"
                      type="number"
                      min="0"
                      placeholder={getPlaceholder("area_sqft", "0")}
                      value={form.areaSqft}
                      onChange={(e) => setForm({ ...form, areaSqft: e.target.value })}
                    />
                  </div>
                )}

                {isVisible("bedrooms") && (
                  <div className="space-y-1.5">
                    <Label htmlFor="editPropBeds">{getLabel("bedrooms", "Bedrooms")}</Label>
                    <Input
                      id="editPropBeds"
                      type="number"
                      min="0"
                      placeholder={getPlaceholder("bedrooms", "0")}
                      value={form.bedrooms}
                      onChange={(e) => setForm({ ...form, bedrooms: e.target.value })}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Assigned Employee */}
            {isVisible("assigned_to") && (
              canAssign ? (
                <div className="space-y-1.5">
                  <Label htmlFor="editPropAgent">{getLabel("assigned_to", "Assigned Employee")}</Label>
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
                  <Label>{getLabel("assigned_to", "Assigned Employee")}</Label>
                  <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-foreground font-medium">
                    {assignedMember ? assignedMember.full_name : "Unassigned"}
                  </div>
                </div>
              )
            )}

            {/* Image */}
            {isVisible("image_url") && (
              <div className="space-y-1.5">
                <ImageUpload
                  value={form.imageUrl}
                  onChange={(url) => setForm({ ...form, imageUrl: url })}
                  workspaceId={workspace.id}
                  label={getLabel("image_url", "Property Photo")}
                  hint={getPlaceholder("image_url", "Upload a photo (JPG, PNG, WebP) or enter an image URL")}
                />
              </div>
            )}

            {/* Description */}
            {isVisible("description") && (
              <div className="space-y-1.5">
                <Label htmlFor="editPropDesc">{getLabel("description", "Description")}</Label>
                <Textarea
                  id="editPropDesc"
                  placeholder={getPlaceholder("description", "Key highlights, amenities or terms...")}
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
            )}

            {/* DYNAMIC WORKSPACE CUSTOM FIELDS */}
            <CustomFieldsRenderer
              workspaceId={workspace.id}
              entityType="property"
              values={form.custom_fields}
              onChange={(cf) => setForm({ ...form, custom_fields: cf })}
            />
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
