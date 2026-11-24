import { useQuery } from "@tanstack/react-query";
import {
  listWorkspaceCustomFields,
  qk,
  type CustomFieldEntity,
  type WorkspaceCustomField,
} from "@/lib/crm-api";
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

interface CustomFieldsRendererProps {
  workspaceId: string;
  entityType: CustomFieldEntity;
  values: Record<string, any>;
  onChange: (newValues: Record<string, any>) => void;
  className?: string;
}

export function CustomFieldsRenderer({
  workspaceId,
  entityType,
  values,
  onChange,
  className,
}: CustomFieldsRendererProps) {
  const fieldsQuery = useQuery({
    queryKey: qk.customFields(workspaceId, entityType),
    queryFn: () => listWorkspaceCustomFields(workspaceId, entityType),
    enabled: Boolean(workspaceId),
  });

  const fields = fieldsQuery.data || [];
  if (fields.length === 0) return null;

  const handleFieldChange = (fieldKey: string, val: any) => {
    onChange({
      ...values,
      [fieldKey]: val,
    });
  };

  return (
    <div className={`space-y-3 pt-2 border-t border-border ${className || ""}`}>
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Custom Fields ({fields.length})
        </h4>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {fields.map((f: WorkspaceCustomField) => {
          const val = values[f.field_key] ?? "";

          return (
            <div key={f.id} className="space-y-1.5">
              <Label className="text-xs font-medium">
                {f.field_label}
                {f.is_required && <span className="text-destructive ml-0.5">*</span>}
              </Label>

              {f.field_type === "text" && (
                <Input
                  value={val}
                  onChange={(e) => handleFieldChange(f.field_key, e.target.value)}
                  placeholder={`Enter ${f.field_label.toLowerCase()}`}
                  className="h-9 text-sm"
                />
              )}

              {f.field_type === "number" && (
                <Input
                  type="number"
                  value={val}
                  onChange={(e) => handleFieldChange(f.field_key, e.target.value)}
                  placeholder="0"
                  className="h-9 text-sm"
                />
              )}

              {f.field_type === "date" && (
                <Input
                  type="date"
                  value={val ? String(val).slice(0, 10) : ""}
                  onChange={(e) => handleFieldChange(f.field_key, e.target.value)}
                  className="h-9 text-sm"
                />
              )}

              {f.field_type === "textarea" && (
                <Textarea
                  value={val}
                  onChange={(e) => handleFieldChange(f.field_key, e.target.value)}
                  rows={2}
                  placeholder={`Enter ${f.field_label.toLowerCase()}`}
                  className="text-sm"
                />
              )}

              {f.field_type === "select" && (
                <Select
                  value={val || "none"}
                  onValueChange={(selected) =>
                    handleFieldChange(f.field_key, selected === "none" ? "" : selected)
                  }
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder={`Select ${f.field_label}`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-- Select option --</SelectItem>
                    {(f.options || []).map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
