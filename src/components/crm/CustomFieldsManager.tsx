import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Edit2, Layers, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
    fieldType: "text" as CustomFieldType,
    optionsString: "",
    isRequired: false,
    sortOrder: 0,
  });

  const fieldsQuery = useQuery({
    queryKey: qk.customFields(workspaceId, activeTab),
    queryFn: () => listWorkspaceCustomFields(workspaceId, activeTab),
    enabled: Boolean(workspaceId),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const options =
        form.fieldType === "select"
          ? form.optionsString
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : null;

      await saveWorkspaceCustomField({
        workspaceId,
        fieldId: editingField?.id ?? null,
        entityType: activeTab,
        fieldKey: form.fieldKey,
        fieldLabel: form.fieldLabel,
        fieldType: form.fieldType,
        options,
        isRequired: form.isRequired,
        sortOrder: Number(form.sortOrder || 0),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.customFields(workspaceId) });
      toast.success(
        editingField ? "Custom field updated successfully" : "Custom field created successfully",
      );
      setDialogOpen(false);
      resetForm();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to save custom field");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (fieldId: string) => {
      await deleteWorkspaceCustomField(workspaceId, fieldId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.customFields(workspaceId) });
      toast.success("Custom field deleted");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to delete custom field");
    },
  });

  const resetForm = () => {
    setEditingField(null);
    setForm({
      fieldKey: "",
      fieldLabel: "",
      fieldType: "text",
      optionsString: "",
      isRequired: false,
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
      fieldType: f.field_type,
      optionsString: (f.options || []).join(", "),
      isRequired: f.is_required,
      sortOrder: f.sort_order,
    });
    setDialogOpen(true);
  };

  const fields = fieldsQuery.data || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Custom Input Columns</h3>
          <p className="text-xs text-muted-foreground">
            Create and customize tailored input fields for your workspace leads and customers.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as CustomFieldEntity)}
            className="w-auto"
          >
            <TabsList>
              <TabsTrigger value="lead">Leads ({fields.length})</TabsTrigger>
              <TabsTrigger value="customer">Customers</TabsTrigger>
            </TabsList>
          </Tabs>

          <Button size="sm" onClick={openCreateDialog}>
            <Plus className="mr-1.5 h-4 w-4" /> Add Field
          </Button>
        </div>
      </div>

      {fields.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-8 text-center bg-muted/10">
          <Layers className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <h4 className="text-sm font-medium">No custom fields yet</h4>
          <p className="text-xs text-muted-foreground mt-1 mb-4 max-w-sm mx-auto">
            You can create dynamic custom input columns for your {activeTab}s (e.g. "Preferred Floor", "Loan Approved", "Source Sub-type").
          </p>
          <Button size="sm" variant="outline" onClick={openCreateDialog}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Create your first field
          </Button>
        </div>
      ) : (
        <div className="border border-border rounded-xl divide-y divide-border overflow-hidden bg-card">
          {fields.map((f: WorkspaceCustomField) => (
            <div key={f.id} className="p-3.5 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-foreground">{f.field_label}</span>
                  <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-mono">
                    {f.field_key}
                  </code>
                  {f.is_required && (
                    <span className="text-[10px] bg-destructive/10 text-destructive font-medium px-1.5 py-0.2 rounded">
                      Required
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                  <span className="capitalize font-medium text-foreground/80">{f.field_type}</span>
                  {f.field_type === "select" && f.options && (
                    <span>· Choices: {f.options.join(", ")}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEditDialog(f)}>
                  <Edit2 className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (window.confirm(`Delete custom field "${f.field_label}"? Existing values will be preserved.`)) {
                      deleteMutation.mutate(f.id);
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

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingField ? "Edit Custom Field" : `Add Custom ${activeTab.toUpperCase()} Field`}</DialogTitle>
            <DialogDescription>
              Define the label, identifier, and widget type for this workspace column.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Field Label *</Label>
              <Input
                placeholder="e.g. Preferred Floor"
                value={form.fieldLabel}
                onChange={(e) => {
                  const val = e.target.value;
                  const autoKey = !editingField ? val.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 40) : form.fieldKey;
                  setForm({ ...form, fieldLabel: val, fieldKey: autoKey });
                }}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Field Key (Unique identifier)</Label>
              <Input
                placeholder="e.g. preferred_floor"
                value={form.fieldKey}
                disabled={Boolean(editingField)}
                onChange={(e) => setForm({ ...form, fieldKey: e.target.value })}
                className="font-mono text-xs"
              />
            </div>

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

            {form.fieldType === "select" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Dropdown Choices (Comma separated)</Label>
                <Input
                  placeholder="e.g. Low, Mid, High, Penthouse"
                  value={form.optionsString}
                  onChange={(e) => setForm({ ...form, optionsString: e.target.value })}
                />
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <Checkbox
                id="req"
                checked={form.isRequired}
                onCheckedChange={(checked) => setForm({ ...form, isRequired: Boolean(checked) })}
              />
              <Label htmlFor="req" className="text-xs font-normal cursor-pointer">
                Mandatory field (Required in forms)
              </Label>
            </div>
          </div>

          <DialogFooter>
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
