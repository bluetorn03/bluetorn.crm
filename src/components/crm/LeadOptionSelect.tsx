import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Settings2, Edit2, Check, X, Trash2, PowerOff, Power } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  listLeadOptions,
  createLeadOption,
  updateLeadOption,
  setLeadOptionActive,
  deleteLeadOption,
  qk,
  type LeadOption,
  type LeadOptionType,
} from "@/lib/crm-api";
import { useSession } from "@/hooks/use-session";
import { toast } from "sonner";

export interface LeadOptionSelectProps {
  type: LeadOptionType;
  label: string;
  value?: string | null;
  onChange: (value: string | null) => void;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  historicalValue?: {
    id: string;
    name: string;
    is_active: boolean | number;
  } | null;
}

export function LeadOptionSelect({
  type,
  label,
  value,
  onChange,
  required = false,
  placeholder,
  disabled = false,
  id,
  historicalValue,
}: LeadOptionSelectProps) {
  const { workspace, role, dbRole } = useSession();
  const queryClient = useQueryClient();

  const isOwner =
    role === "Owner" ||
    role === "Super Admin" ||
    dbRole === "owner" ||
    dbRole === "super_admin";

  const elementId = id || `lead-option-${type}`;

  // Query options for this type
  const optionsQuery = useQuery({
    queryKey: qk.leadOptions(workspace.id, type),
    queryFn: () => listLeadOptions(workspace.id, type, isOwner),
    enabled: !!workspace.id,
  });

  const allOptions = optionsQuery.data ?? [];

  // Active options list
  const activeOptions = allOptions.filter((o) => Boolean(o.is_active));

  // Determine if the currently selected value is an inactive option
  const selectedOption = allOptions.find((o) => o.id === value);
  const isSelectedInactive = selectedOption && !selectedOption.is_active;

  // Modals state
  const [addOpen, setAddOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [newOptionName, setNewOptionName] = useState("");
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [editingOptionName, setEditingOptionName] = useState("");

  // Mutations
  const createMutation = useMutation({
    mutationFn: (name: string) => createLeadOption(workspace.id, type, name),
    onSuccess: (newOpt) => {
      queryClient.invalidateQueries({ queryKey: qk.leadOptions(workspace.id, type) });
      queryClient.invalidateQueries({ queryKey: qk.leadOptions(workspace.id, "all") });
      onChange(newOpt.id);
      setNewOptionName("");
      setAddOpen(false);
      toast.success(`Added "${newOpt.name}" to ${label}.`);
    },
    onError: (err: Error) => {
      toast.error(err.message || `Failed to add ${label} option.`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ optId, name }: { optId: string; name: string }) =>
      updateLeadOption(optId, { name }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: qk.leadOptions(workspace.id, type) });
      queryClient.invalidateQueries({ queryKey: qk.leadOptions(workspace.id, "all") });
      setEditingOptionId(null);
      toast.success(`Renamed option to "${updated.name}".`);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update option.");
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ optId, isActive }: { optId: string; isActive: boolean }) =>
      setLeadOptionActive(optId, isActive),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: qk.leadOptions(workspace.id, type) });
      queryClient.invalidateQueries({ queryKey: qk.leadOptions(workspace.id, "all") });
      const statusText = updated.is_active ? "reactivated" : "deactivated";
      toast.success(`Option "${updated.name}" ${statusText}.`);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to change option status.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (optId: string) => deleteLeadOption(optId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.leadOptions(workspace.id, type) });
      queryClient.invalidateQueries({ queryKey: qk.leadOptions(workspace.id, "all") });
      toast.success("Option deleted successfully.");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to delete option.");
    },
  });

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newOptionName.trim();
    if (!trimmed) {
      toast.error("Please enter an option name.");
      return;
    }
    createMutation.mutate(trimmed);
  };

  const handleSaveEdit = (optId: string) => {
    const trimmed = editingOptionName.trim();
    if (!trimmed) {
      toast.error("Option name cannot be empty.");
      return;
    }
    updateMutation.mutate({ optId, name: trimmed });
  };

  const selectValue = value ?? (required ? "" : "none");

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={elementId} className="text-sm font-medium">
          {label} {required && <span className="text-destructive">*</span>}
        </Label>
        {isOwner && (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-xs text-primary hover:text-primary/80 hover:bg-primary/10 transition-colors"
              onClick={() => {
                setNewOptionName("");
                setAddOpen(true);
              }}
            >
              <Plus className="mr-0.5 h-3 w-3" /> Add
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              onClick={() => setManageOpen(true)}
              title={`Manage ${label} options`}
            >
              <Settings2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      <Select
        value={selectValue}
        onValueChange={(val) => {
          if (val === "none") {
            onChange(null);
          } else {
            onChange(val);
          }
        }}
        disabled={disabled || optionsQuery.isLoading}
      >
        <SelectTrigger id={elementId} className="w-full">
          <SelectValue placeholder={placeholder || `Select ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          {!required && <SelectItem value="none">None</SelectItem>}

          {/* Show inactive historical value if currently assigned */}
          {isSelectedInactive && selectedOption && (
            <SelectItem key={selectedOption.id} value={selectedOption.id} className="text-muted-foreground">
              {selectedOption.name} (Inactive)
            </SelectItem>
          )}

          {/* Fallback for historical option if not in options query */}
          {historicalValue &&
            !Boolean(historicalValue.is_active) &&
            historicalValue.id === value &&
            !selectedOption && (
              <SelectItem key={historicalValue.id} value={historicalValue.id} className="text-muted-foreground">
                {historicalValue.name} (Inactive)
              </SelectItem>
            )}

          {activeOptions.map((opt) => (
            <SelectItem key={opt.id} value={opt.id}>
              {opt.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Owner Modal: Add Option */}
      {isOwner && (
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent className="sm:max-w-sm">
            <form onSubmit={handleAddSubmit}>
              <DialogHeader>
                <DialogTitle>Add {label}</DialogTitle>
                <DialogDescription>
                  Create a new configurable {label.toLowerCase()} option for your workspace.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Label htmlFor={`new-${type}-name`}>Option Name *</Label>
                <Input
                  id={`new-${type}-name`}
                  className="mt-1.5"
                  placeholder={`e.g. ${type === "source" ? "Billboards" : "New Option"}`}
                  value={newOptionName}
                  onChange={(e) => setNewOptionName(e.target.value)}
                  maxLength={128}
                  autoFocus
                />
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  )}
                  Create Option
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Owner Modal: Manage Options */}
      {isOwner && (
        <Dialog open={manageOpen} onOpenChange={setManageOpen}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Manage {label} Options</DialogTitle>
              <DialogDescription>
                Edit names, deactivate unused items, or reactivate historical options.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 py-3">
              {allOptions.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-4">
                  No options found for this category.
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-md border">
                  {allOptions.map((opt) => {
                    const isEditing = editingOptionId === opt.id;
                    const isActive = Boolean(opt.is_active);
                    const isSystem = Boolean(opt.is_system);

                    return (
                      <li
                        key={opt.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                      >
                        {isEditing ? (
                          <div className="flex flex-1 items-center gap-1.5 min-w-0">
                            <Input
                              value={editingOptionName}
                              onChange={(e) => setEditingOptionName(e.target.value)}
                              className="h-8 text-xs"
                              autoFocus
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700"
                              onClick={() => handleSaveEdit(opt.id)}
                              disabled={updateMutation.isPending}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-muted-foreground"
                              onClick={() => setEditingOptionId(null)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <div className="min-w-0 flex-1 flex items-center gap-2">
                              <span
                                className={`truncate font-medium text-xs ${
                                  !isActive ? "line-through text-muted-foreground" : "text-foreground"
                                }`}
                              >
                                {opt.name}
                              </span>
                              {isSystem && (
                                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                  System
                                </span>
                              )}
                              {!isActive && (
                                <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400 border border-amber-500/20">
                                  Inactive
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                onClick={() => {
                                  setEditingOptionId(opt.id);
                                  setEditingOptionName(opt.name);
                                }}
                                title="Rename option"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>

                              <Button
                                size="sm"
                                variant="ghost"
                                className={`h-7 w-7 p-0 ${
                                  isActive
                                    ? "text-amber-600 hover:text-amber-700 hover:bg-amber-500/10"
                                    : "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                                }`}
                                onClick={() =>
                                  toggleActiveMutation.mutate({
                                    optId: opt.id,
                                    isActive: !isActive,
                                  })
                                }
                                disabled={toggleActiveMutation.isPending}
                                title={isActive ? "Deactivate option" : "Reactivate option"}
                              >
                                {isActive ? (
                                  <PowerOff className="h-3.5 w-3.5" />
                                ) : (
                                  <Power className="h-3.5 w-3.5" />
                                )}
                              </Button>

                              {!isSystem && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => deleteMutation.mutate(opt.id)}
                                  disabled={deleteMutation.isPending}
                                  title="Delete option (only if 0 leads reference it)"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <DialogFooter>
              <Button type="button" onClick={() => setManageOpen(false)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
