import { useState, useMemo } from "react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
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
import { ImageUpload } from "@/components/common/ImageUpload";
import { MoneyInput } from "@/components/common/MoneyInput";
import { CustomFieldsRenderer } from "@/components/crm/CustomFieldsRenderer";
import {
  createProperty,
  listMembers,
  listWorkspaceCustomFields,
  propertyTypes,
  propertyStatuses,
  qk,
  type WorkspaceCustomField,
} from "@/lib/crm-api";
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
  imageUrl: "",
  description: "",
  assigned_to: "unassigned",
  custom_fields: {} as Record<string, any>,
};

export function AddPropertyDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  }) {
  const { workspace, user, role, dbRole } = useSession();
  const queryClient = useQueryClient();

  const canAssign =
    role === "Owner" ||
    role === "Manager" ||
    role === "Super Admin" ||
    dbRole === "owner" ||
    dbRole === "manager" ||
    dbRole === "super_admin";

  const [form, setForm] = useState(emptyForm);

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
  const isRequired = (key: string, def = false) => fieldsMap.get(key)?.is_required ?? def;

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
        image_url: form.imageUrl.trim() || null,
        assigned_to: canAssign && form.assigned_to !== "unassigned" ? form.assigned_to : null,
        custom_fields: Object.keys(form.custom_fields).length > 0 ? form.custom_fields : null,
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Property</DialogTitle>
            <DialogDescription>List a new property with type, pricing and details.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Core Name - always visible */}
            <div className="space-y-1.5">
              <Label htmlFor="propName">{getLabel("name", "Property Name")} *</Label>
              <Input
                id="propName"
                placeholder={getPlaceholder("name", "e.g. Azure Heights — 1204")}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>

            {/* Location */}
            {isVisible("location") && (
              <div className="space-y-1.5">
                <Label htmlFor="propLocation">
                  {getLabel("location", "Location")}
                  {isRequired("location") && <span className="text-destructive ml-0.5">*</span>}
                </Label>
                <Input
                  id="propLocation"
                  placeholder={getPlaceholder("location", "e.g. Bandra West, Mumbai")}
                  value={form.location}
                  required={isRequired("location")}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                />
              </div>
            )}

            {/* Type & Status */}
            {(isVisible("type") || isVisible("status")) && (
              <div className="grid grid-cols-2 gap-3">
                {isVisible("type") && (
                  <div className="space-y-1.5">
                    <Label htmlFor="propType">{getLabel("type", "Type")}</Label>
                    <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
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
                )}

                {isVisible("status") && (
                  <div className="space-y-1.5">
                    <Label htmlFor="propStatus">{getLabel("status", "Status")}</Label>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
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
                )}
              </div>
            )}

            {/* Price, Area, Bedrooms */}
            {(isVisible("price") || isVisible("area_sqft") || isVisible("bedrooms")) && (
              <div className="grid grid-cols-3 gap-3">
                {isVisible("price") && (
                  <div className="space-y-1.5">
                    <Label htmlFor="propPrice">
                      {getLabel("price", `Price (${workspace.currency})`)}
                    </Label>
                    <MoneyInput
                      id="propPrice"
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
                    <Label htmlFor="propArea">{getLabel("area_sqft", "Area (sq.ft)")}</Label>
                    <Input
                      id="propArea"
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
                    <Label htmlFor="propBeds">{getLabel("bedrooms", "Bedrooms")}</Label>
                    <Input
                      id="propBeds"
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
            {canAssign && isVisible("assigned_to") && (
              <div className="space-y-1.5">
                <Label htmlFor="propAssigned">{getLabel("assigned_to", "Assigned Employee")}</Label>
                <Select
                  value={form.assigned_to}
                  onValueChange={(v) => setForm({ ...form, assigned_to: v })}
                >
                  <SelectTrigger id="propAssigned">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned (No agent)</SelectItem>
                    {membersQuery.data?.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Image Upload */}
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
                <Label htmlFor="propDesc">{getLabel("description", "Description")}</Label>
                <Input
                  id="propDesc"
                  placeholder={getPlaceholder("description", "Key highlights, e.g. Sea facing, ready possession")}
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
              Create Property
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
