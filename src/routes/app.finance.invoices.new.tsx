import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Building2, FileText, Loader2, Plus, Trash2, User } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { DataState } from "@/components/common/DataState";
import { DateTimeField } from "@/components/common/DateTimeField";
import { PermissionGate } from "@/components/app/PermissionGate";
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
  listCustomers,
  listLeads,
  listProperties,
  nextInvoiceNumber,
  saveInvoice,
  getInvoice,
  qk,
  type InvoiceLineInput,
} from "@/lib/crm-api";
import { getWorkspaceMembersFn } from "@/lib/settings.functions";
import { useSession } from "@/hooks/use-session";
import { formatMoney } from "@/lib/format";
import { MoneyInput } from "@/components/common/MoneyInput";
import { AmountInWords } from "@/components/common/AmountInWords";
import { toast } from "sonner";

export const Route = createFileRoute("/app/finance/invoices/new")({
  head: () => ({
    meta: [
      { title: "New invoice · BLUETORN CRM" },
      {
        name: "description",
        content: "Build a GST-ready tax invoice with line items and workspace branding.",
      },
      { property: "og:title", content: "New invoice · BLUETORN CRM" },
      {
        property: "og:description",
        content: "Build a GST-ready tax invoice with line items and workspace branding.",
      },
    ],
  }),
  component: NewInvoicePage,
});

function NewInvoicePage() {
  return (
    <PermissionGate
      requires={["finance.invoices.create", "finance.invoices.edit", "manage.finance"]}
    >
      <NewInvoiceContent />
    </PermissionGate>
  );
}

const INVOICE_TYPES = ["Tax Invoice", "Proforma Invoice", "Bill of Supply", "Receipt Voucher"];

const TAX_RATES = [0, 5, 12, 18, 28];
const UNITS = ["unit", "sq ft", "service", "month", "lot", "hour", "day"];

interface FormLine {
  description: string;
  hsn_sac: string;
  quantity: number;
  unit: string;
  rate: number;
  discount: number;
  tax_rate: number;
}

function formatDateInput(d: unknown): string {
  if (!d) return "";
  if (typeof d === "string") return d.slice(0, 10);
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  try {
    const parsed = new Date(d as any);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  } catch {
    // ignore
  }
  return String(d).slice(0, 10);
}

function NewInvoiceContent() {
  const { workspace, user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const getMembers = useServerFn(getWorkspaceMembersFn);

  // Edit mode param detection from search query (?edit=<invoiceId>)
  const editId = useRouterState({
    select: (s) => {
      const searchObj = s.location.search as Record<string, unknown> | undefined;
      const val = searchObj ? searchObj["edit"] : undefined;
      return typeof val === "string" ? val : null;
    },
  });

  const editInvoiceQuery = useQuery({
    queryKey: qk.invoice(editId || ""),
    queryFn: () => getInvoice(editId!),
    enabled: !!editId,
  });

  // Queries
  const customersQuery = useQuery({
    queryKey: qk.customers(workspace.id),
    queryFn: () => listCustomers(workspace.id),
    enabled: !!workspace.id,
  });

  const leadsQuery = useQuery({
    queryKey: ["leads", workspace.id],
    queryFn: () => listLeads(workspace.id),
    enabled: !!workspace.id,
  });

  const propertiesQuery = useQuery({
    queryKey: ["properties", workspace.id],
    queryFn: () => listProperties(workspace.id),
    enabled: !!workspace.id,
  });

  const membersQuery = useQuery({
    queryKey: ["workspace-members", workspace.id],
    queryFn: () => getMembers({ data: { workspaceId: workspace.id } }),
    enabled: !!workspace.id,
  });

  const invNumberQuery = useQuery({
    queryKey: ["nextInvoiceNumber", workspace.id],
    queryFn: () => nextInvoiceNumber(workspace.id),
    enabled: !!workspace.id && !editId,
  });

  // State
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceType, setInvoiceType] = useState("Tax Invoice");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [assignedTo, setAssignedTo] = useState(user.id);
  const [issueDate, setIssueDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState<string | null>(
    new Date(Date.now() + (Number(workspace.defaultPaymentTermsDays) || 14) * 86400000)
      .toISOString()
      .slice(0, 10),
  );
  const [placeOfSupply, setPlaceOfSupply] = useState(workspace.state ?? "");
  const [notes, setNotes] = useState(
    workspace.defaultInvoiceNotes ?? "Thank you for your business.",
  );
  const [terms, setTerms] = useState(
    workspace.defaultInvoiceTerms ??
      "Payment due within stipulated terms. All disputes subject to local jurisdiction.",
  );

  // Line items state
  const [lines, setLines] = useState<FormLine[]>([
    {
      description: "Real Estate Brokerage & Consulting Services",
      hsn_sac: "997212",
      quantity: 1,
      unit: "service",
      rate: 100000,
      discount: 0,
      tax_rate: 18,
    },
  ]);

  // Pre-populate fields when editing an existing draft
  const [hasInitializedEdit, setHasInitializedEdit] = useState(false);
  useEffect(() => {
    if (editInvoiceQuery.data && !hasInitializedEdit) {
      const { invoice, items } = editInvoiceQuery.data;
      if (invoice.status !== "Draft") {
        toast.error(
          "Only draft invoices can be edited. Historical financial records are protected.",
        );
        navigate({ to: `/app/finance/invoices/${invoice.id}` });
        return;
      }

      setInvoiceNumber(invoice.invoice_number);
      if (invoice.invoice_type) setInvoiceType(invoice.invoice_type);
      if (invoice.customer_id) setSelectedCustomerId(invoice.customer_id);
      if (invoice.lead_id) setSelectedLeadId(invoice.lead_id);
      if (invoice.property_id) setSelectedPropertyId(invoice.property_id);
      if (invoice.assigned_to) setAssignedTo(invoice.assigned_to);
      if (invoice.issue_date) setIssueDate(formatDateInput(invoice.issue_date));
      if (invoice.due_date) setDueDate(formatDateInput(invoice.due_date));
      if (invoice.place_of_supply) setPlaceOfSupply(invoice.place_of_supply);
      if (invoice.notes !== null && invoice.notes !== undefined) setNotes(invoice.notes);
      if (invoice.terms !== null && invoice.terms !== undefined) setTerms(invoice.terms);
      if (items && items.length > 0) {
        setLines(
          items.map((it) => ({
            description: it.description || "",
            hsn_sac: it.hsn_sac || "997212",
            quantity: Number(it.quantity) || 1,
            unit: it.unit || "unit",
            rate: Number(it.rate ?? it.unit_amount ?? 0),
            discount: Number(it.discount) || 0,
            tax_rate: Number(it.tax_rate ?? invoice.tax_rate ?? 18),
          })),
        );
      }
      setHasInitializedEdit(true);
    }
  }, [editInvoiceQuery.data, hasInitializedEdit, navigate]);

  // Sync auto-generated invoice number when loaded for new invoices
  useEffect(() => {
    if (!editId && invNumberQuery.data?.invoiceNumber && !invoiceNumber) {
      setInvoiceNumber(invNumberQuery.data.invoiceNumber);
    }
  }, [editId, invNumberQuery.data, invoiceNumber]);

  // Selected customer object
  const selectedCustomer = useMemo(() => {
    if (!customersQuery.data || !selectedCustomerId) return null;
    return customersQuery.data.find((c) => c.id === selectedCustomerId) ?? null;
  }, [customersQuery.data, selectedCustomerId]);

  // When customer changes, auto-populate place of supply if customer has city/state
  useEffect(() => {
    if (selectedCustomer?.city && !placeOfSupply) {
      setPlaceOfSupply(selectedCustomer.city);
    }
  }, [selectedCustomer, placeOfSupply]);

  // Calculations
  const calculated = useMemo(() => {
    let subtotal = 0;
    let totalDiscount = 0;
    let taxableAmount = 0;
    let totalTax = 0;

    const lineCalculations = lines.map((l) => {
      const gross = Math.max(0, Number(l.quantity) * Number(l.rate));
      const disc = Math.min(gross, Math.max(0, Number(l.discount)));
      const taxable = Math.max(0, gross - disc);
      const tax = (taxable * Number(l.tax_rate)) / 100;
      const lineTotal = taxable + tax;

      subtotal += gross;
      totalDiscount += disc;
      taxableAmount += taxable;
      totalTax += tax;

      return { gross, disc, taxable, tax, lineTotal };
    });

    // Check if intra-state or inter-state
    const isInterState =
      workspace.state &&
      placeOfSupply &&
      workspace.state.trim().toLowerCase() !== placeOfSupply.trim().toLowerCase();

    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    if (isInterState) {
      igst = totalTax;
    } else {
      cgst = totalTax / 2;
      sgst = totalTax / 2;
    }

    const grandTotal = taxableAmount + totalTax;

    return {
      subtotal,
      totalDiscount,
      taxableAmount,
      totalTax,
      cgst,
      sgst,
      igst,
      grandTotal,
      isInterState,
      lineCalculations,
    };
  }, [lines, workspace.state, placeOfSupply]);

  // Mutation
  const saveMutation = useMutation({
    mutationFn: async (status: "Draft" | "Issued") => {
      if (!selectedCustomerId) {
        throw new Error("Please select a customer.");
      }
      if (lines.length === 0) {
        throw new Error("Please add at least one line item.");
      }
      if (lines.some((l) => !l.description.trim() || Number(l.rate) < 0)) {
        throw new Error("All line items must have a valid description and non-negative rate.");
      }

      const lineInputs: InvoiceLineInput[] = lines.map((l, idx) => ({
        description: l.description.trim(),
        hsn_sac: l.hsn_sac.trim() || null,
        quantity: Number(l.quantity) || 1,
        unit: l.unit.trim() || "unit",
        unit_amount: Number(l.rate) || 0,
        rate: Number(l.rate) || 0,
        discount: Number(l.discount) || 0,
        tax_rate: Number(l.tax_rate) || 0,
        position: idx,
      }));

      return saveInvoice({
        ...(editId ? { id: editId } : {}),
        workspaceId: workspace.id,
        invoice: {
          invoice_number:
            invoiceNumber.trim() || (invNumberQuery.data?.invoiceNumber ?? `INV-${Date.now()}`),
          invoice_type: invoiceType,
          customer_id: selectedCustomerId,
          lead_id: selectedLeadId || null,
          property_id: selectedPropertyId || null,
          assigned_to: assignedTo || null,
          status,
          issue_date: issueDate,
          due_date: dueDate,
          currency: workspace.currency ?? "INR",
          tax_rate: lines[0]?.tax_rate ?? 18,
          place_of_supply: placeOfSupply.trim() || null,
          notes: notes.trim() || null,
          terms: terms.trim() || null,
        },
        lines: lineInputs,
      });
    },
    onSuccess: (savedInvoice) => {
      queryClient.invalidateQueries({ queryKey: qk.invoice(savedInvoice.id) });
      queryClient.invalidateQueries({ queryKey: qk.invoices(workspace.id) });
      queryClient.invalidateQueries({ queryKey: ["dashboard", workspace.id] });
      toast.success(
        editId
          ? `Draft invoice ${savedInvoice.invoice_number} updated successfully.`
          : `Invoice ${savedInvoice.invoice_number} saved as ${savedInvoice.status} successfully.`,
      );
      navigate({ to: `/app/finance/invoices/${savedInvoice.id}` });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to save invoice.");
    },
  });

  const handleAddLine = () => {
    setLines([
      ...lines,
      {
        description: "",
        hsn_sac: "997212",
        quantity: 1,
        unit: "unit",
        rate: 0,
        discount: 0,
        tax_rate: 18,
      },
    ]);
  };

  const handleRemoveLine = (idx: number) => {
    if (lines.length === 1) {
      toast.error("An invoice must have at least one line item.");
      return;
    }
    setLines(lines.filter((_, i) => i !== idx));
  };

  const updateLine = (idx: number, patch: Partial<FormLine>) => {
    setLines(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const currency = (workspace.currency ?? "INR") as any;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/app/finance/invoices">
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Invoices
        </Link>
      </Button>

      <PageHeader
        title={editId ? `Edit Draft Invoice (${invoiceNumber || "Draft"})` : "Create New Invoice"}
        description={
          editId
            ? "Update line items, taxes, and details for this existing draft invoice."
            : "Draft or issue a compliant invoice with live workspace billing identity and line item taxes."
        }
      />

      <div className="space-y-6">
        {/* Supplier & Customer Header Card */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Supplier Info */}
          <SectionCard
            title="Supplier (Seller)"
            description="Loaded from your workspace business profile."
            className="h-full"
          >
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3">
                {workspace.logoUrl ? (
                  <img
                    src={workspace.logoUrl}
                    alt={workspace.name}
                    className="h-10 w-auto max-w-[100px] object-contain rounded border p-0.5 bg-background"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    <Building2 className="h-5 w-5" />
                  </div>
                )}
                <div>
                  <p className="font-semibold text-foreground text-base">
                    {workspace.legalName || workspace.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{workspace.code}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-border">
                <div>
                  <span className="text-muted-foreground">GSTIN: </span>
                  <span className="font-medium text-foreground">{workspace.gstin || "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">PAN: </span>
                  <span className="font-medium text-foreground">{workspace.pan || "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">State: </span>
                  <span className="font-medium text-foreground">{workspace.state || "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">State Code: </span>
                  <span className="font-medium text-foreground">{workspace.stateCode || "—"}</span>
                </div>
              </div>

              {workspace.address && (
                <p className="text-xs text-muted-foreground pt-1">{workspace.address}</p>
              )}
            </div>
          </SectionCard>

          {/* Customer Selection */}
          <SectionCard
            title="Customer (Buyer)"
            description="Select customer from your real database."
            className="h-full"
          >
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="customerSelect">Select Customer *</Label>
                <DataState query={customersQuery} loadingLabel="Loading customers…">
                  {(customers) => (
                    <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                      <SelectTrigger id="customerSelect" className="h-10">
                        <SelectValue placeholder="Choose customer from database…" />
                      </SelectTrigger>
                      <SelectContent>
                        {customers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name} {c.city ? `· ${c.city}` : ""} ({c.type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </DataState>
              </div>

              {selectedCustomer && (
                <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1.5 border border-border">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Contact:</span>
                    <span className="font-medium text-foreground">
                      {selectedCustomer.phone || selectedCustomer.email || "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">City / Region:</span>
                    <span className="font-medium text-foreground">
                      {selectedCustomer.city || "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status / Type:</span>
                    <span className="font-medium text-foreground capitalize">
                      {selectedCustomer.status} · {selectedCustomer.type}
                    </span>
                  </div>
                </div>
              )}

              {/* Linked CRM Entities */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
                <div className="space-y-1">
                  <Label className="text-xs">Linked Lead (Optional)</Label>
                  <Select value={selectedLeadId} onValueChange={setSelectedLeadId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {(leadsQuery.data ?? []).map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name} ({l.status})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Linked Property (Optional)</Label>
                  <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {(propertiesQuery.data ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} ({p.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* Invoice Metadata */}
        <SectionCard
          title="Invoice Details"
          description="Document numbering, dates, and statutory tax jurisdiction."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Invoice Number *</Label>
              <Input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder={invNumberQuery.data?.invoiceNumber ?? "Generating…"}
                className="font-mono font-semibold"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Invoice Type</Label>
              <Select value={invoiceType} onValueChange={setInvoiceType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVOICE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Invoice Date</Label>
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <DateTimeField
                label="Due Date"
                value={dueDate}
                onChange={setDueDate}
                withTime={false}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Place of Supply (State)</Label>
              <Input
                value={placeOfSupply}
                onChange={(e) => setPlaceOfSupply(e.target.value)}
                placeholder="e.g. Maharashtra"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Assigned To</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(membersQuery.data ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.full_name} ({m.user_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Input value={workspace.currency ?? "INR"} disabled className="bg-muted font-mono" />
            </div>

            <div className="space-y-1.5">
              <Label>Tax Treatment</Label>
              <div className="h-9 px-3 rounded-md bg-muted/60 border border-border flex items-center text-xs font-medium">
                {calculated.isInterState
                  ? "Inter-state (IGST applied)"
                  : "Intra-state (CGST + SGST split 50/50)"}
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Line Items Table */}
        <SectionCard
          title="Line Items & Services"
          description="Detailed breakdown with HSN/SAC codes, quantities, rates, and tax rates."
        >
          <div className="space-y-4">
            <div className="hidden lg:grid grid-cols-[minmax(200px,2fr)_100px_80px_100px_110px_90px_90px_110px_40px] gap-2 px-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <span>Description</span>
              <span>HSN/SAC</span>
              <span>Qty</span>
              <span>Unit</span>
              <span>Rate ({workspace.currency})</span>
              <span>Disc</span>
              <span>GST %</span>
              <span className="text-right">Line Total</span>
              <span></span>
            </div>

            <div className="space-y-3">
              {lines.map((line, idx) => {
                const lineCalc = calculated.lineCalculations[idx];
                return (
                  <div
                    key={idx}
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(200px,2fr)_100px_80px_100px_110px_90px_90px_110px_40px] gap-2 items-center p-3 sm:p-2 rounded-lg border border-border bg-card"
                  >
                    <div className="sm:col-span-2 lg:col-span-1 space-y-1">
                      <Label className="lg:hidden text-xs">Description</Label>
                      <Input
                        placeholder="e.g. Brokerage fee for property booking"
                        value={line.description}
                        onChange={(e) => updateLine(idx, { description: e.target.value })}
                        required
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="lg:hidden text-xs">HSN/SAC</Label>
                      <Input
                        placeholder="997212"
                        value={line.hsn_sac}
                        onChange={(e) => updateLine(idx, { hsn_sac: e.target.value })}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="lg:hidden text-xs">Qty</Label>
                      <Input
                        type="number"
                        min="1"
                        value={line.quantity}
                        onChange={(e) =>
                          updateLine(idx, {
                            quantity: Math.max(1, parseInt(e.target.value, 10) || 1),
                          })
                        }
                        required
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="lg:hidden text-xs">Unit</Label>
                      <Select
                        value={line.unit}
                        onValueChange={(val) => updateLine(idx, { unit: val })}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {UNITS.map((u) => (
                            <SelectItem key={u} value={u}>
                              {u}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="lg:hidden text-xs">Rate</Label>
                      <MoneyInput
                        allowDecimals
                        currency={currency}
                        placeholder="0.00"
                        value={line.rate}
                        onChange={(val) => updateLine(idx, { rate: val })}
                        required
                        className="h-9 text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="lg:hidden text-xs">Discount</Label>
                      <MoneyInput
                        allowDecimals
                        currency={currency}
                        placeholder="0.00"
                        value={line.discount}
                        onChange={(val) => updateLine(idx, { discount: val })}
                        className="h-9 text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="lg:hidden text-xs">GST %</Label>
                      <Select
                        value={String(line.tax_rate)}
                        onValueChange={(val) => updateLine(idx, { tax_rate: Number(val) })}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TAX_RATES.map((r) => (
                            <SelectItem key={r} value={String(r)}>
                              {r}%
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1 text-right sm:col-span-2 lg:col-span-1">
                      <Label className="lg:hidden text-xs block text-left">Line Total</Label>
                      <p className="font-semibold text-foreground text-sm py-2">
                        {formatMoney(lineCalc?.lineTotal ?? 0, currency)}
                      </p>
                    </div>

                    <div className="flex justify-end lg:justify-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive h-8 w-8 hover:bg-destructive/10"
                        onClick={() => handleRemoveLine(idx)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddLine}
              className="mt-2"
            >
              <Plus className="mr-1.5 h-4 w-4" /> Add Item Line
            </Button>
          </div>
        </SectionCard>

        {/* Notes, Terms & Summary */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <SectionCard
              title="Invoice Notes & Terms"
              description="Will be printed at the bottom of the invoice document."
            >
              <div className="space-y-4">
                <div>
                  <Label className="text-xs">Invoice Notes</Label>
                  <Textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Thank you for your business."
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Terms & Conditions</Label>
                  <Textarea
                    rows={3}
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                    placeholder="Payment due within stipulated terms."
                    className="mt-1"
                  />
                </div>
              </div>
            </SectionCard>
          </div>

          <div>
            <SectionCard title="Financial Summary" description="Real-time tax and total breakdown.">
              <dl className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Gross Subtotal</dt>
                  <dd className="font-medium text-foreground">
                    {formatMoney(calculated.subtotal, currency)}
                  </dd>
                </div>
                {calculated.totalDiscount > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <dt>Total Discount</dt>
                    <dd className="font-medium">
                      - {formatMoney(calculated.totalDiscount, currency)}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between pt-1 border-t border-border">
                  <dt className="text-muted-foreground">Taxable Amount</dt>
                  <dd className="font-medium text-foreground">
                    {formatMoney(calculated.taxableAmount, currency)}
                  </dd>
                </div>

                {calculated.isInterState ? (
                  <div className="flex justify-between text-xs">
                    <dt className="text-muted-foreground">IGST (Inter-state)</dt>
                    <dd className="font-medium text-foreground">
                      {formatMoney(calculated.igst, currency)}
                    </dd>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between text-xs">
                      <dt className="text-muted-foreground">CGST (Intra-state)</dt>
                      <dd className="font-medium text-foreground">
                        {formatMoney(calculated.cgst, currency)}
                      </dd>
                    </div>
                    <div className="flex justify-between text-xs">
                      <dt className="text-muted-foreground">SGST (Intra-state)</dt>
                      <dd className="font-medium text-foreground">
                        {formatMoney(calculated.sgst, currency)}
                      </dd>
                    </div>
                  </>
                )}

                <div className="border-border flex justify-between border-t pt-3 text-base font-bold">
                  <dt>Grand Total</dt>
                  <dd className="text-primary text-lg">
                    {formatMoney(calculated.grandTotal, currency)}
                  </dd>
                </div>
              </dl>

              {calculated.grandTotal > 0 && (
                <AmountInWords
                  amount={calculated.grandTotal}
                  currency={currency}
                  className="mt-3"
                  label="In words:"
                />
              )}

              <div className="mt-6 space-y-2.5">
                <Button
                  type="button"
                  className="w-full font-semibold"
                  disabled={saveMutation.isPending}
                  onClick={() => saveMutation.mutate("Issued")}
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="mr-1.5 h-4 w-4" />
                  )}
                  {editId ? "Update & Issue Invoice" : "Issue Invoice"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={saveMutation.isPending}
                  onClick={() => saveMutation.mutate("Draft")}
                >
                  {editId ? "Save Changes to Draft" : "Save as Draft"}
                </Button>
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    </div>
  );
}
