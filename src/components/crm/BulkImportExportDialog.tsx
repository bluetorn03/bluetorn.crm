import { useState, useId } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Upload,
  Download,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Edit2,
  Plus,
  Loader2,
  ArrowRight,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  checkDuplicatesBatch,
  bulkImportLeads,
  bulkImportCustomers,
  qk,
  type CustomFieldEntity,
  type WorkspaceCustomField,
  type ExistingContactMatch,
} from "@/lib/crm-api";
import { normalizePhoneForTel } from "@/lib/communication";

interface ParsedRow {
  tempId: string;
  data: Record<string, string>;
  error?: string | null;
  duplicateMatch?: ExistingContactMatch | null;
  duplicateInFile?: boolean;
}

interface BulkImportExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  entityType: CustomFieldEntity;
}

/**
 * Robust CSV parser supporting quotes, commas, escaped characters, and multi-line values.
 */
function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines: string[][] = [];
  let currentRow: string[] = [];
  let currentVal = "";
  let insideQuotes = false;

  const cleanText = text.replace(/^\uFEFF/, ""); // Strip UTF-8 BOM if present

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentVal += '"';
        i++; // Skip escaped quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === "," && !insideQuotes) {
      currentRow.push(currentVal.trim());
      currentVal = "";
    } else if ((char === "\r" || char === "\n") && !insideQuotes) {
      if (char === "\r" && nextChar === "\n") i++;
      currentRow.push(currentVal.trim());
      if (currentRow.some((val) => val.length > 0)) {
        lines.push(currentRow);
      }
      currentRow = [];
      currentVal = "";
    } else {
      currentVal += char;
    }
  }

  if (currentVal.length > 0 || currentRow.length > 0) {
    currentRow.push(currentVal.trim());
    if (currentRow.some((val) => val.length > 0)) {
      lines.push(currentRow);
    }
  }

  if (lines.length === 0) return { headers: [], rows: [] };
  const firstLine = lines[0];
  if (!firstLine) return { headers: [], rows: [] };
  const headers = firstLine.map((h) => h.replace(/^["']|["']$/g, "").trim());
  const rows = lines.slice(1);
  return { headers, rows };
}

export function BulkImportExportDialog({
  open,
  onOpenChange,
  workspaceId,
  entityType,
}: BulkImportExportDialogProps) {
  const queryClient = useQueryClient();
  const fileInputId = useId();

  const [step, setStep] = useState<"upload" | "map" | "preview">("upload");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [isValidating, setIsValidating] = useState(false);
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);

  // Quick custom column creation modal state
  const [newColumnOpen, setNewColumnOpen] = useState(false);
  const [newColumnLabel, setNewColumnLabel] = useState("");
  const [newColumnType, setNewColumnType] = useState<"text" | "number" | "date">("text");

  const customFieldsQuery = useQuery({
    queryKey: qk.customFields(workspaceId, entityType),
    queryFn: () => listWorkspaceCustomFields(workspaceId, entityType),
    enabled: Boolean(workspaceId && open),
  });

  const customFields = customFieldsQuery.data || [];

  const standardFieldOptions =
    entityType === "lead"
      ? [
          { key: "name", label: "Full Name (Required)" },
          { key: "phone", label: "Phone / Contact" },
          { key: "email", label: "Email Address" },
          { key: "budget", label: "Budget (INR)" },
          { key: "source", label: "Source" },
          { key: "requirement", label: "Requirement" },
          { key: "notes", label: "Notes" },
        ]
      : [
          { key: "name", label: "Full Name (Required)" },
          { key: "phone", label: "Phone / Contact" },
          { key: "email", label: "Email Address" },
          { key: "type", label: "Customer Type (Buyer/Seller)" },
          { key: "status", label: "Status (Prospect/Active)" },
          { key: "city", label: "City" },
          { key: "value", label: "Deal Value (INR)" },
          { key: "notes", label: "Notes" },
        ];

  const allTargetOptions = [
    { key: "ignore", label: "-- Skip this column --" },
    ...standardFieldOptions,
    ...customFields.map((f) => ({
      key: `custom_${f.field_key}`,
      label: `[Custom] ${f.field_label}`,
    })),
  ];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) {
        toast.error("File is empty.");
        return;
      }

      const { headers, rows } = parseCSV(content);
      if (headers.length === 0 || rows.length === 0) {
        toast.error("No valid tabular data found in file.");
        return;
      }

      setCsvHeaders(headers);
      setRawRows(rows);

      // Auto-suggest column mappings
      const initialMap: Record<string, string> = {};
      headers.forEach((h) => {
        const lower = h.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (lower.includes("name") || lower === "lead" || lower === "customer") {
          initialMap[h] = "name";
        } else if (lower.includes("phone") || lower.includes("mobile") || lower.includes("contact")) {
          initialMap[h] = "phone";
        } else if (lower.includes("mail")) {
          initialMap[h] = "email";
        } else if (lower.includes("budget") || lower.includes("price") || lower.includes("value")) {
          initialMap[h] = entityType === "lead" ? "budget" : "value";
        } else if (lower.includes("source")) {
          initialMap[h] = "source";
        } else if (lower.includes("require") || lower.includes("prop")) {
          initialMap[h] = "requirement";
        } else if (lower.includes("city") || lower.includes("location")) {
          initialMap[h] = "city";
        } else {
          // Check if custom field matches
          const matchCf = customFields.find(
            (cf) => cf.field_key === lower || cf.field_label.toLowerCase() === h.toLowerCase(),
          );
          if (matchCf) {
            initialMap[h] = `custom_${matchCf.field_key}`;
          } else {
            initialMap[h] = "ignore";
          }
        }
      });

      setColumnMapping(initialMap);
      setStep("map");
    };

    reader.readAsText(file, "UTF-8");
  };

  const handleProceedToPreview = async () => {
    // Check if 'name' is mapped
    const hasNameMapping = Object.values(columnMapping).includes("name");
    if (!hasNameMapping) {
      toast.error("You must map at least one column to 'Full Name (Required)'.");
      return;
    }

    setIsValidating(true);
    setStep("preview");

    // 1. Build initial parsed rows
    const rows: ParsedRow[] = rawRows.map((rawRow, idx) => {
      const rowData: Record<string, string> = {};
      csvHeaders.forEach((header, colIdx) => {
        const target = columnMapping[header];
        if (target && target !== "ignore") {
          rowData[target] = rawRow[colIdx] ?? "";
        }
      });

      return {
        tempId: `row_${idx}`,
        data: rowData,
      };
    });

    // 2. Client-side duplicate detection within the file itself
    const seenPhones = new Set<string>();
    const seenEmails = new Set<string>();

    rows.forEach((r) => {
      const name = r.data["name"]?.trim();
      if (!name) {
        r.error = "Name is required.";
      }

      const rawPhone = r.data["phone"]?.trim();
      if (rawPhone) {
        const norm = normalizePhoneForTel(rawPhone).slice(-10);
        if (norm.length >= 7) {
          if (seenPhones.has(norm)) {
            r.duplicateInFile = true;
            r.error = r.error ? `${r.error} | Duplicate phone in file` : "Duplicate phone in file";
          } else {
            seenPhones.add(norm);
          }
        }
      }

      const rawEmail = r.data["email"]?.trim().toLowerCase();
      if (rawEmail && rawEmail.includes("@")) {
        if (seenEmails.has(rawEmail)) {
          r.duplicateInFile = true;
          r.error = r.error ? `${r.error} | Duplicate email in file` : "Duplicate email in file";
        } else {
          seenEmails.add(rawEmail);
        }
      }
    });

    // 3. Server-side duplicate detection against existing workspace database
    try {
      const checkItems = rows.map((r) => ({
        tempId: r.tempId,
        phone: r.data["phone"] ?? null,
        email: r.data["email"] ?? null,
      }));

      const res = await checkDuplicatesBatch(workspaceId, entityType, checkItems);

      rows.forEach((r) => {
        const match = res.matches[r.tempId];
        if (match) {
          r.duplicateMatch = match;
          const assignedText = match.assignedToName ? ` (Assigned to: ${match.assignedToName})` : "";
          const msg = `Exists in CRM: "${match.name}"${assignedText}`;
          r.error = r.error ? `${r.error} | ${msg}` : msg;
        }
      });
    } catch (err: any) {
      console.warn("Server duplicate check warning:", err);
    } finally {
      setParsedRows(rows);
      setIsValidating(false);
    }
  };

  const handleEditCell = (tempId: string, fieldKey: string, newValue: string) => {
    setParsedRows((prev) =>
      prev.map((r) => {
        if (r.tempId !== tempId) return r;
        const updatedData = { ...r.data, [fieldKey]: newValue };
        // Clear error if resolved
        let error: string | null = r.error ?? null;
        if (fieldKey === "name" && newValue.trim()) {
          error = null;
        }
        return {
          ...r,
          data: updatedData,
          error,
        };
      }),
    );
  };

  const handleDeleteRow = (tempId: string) => {
    setParsedRows((prev) => prev.filter((r) => r.tempId !== tempId));
  };

  const createCustomFieldMutation = useMutation({
    mutationFn: async () => {
      const key = newColumnLabel.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 32);
      await saveWorkspaceCustomField({
        workspaceId,
        entityType,
        fieldKey: key,
        fieldLabel: newColumnLabel.trim(),
        fieldType: newColumnType,
      });
      return key;
    },
    onSuccess: (newKey) => {
      queryClient.invalidateQueries({ queryKey: qk.customFields(workspaceId, entityType) });
      toast.success(`Custom column "${newColumnLabel}" created! You can now map to it.`);
      setNewColumnOpen(false);
      setNewColumnLabel("");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to create custom column.");
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      // Filter out rows that have unresolvable duplicate errors
      const validRows = parsedRows.filter((r) => !r.error && r.data["name"]?.trim());
      if (validRows.length === 0) {
        throw new Error("No valid rows to import. Please resolve red errors or delete invalid rows.");
      }

      if (entityType === "lead") {
        const payload = validRows.map((r) => {
          const cf: Record<string, any> = {};
          Object.entries(r.data).forEach(([k, v]) => {
            if (k.startsWith("custom_")) {
              cf[k.replace("custom_", "")] = v;
            }
          });

          return {
            name: (r.data["name"] ?? "").trim(),
            phone: r.data["phone"]?.trim() || null,
            email: r.data["email"]?.trim() || null,
            source: r.data["source"]?.trim() || "CSV Import",
            budget: parseFloat(r.data["budget"] || "0") || 0,
            requirement: r.data["requirement"]?.trim() || null,
            notes: r.data["notes"]?.trim() || null,
            customFields: Object.keys(cf).length > 0 ? cf : null,
          };
        });

        return await bulkImportLeads(workspaceId, payload);
      } else {
        const payload = validRows.map((r) => {
          const cf: Record<string, any> = {};
          Object.entries(r.data).forEach(([k, v]) => {
            if (k.startsWith("custom_")) {
              cf[k.replace("custom_", "")] = v;
            }
          });

          return {
            name: (r.data["name"] ?? "").trim(),
            phone: r.data["phone"]?.trim() || null,
            email: r.data["email"]?.trim() || null,
            type: r.data["type"]?.trim() || "Buyer",
            status: r.data["status"]?.trim() || "Prospect",
            city: r.data["city"]?.trim() || null,
            value: parseFloat(r.data["value"] || "0") || 0,
            notes: r.data["notes"]?.trim() || null,
            customFields: Object.keys(cf).length > 0 ? cf : null,
          };
        });

        return await bulkImportCustomers(workspaceId, payload);
      }
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: [entityType === "lead" ? "leads" : "customers"] });
      toast.success(`Successfully imported ${res.importedCount} ${entityType}s!`);
      onOpenChange(false);
      resetState();
    },
    onError: (err: Error) => {
      toast.error(err.message || "Bulk import failed.");
    },
  });

  const resetState = () => {
    setStep("upload");
    setCsvHeaders([]);
    setRawRows([]);
    setColumnMapping({});
    setParsedRows([]);
  };

  const totalRowsCount = parsedRows.length;
  const errorRowsCount = parsedRows.filter((r) => Boolean(r.error)).length;
  const validRowsCount = totalRowsCount - errorRowsCount;

  const displayedRows = showErrorsOnly
    ? parsedRows.filter((r) => Boolean(r.error))
    : parsedRows;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) resetState();
          onOpenChange(v);
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-6">
          <DialogHeader className="pb-3 border-b border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                <DialogTitle className="capitalize">
                  Bulk Import {entityType}s (CSV / Excel)
                </DialogTitle>
              </div>
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <span className={step === "upload" ? "text-primary font-bold" : ""}>1. Upload</span>
                <span>→</span>
                <span className={step === "map" ? "text-primary font-bold" : ""}>2. Map Columns</span>
                <span>→</span>
                <span className={step === "preview" ? "text-primary font-bold" : ""}>3. Validate & Import</span>
              </div>
            </div>
            <DialogDescription className="text-xs pt-1">
              Import leads from Meta Ads, 99acres, Magicbricks, or Excel with duplicate detection and dynamic workspace columns.
            </DialogDescription>
          </DialogHeader>

          {/* Step 1: Upload */}
          {step === "upload" && (
            <div className="flex-1 py-10 flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl bg-muted/10 my-4">
              <Upload className="h-10 w-10 text-muted-foreground mb-3" />
              <h3 className="text-sm font-semibold text-foreground">Choose a CSV File</h3>
              <p className="text-xs text-muted-foreground mt-1 mb-4 text-center max-w-sm">
                Select a .csv file exported from Excel, Google Sheets, or your lead generation portal.
              </p>
              <input
                id={fileInputId}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleFileUpload}
              />
              <Button asChild size="sm">
                <label htmlFor={fileInputId} className="cursor-pointer">
                  Select CSV File
                </label>
              </Button>
            </div>
          )}

          {/* Step 2: Column Mapping */}
          {step === "map" && (
            <div className="flex-1 overflow-y-auto py-4 space-y-4">
              <div className="flex items-center justify-between bg-muted/30 p-3 rounded-lg border border-border">
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    Match CSV Columns to CRM Fields ({rawRows.length} rows found)
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Ensure "Full Name" is mapped. Custom workspace fields are supported.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => setNewColumnOpen(true)}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Add New Custom Column
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {csvHeaders.map((header) => (
                  <div
                    key={header}
                    className="p-3 border border-border rounded-lg bg-card space-y-1.5"
                  >
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-foreground truncate max-w-[180px]">
                        "{header}"
                      </span>
                      <span className="text-[10px] text-muted-foreground">CSV Column</span>
                    </div>
                    <Select
                      value={columnMapping[header] || "ignore"}
                      onValueChange={(val) => setColumnMapping({ ...columnMapping, [header]: val })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {allTargetOptions.map((opt) => (
                          <SelectItem key={opt.key} value={opt.key} className="text-xs">
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Pre-Validation Preview Table (RED Highlight for Duplicates & Errors) */}
          {step === "preview" && (
            <div className="flex-1 overflow-hidden flex flex-col py-2 space-y-3">
              {/* Summary Banner */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border border-border bg-muted/20">
                <div className="flex items-center gap-3 text-xs">
                  <span className="font-medium">Total: {totalRowsCount} rows</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {validRowsCount} Valid
                  </span>
                  {errorRowsCount > 0 && (
                    <span className="text-destructive font-semibold flex items-center gap-1 bg-destructive/10 px-2 py-0.5 rounded">
                      <AlertTriangle className="h-3.5 w-3.5" /> {errorRowsCount} Duplicates / Errors
                    </span>
                  )}
                </div>

                {errorRowsCount > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setShowErrorsOnly(!showErrorsOnly)}
                  >
                    <Filter className="mr-1.5 h-3 w-3" />
                    {showErrorsOnly ? "Show All Rows" : "Show Errors Only"}
                  </Button>
                )}
              </div>

              {isValidating ? (
                <div className="flex-1 flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
                  <span className="text-xs text-muted-foreground">Checking duplicates against CRM workspace...</span>
                </div>
              ) : (
                <div className="flex-1 overflow-auto border border-border rounded-lg bg-card">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-muted/50 sticky top-0 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      <tr>
                        <th className="p-2.5 w-12 text-center">#</th>
                        <th className="p-2.5">Name *</th>
                        <th className="p-2.5">Phone</th>
                        <th className="p-2.5">Email</th>
                        <th className="p-2.5">Status / Validation</th>
                        <th className="p-2.5 w-12 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {displayedRows.map((r, i) => {
                        const isError = Boolean(r.error);
                        return (
                          <tr
                            key={r.tempId}
                            className={`transition-colors ${
                              isError
                                ? "bg-destructive/10 border-l-4 border-l-destructive"
                                : "hover:bg-muted/20"
                            }`}
                          >
                            <td className="p-2.5 text-center text-[11px] text-muted-foreground font-mono">
                              {i + 1}
                            </td>
                            <td className="p-2.5">
                              <Input
                                value={r.data["name"] ?? ""}
                                onChange={(e) => handleEditCell(r.tempId, "name", e.target.value)}
                                className={`h-7 text-xs ${!r.data["name"]?.trim() ? "border-destructive ring-1 ring-destructive" : ""}`}
                              />
                            </td>
                            <td className="p-2.5">
                              <Input
                                value={r.data["phone"] ?? ""}
                                onChange={(e) => handleEditCell(r.tempId, "phone", e.target.value)}
                                className="h-7 text-xs font-mono"
                              />
                            </td>
                            <td className="p-2.5">
                              <Input
                                value={r.data["email"] ?? ""}
                                onChange={(e) => handleEditCell(r.tempId, "email", e.target.value)}
                                className="h-7 text-xs"
                              />
                            </td>
                            <td className="p-2.5">
                              {isError ? (
                                <div className="flex items-center gap-1.5 text-destructive font-medium text-[11px]">
                                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate max-w-[280px]" title={r.error || ""}>
                                    {r.error}
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium text-[11px]">
                                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                  <span>Ready to import</span>
                                </div>
                              )}
                            </td>
                            <td className="p-2.5 text-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleDeleteRow(r.tempId)}
                                title="Remove row"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Footer Controls */}
          <DialogFooter className="pt-3 border-t border-border flex items-center justify-between sm:justify-between w-full">
            <div>
              {step !== "upload" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStep(step === "preview" ? "map" : "upload")}
                >
                  Back
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>

              {step === "map" && (
                <Button size="sm" onClick={handleProceedToPreview}>
                  Next: Validate Rows <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              )}

              {step === "preview" && (
                <Button
                  size="sm"
                  onClick={() => importMutation.mutate()}
                  disabled={importMutation.isPending || validRowsCount === 0 || isValidating}
                >
                  {importMutation.isPending && (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  )}
                  Import {validRowsCount} Valid {entityType}s
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Add Custom Column Dialog */}
      <Dialog open={newColumnOpen} onOpenChange={setNewColumnOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Custom Column</DialogTitle>
            <DialogDescription className="text-xs">
              Add a dynamic field for this workspace before finishing column mapping.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Column Name *</Label>
              <Input
                placeholder="e.g. Loan Status"
                value={newColumnLabel}
                onChange={(e) => setNewColumnLabel(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Data Type</Label>
              <Select
                value={newColumnType}
                onValueChange={(v) => setNewColumnType(v as "text" | "number" | "date")}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text (General)</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="date">Date</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setNewColumnOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={createCustomFieldMutation.isPending || !newColumnLabel.trim()}
              onClick={() => createCustomFieldMutation.mutate()}
            >
              {createCustomFieldMutation.isPending && (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              )}
              Create Column
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Clean CSV Exporter utility that dynamically handles standard + custom fields.
 */
export function exportContactsToCsv(options: {
  filename: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
}) {
  const escapeCell = (val: any): string => {
    if (val === null || val === undefined) return "";
    const str = String(val).replace(/"/g, '""');
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
      return `"${str}"`;
    }
    return str;
  };

  const csvContent =
    "\uFEFF" + // UTF-8 BOM
    [
      options.headers.map(escapeCell).join(","),
      ...options.rows.map((row) => row.map(escapeCell).join(",")),
    ].join("\r\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${options.filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
