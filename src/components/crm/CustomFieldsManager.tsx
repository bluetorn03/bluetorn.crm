import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  Edit2,
  Layers,
  Loader2,
  Check,
  Eye,
  EyeOff,
  ShieldAlert,
  Sparkles,
  X,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listWorkspaceCustomFields,
  saveWorkspaceCustomField,
  deleteWorkspaceCustomField,
  qk,
  type CustomFieldEntity,
  type CustomFieldType,
  type WorkspaceCustomField,
} from "@/lib/crm-api";

interface CustomFieldsManagerProps {
  workspaceId: string;
}

export function CustomFieldsManager({ workspaceId }: CustomFieldsManagerProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<CustomFieldEntity>("lead");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<WorkspaceCustomField | null>(null);

  const [form, setForm] = useState({
    fieldKey: "",
    fieldLabel: "",
    placeholder: "",
    fieldType: "text" as CustomFieldType,
    optionsList: [] as string[],
    newOptionInput: "",
    isRequired: false,
    isUnique: false,
    isSystem: false,
    isVisible: true,
    sortOrder: 0,
  });

  const fieldsQuery = useQuery({
    queryKey: qk.customFields(workspaceId, activeTab),
    queryFn: () => listWorkspaceCustomFields(workspaceId, activeTab),
    enabled: Boolean(workspaceId),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Include any typed option that wasn't added with button yet
      let finalOptions = [...form.optionsList];
      if (form.newOptionInput.trim() && !finalOptions.includes(form.newOptionInput.trim())) {
        finalOptions.push(form.newOptionInput.trim());
      }

      await saveWorkspaceCustomField({
        workspaceId,
        fieldId: editingField?.id ?? null,
        entityType: activeTab,
        fieldKey: form.fieldKey,
        fieldLabel: form.fieldLabel,
        placeholder: form.placeholder.trim() || null,
        fieldType: form.fieldType,
        options: form.fieldType === "select" ? finalOptions : null,
        isRequired: form.isRequired,
        isUnique: form.isUnique,
        isSystem: form.isSystem,
        isVisible: form.isVisible,
        sortOrder: Number(form.sortOrder || 0),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["custom-fields", workspaceId] });
      await queryClient.refetchQueries({ queryKey: ["custom-fields", workspaceId] });
      toast.success(
        editingField ? "Field configuration updated successfully" : "Custom field created successfully",
      );
      setDialogOpen(false);
      resetForm();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to save field configuration");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (field: WorkspaceCustomField) => {
      await deleteWorkspaceCustomField(workspaceId, field.id, activeTab);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["custom-fields", workspaceId] });
      await queryClient.refetchQueries({ queryKey: ["custom-fields", workspaceId] });
      toast.success("Field configuration updated");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update field");
    },
  });

  const toggleVisibilityMutation = useMutation({
    mutationFn: async (field: WorkspaceCustomField) => {
      if (field.field_key === "name") {
        toast.error("Core Name column cannot be hidden.");
        return;
      }
      await saveWorkspaceCustomField({
        workspaceId,
        fieldId: field.id,
        entityType: activeTab,
        fieldKey: field.field_key,
        fieldLabel: field.field_label,
        placeholder: field.placeholder,
        fieldType: field.field_type,
        options: field.options,
        isRequired: field.is_required,
        isUnique: field.is_unique,
        isSystem: field.is_system,
        isVisible: !field.is_visible,
        sortOrder: field.sort_order,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["custom-fields", workspaceId] });
      await queryClient.refetchQueries({ queryKey: ["custom-fields", workspaceId] });
      toast.success("Field visibility toggled successfully");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to toggle field visibility");
    },
  });

  const resetForm = () => {
    setEditingField(null);
    setForm({
      fieldKey: "",
      fieldLabel: "",
      placeholder: "",
      fieldType: "text",
      optionsList: [],
      newOptionInput: "",
      isRequired: false,
      isUnique: false,
      isSystem: false,
      isVisible: true,
      sortOrder: (fieldsQuery.data?.length ?? 0) + 1,
    });
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (f: WorkspaceCustomField) => {
    setEditingField(f);
    setForm({
      fieldKey: f.field_key,
      fieldLabel: f.field_label,
      placeholder: f.placeholder || "",
      fieldType: f.field_type,
      optionsList: Array.isArray(f.options) ? [...f.options] : [],
      newOptionInput: "",
      isRequired: f.is_required,
      isUnique: f.is_unique,
      isSystem: f.is_system,
      isVisible: f.is_visible,
      sortOrder: f.sort_order,
    });
    setDialogOpen(true);
  };

  const handleAddOption = () => {
    const val = form.newOptionInput.trim();
    if (!val) return;
    // Support comma separated copy-paste
    const items = val.split(",").map((s) => s.trim()).filter(Boolean);
    const updated = [...form.optionsList];
    for (const item of items) {
      if (!updated.includes(item)) {
        updated.push(item);
      }
    }
    setForm({ ...form, optionsList: updated, newOptionInput: "" });
  };

  const handleRemoveOption = (indexToRemove: number) => {
    setForm({
      ...form,
      optionsList: form.optionsList.filter((_, i) => i !== indexToRemove),
    });
  };

  const allFields = fieldsQuery.data || [];
  const systemFields = allFields.filter((f) => f.is_system);
  const customFields = allFields.filter((f) => !f.is_system);

  return (
    <div className="space-y-6">
      {/* Top Header & Entity Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">Columns & Field Customization</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure default and bespoke input fields for Leads, Customers, and Properties.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as CustomFieldEntity)}
            className="w-auto"
          >
            <TabsList className="bg-muted/50 p-1">
              <TabsTrigger value="lead" className="text-xs px-3">
                Leads ({allFields.filter((f) => f.entity_type === "lead").length || 13})
              </TabsTrigger>
              <TabsTrigger value="customer" className="text-xs px-3">
                Customers ({allFields.filter((f) => f.entity_type === "customer").length || 9})
              </TabsTrigger>
              <TabsTrigger value="property" className="text-xs px-3">
                Properties ({allFields.filter((f) => f.entity_type === "property").length || 10})
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Button size="sm" onClick={openCreateDialog} className="shadow-xs">
            <Plus className="mr-1.5 h-4 w-4" /> Add Custom Field
          </Button>
        </div>
      </div>

      {/* SECTION 1: DEFAULT SYSTEM COLUMNS */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <span>Default System Columns</span>
              <Badge variant="outline" className="text-[11px] font-normal py-0">
                {systemFields.length} fields
              </Badge>
            </h4>
            <p className="text-xs text-muted-foreground">
              Standard CRM inputs for {activeTab}s. You can rename labels, add placeholders, adjust dropdown choices, or hide unused fields without losing historical data.
            </p>
          </div>
        </div>

        <div className="border border-border rounded-xl divide-y divide-border overflow-hidden bg-card shadow-2xs">
          {systemFields.map((f: WorkspaceCustomField) => {
            const isName = f.field_key === "name";
            return (
              <div
                key={f.id}
                className={`p-3.5 flex items-center justify-between gap-3 transition-colors ${
                  f.is_visible ? "hover:bg-muted/20" : "bg-muted/10 opacity-70"
                }`}
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-foreground">{f.field_label}</span>
                    <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-mono">
                      {f.field_key}
                    </code>

                    {isName ? (
                      <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border-transparent gap-1">
                        <Lock className="h-2.5 w-2.5" /> Core Mandatory
                      </Badge>
                    ) : f.is_required ? (
                      <Badge variant="destructive" className="text-[10px] py-0">
                        Required
                      </Badge>
                    ) : null}

                    {f.is_unique && (
                      <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-200 dark:border-blue-900 py-0">
                        Unique Value
                      </Badge>
                    )}

                    {!f.is_visible && (
                      <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-transparent py-0">
                        Hidden in Forms
                      </Badge>
                    )}
                  </div>

                  <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                    <span className="capitalize font-medium text-foreground/80">{f.field_type}</span>
                    {f.placeholder && <span>· Placeholder: "{f.placeholder}"</span>}
                    {f.field_type === "select" && f.options && f.options.length > 0 && (
                      <span className="truncate max-w-md">· Choices: {f.options.slice(0, 5).join(", ")}{f.options.length > 5 ? ` +${f.options.length - 5} more` : ""}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => openEditDialog(f)}
                  >
                    <Edit2 className="h-3.5 w-3.5 mr-1" /> Edit
                  </Button>

                  {!isName && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-8 px-2.5 text-xs ${
                        f.is_visible
                          ? "text-muted-foreground hover:text-amber-600"
                          : "text-primary hover:text-primary/80"
                      }`}
                      title={f.is_visible ? "Hide this field in forms" : "Restore this field in forms"}
                      disabled={toggleVisibilityMutation.isPending}
                      onClick={() => toggleVisibilityMutation.mutate(f)}
                    >
                      {f.is_visible ? (
                        <>
                          <EyeOff className="h-3.5 w-3.5 mr-1" /> Hide
                        </>
                      ) : (
                        <>
                          <Eye className="h-3.5 w-3.5 mr-1" /> Show
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 2: CUSTOM INPUT COLUMNS */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <span>Custom Input Columns</span>
              <Badge variant="outline" className="text-[11px] font-normal py-0">
                {customFields.length} custom
              </Badge>
            </h4>
            <p className="text-xs text-muted-foreground">
              Bespoke columns created specifically for this workspace. These fields appear seamlessly in add, edit, and detail views.
            </p>
          </div>
        </div>

        {customFields.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl p-8 text-center bg-muted/10">
            <Layers className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-70" />
            <h4 className="text-sm font-medium">No custom fields created yet</h4>
            <p className="text-xs text-muted-foreground mt-1 mb-4 max-w-sm mx-auto">
              Need extra details for {activeTab}s? (e.g. "Preferred Floor", "Loan Approved", "Facing", "Token Amount"). Add your custom field below.
            </p>
            <Button size="sm" variant="outline" onClick={openCreateDialog}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add custom field
            </Button>
          </div>
        ) : (
          <div className="border border-border rounded-xl divide-y divide-border overflow-hidden bg-card shadow-2xs">
            {customFields.map((f: WorkspaceCustomField) => (
              <div
                key={f.id}
                className="p-3.5 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-foreground">{f.field_label}</span>
                    <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-mono">
                      {f.field_key}
                    </code>

                    {f.is_required && (
                      <Badge variant="destructive" className="text-[10px] py-0">
                        Required
                      </Badge>
                    )}

                    {f.is_unique && (
                      <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-200 dark:border-blue-900 py-0">
                        Unique
                      </Badge>
                    )}
                  </div>

                  <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                    <span className="capitalize font-medium text-foreground/80">{f.field_type}</span>
                    {f.placeholder && <span>· Placeholder: "{f.placeholder}"</span>}
                    {f.field_type === "select" && f.options && f.options.length > 0 && (
                      <span className="truncate max-w-md">· Choices: {f.options.join(", ")}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => openEditDialog(f)}
                  >
                    <Edit2 className="h-3.5 w-3.5 mr-1" /> Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
                    disabled={deleteMutation.isPending}
                    title="Delete custom field"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete custom field "${f.field_label}"? Existing recorded data will remain safe.`,
                        )
                      ) {
                        deleteMutation.mutate(f);
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CREATE / EDIT FIELD DIALOG */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingField
                ? editingField.is_system
                  ? `Configure System Field: ${editingField.field_label}`
                  : `Edit Custom Field: ${editingField.field_label}`
                : `Add Custom ${activeTab.toUpperCase()} Field`}
            </DialogTitle>
            <DialogDescription>
              {editingField?.is_system
                ? "Customize the label, placeholder, and dropdown choices for this standard CRM input."
                : "Define the input label, unique key, placeholder, and choices for this workspace column."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Field Label *</Label>
              <Input
                placeholder="e.g. Preferred Floor"
                value={form.fieldLabel}
                onChange={(e) => {
                  const val = e.target.value;
                  const autoKey =
                    !editingField
                      ? val
                          .toLowerCase()
                          .replace(/[^a-z0-9_]/g, "_")
                          .slice(0, 40)
                      : form.fieldKey;
                  setForm({ ...form, fieldLabel: val, fieldKey: autoKey });
                }}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Field Key (Unique Identifier)</Label>
              <Input
                placeholder="e.g. preferred_floor"
                value={form.fieldKey}
                disabled={Boolean(editingField)}
                onChange={(e) => setForm({ ...form, fieldKey: e.target.value })}
                className="font-mono text-xs bg-muted/30"
              />
              <p className="text-[11px] text-muted-foreground">
                Internal programmatic identifier used for database JSON storage and CSV mapping.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Placeholder Text</Label>
              <Input
                placeholder={
                  form.fieldType === "number"
                    ? "e.g. 50,00,000"
                    : form.fieldType === "select"
                    ? "Select an option"
                    : "e.g. Enter details..."
                }
                value={form.placeholder}
                onChange={(e) => setForm({ ...form, placeholder: e.target.value })}
              />
            </div>

            {!editingField?.is_system && (
              <div className="space-y-1.5">
                <Label className="text-xs">Field Type</Label>
                <Select
                  value={form.fieldType}
                  onValueChange={(val) => setForm({ ...form, fieldType: val as CustomFieldType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text (Single line)</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="select">Dropdown (Select list)</SelectItem>
                    <SelectItem value="textarea">Textarea (Multi-line note)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* MULTI-OPTION TAG CREATOR FOR SELECT FIELDS */}
            {form.fieldType === "select" && (
              <div className="space-y-2 border border-border p-3 rounded-lg bg-muted/20">
                <Label className="text-xs font-semibold text-foreground">
                  Dropdown Choices / Options ({form.optionsList.length})
                </Label>

                {/* Option Chips */}
                <div className="flex flex-wrap gap-1.5 min-h-[36px] p-2 bg-background border border-border rounded-md">
                  {form.optionsList.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">
                      No choices added yet. Add options below.
                    </span>
                  ) : (
                    form.optionsList.map((opt, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-primary/10 text-primary border border-primary/20"
                      >
                        {opt}
                        <button
                          type="button"
                          onClick={() => handleRemoveOption(idx)}
                          className="hover:bg-primary/20 rounded-full p-0.5 text-primary"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>

                {/* Add Option Input */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Type choice and press Enter (or comma-separated)..."
                    value={form.newOptionInput}
                    onChange={(e) => setForm({ ...form, newOptionInput: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddOption();
                      }
                    }}
                    className="text-xs"
                  />
                  <Button type="button" size="sm" variant="secondary" onClick={handleAddOption}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add
                  </Button>
                </div>
              </div>
            )}

            {/* Checkbox Options */}
            <div className="space-y-2.5 pt-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="req"
                  checked={form.isRequired}
                  disabled={editingField?.field_key === "name"}
                  onCheckedChange={(checked) => setForm({ ...form, isRequired: Boolean(checked) })}
                />
                <Label htmlFor="req" className="text-xs font-normal cursor-pointer">
                  Mandatory field (Required in forms)
                </Label>
              </div>

              {!editingField?.is_system && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="uniq"
                    checked={form.isUnique}
                    onCheckedChange={(checked) => setForm({ ...form, isUnique: Boolean(checked) })}
                  />
                  <Label htmlFor="uniq" className="text-xs font-normal cursor-pointer">
                    Unique value constraint (Prevents duplicate values across workspace)
                  </Label>
                </div>
              )}

              {editingField?.is_system && editingField.field_key !== "name" && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="vis"
                    checked={form.isVisible}
                    onCheckedChange={(checked) => setForm({ ...form, isVisible: Boolean(checked) })}
                  />
                  <Label htmlFor="vis" className="text-xs font-normal cursor-pointer">
                    Visible in forms (Uncheck to hide this input from workspace forms)
                  </Label>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !form.fieldLabel.trim() || !form.fieldKey.trim()}
            >
              {saveMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              {editingField ? "Save Changes" : "Create Field"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
