import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { DataState } from "@/components/common/DataState";
import { DateTimeField } from "@/components/common/DateTimeField";
import { PermissionGate } from "@/components/app/PermissionGate";
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
  listCustomers,
  nextInvoiceNumber,
  saveInvoice,
  invoiceTotals,
  qk,
  type InvoiceLineInput,
} from "@/lib/crm-api";
import { useSession } from "@/hooks/use-session";
import { formatMoney } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/app/finance/invoices/new")({
  head: () => ({
    meta: [
      { title: "New invoice · BLUETORN CRM" },
      { name: "description", content: "Build an invoice with line items, tax and payment terms." },
      { property: "og:title", content: "New invoice · BLUETORN CRM" },
      { property: "og:description", content: "Build an invoice with line items, tax and payment terms." },
    ],
  }),
  component: NewInvoicePage,
});

function NewInvoicePage() {
  return (
    <PermissionGate requires="manage.finance">
      <NewInvoiceContent />
    </PermissionGate>
  );
}

function NewInvoiceContent() {
  const { workspace, user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const customersQuery = useQuery({
    queryKey: qk.customers(workspace.id),
    queryFn: () => listCustomers(workspace.id),
    enabled: !!workspace.id,
  });

  const invNumberQuery = useQuery({
    queryKey: ["nextInvoiceNumber", workspace.id],
    queryFn: () => nextInvoiceNumber(workspace.id),
    enabled: !!workspace.id,
  });

  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [dueDate, setDueDate] = useState<string | null>(
    new Date(Date.now() + 14 * 86400000).toISOString(),
  );
  const [taxRate, setTaxRate] = useState(18);
  const [lines, setLines] = useState<InvoiceLineInput[]>([
    { description: "Brokerage & Facilitation Services", quantity: 1, unit_amount: 100000 },
  ]);

  const { subtotal, taxAmount, total } = useMemo(
    () => invoiceTotals(lines, taxRate),
    [lines, taxRate],
  );

  const saveMutation = useMutation({
    mutationFn: () =>
      saveInvoice({
        workspaceId: workspace.id,
        userId: user.id,
        invoice: {
          invoice_number: invNumberQuery.data ?? `INV-${Date.now()}`,
          customer_id: selectedCustomerId || null,
          due_date: dueDate,
          tax_rate: taxRate,
          status: "Draft",
          currency: workspace.currency,
        },
        lines,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.invoices(workspace.id) });
      toast.success(`Invoice ${invNumberQuery.data} created successfully.`);
      navigate({ to: "/app/finance/invoices" });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to create invoice.");
    },
  });

  const handleAddLine = () => {
    setLines([...lines, { description: "", quantity: 1, unit_amount: 0 }]);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length === 1) {
      toast.error("An invoice must have at least one line item.");
      return;
    }
    setLines(lines.filter((_, i) => i !== index));
  };

  const handleLineChange = (index: number, key: keyof InvoiceLineInput, val: string | number) => {
    setLines(
      lines.map((l, i) => {
        if (i !== index) return l;
        return { ...l, [key]: val };
      }),
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (lines.some((l) => !l.description.trim() || l.unit_amount <= 0)) {
      toast.error("Please fill in valid descriptions and rates for all line items.");
      return;
    }
    saveMutation.mutate();
  };

  const currency = (workspace.currency ?? "INR") as any;

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/app/finance/invoices">
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Invoices
        </Link>
      </Button>

      <PageHeader
        title="New invoice"
        description="Build an invoice with line items, tax and payment terms."
      />

      <form onSubmit={handleSubmit} className="space-y-5">
        <SectionCard title="Invoice Header">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Invoice Number</Label>
              <Input
                value={invNumberQuery.data ?? "Generating…"}
                disabled
                className="bg-muted font-semibold"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="customerSelect">Customer</Label>
              <DataState query={customersQuery} loadingLabel="Loading…">
                {(customers) => (
                  <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                    <SelectTrigger id="customerSelect">
                      <SelectValue placeholder="Select Customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} ({c.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </DataState>
            </div>

            <div className="space-y-1.5">
              <DateTimeField label="Due Date" value={dueDate} onChange={setDueDate} withTime={false} />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Line Items">
          <div className="space-y-3">
            {lines.map((line, idx) => (
              <div
                key={idx}
                className="flex flex-wrap items-end gap-3 border-border border-b pb-3 last:border-b-0 last:pb-0"
              >
                <div className="min-w-[200px] flex-1 space-y-1.5">
                  <Label>Description</Label>
                  <Input
                    placeholder="e.g. Booking Advance"
                    value={line.description}
                    onChange={(e) => handleLineChange(idx, "description", e.target.value)}
                    required
                  />
                </div>
                <div className="w-24 space-y-1.5">
                  <Label>Qty</Label>
                  <Input
                    type="number"
                    min="1"
                    value={line.quantity}
                    onChange={(e) => handleLineChange(idx, "quantity", parseInt(e.target.value, 10) || 1)}
                    required
                  />
                </div>
                <div className="w-36 space-y-1.5">
                  <Label>Rate ({workspace.currency})</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.unit_amount}
                    onChange={(e) =>
                      handleLineChange(idx, "unit_amount", parseFloat(e.target.value) || 0)
                    }
                    required
                  />
                </div>
                <div className="w-36 space-y-1.5">
                  <Label>Amount</Label>
                  <Input
                    value={formatMoney(line.quantity * line.unit_amount, currency)}
                    disabled
                    className="bg-muted font-medium"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-destructive shrink-0"
                  onClick={() => handleRemoveLine(idx)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            <Button type="button" variant="outline" size="sm" onClick={handleAddLine} className="mt-2">
              <Plus className="mr-1.5 h-4 w-4" /> Add Line Item
            </Button>
          </div>
        </SectionCard>

        <div className="grid gap-4 lg:grid-cols-3">
          <SectionCard className="lg:col-span-2" title="Taxes">
            <div className="space-y-1.5 sm:max-w-xs">
              <Label htmlFor="taxRate">GST Rate (%)</Label>
              <Input
                id="taxRate"
                type="number"
                min="0"
                max="100"
                value={taxRate}
                onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
              />
            </div>
          </SectionCard>

          <SectionCard title="Summary">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="font-medium">{formatMoney(subtotal, currency)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">GST ({taxRate}%)</dt>
                <dd className="font-medium">{formatMoney(taxAmount, currency)}</dd>
              </div>
              <div className="border-border flex justify-between border-t pt-2 text-base font-semibold">
                <dt>Grand Total</dt>
                <dd className="text-primary">{formatMoney(total, currency)}</dd>
              </div>
            </dl>

            <Button type="submit" className="mt-5 w-full" disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Create Invoice
            </Button>
          </SectionCard>
        </div>
      </form>
    </div>
  );
}
