import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listLeadOptions,
  qk,
  type LeadOptionType,
} from "@/lib/crm-api";
import { useSession } from "@/hooks/use-session";

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

  const isOwner =
    role === "Owner" || role === "Super Admin" || dbRole === "owner" || dbRole === "super_admin";

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

  const selectValue = value ?? (required ? "" : "none");

  return (
    <div className="space-y-1.5">
      <Label htmlFor={elementId} className="text-sm font-medium">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>

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
            <SelectItem
              key={selectedOption.id}
              value={selectedOption.id}
              className="text-muted-foreground"
            >
              {selectedOption.name} (Inactive)
            </SelectItem>
          )}

          {/* Fallback for historical option if not in options query */}
          {historicalValue &&
            !historicalValue.is_active &&
            historicalValue.id === value &&
            !selectedOption && (
              <SelectItem
                key={historicalValue.id}
                value={historicalValue.id}
                className="text-muted-foreground"
              >
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
    </div>
  );
}
