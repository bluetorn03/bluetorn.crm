import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Mail,
  MessageCircle,
  Phone,
  CalendarPlus,
  Archive,
  Edit,
  Trash2,
  StickyNote,
  Building2,
  Clock,
  CheckCircle2,
  FileText,
  CreditCard,
  UserCheck,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { AiInsightCard } from "@/components/common/AiInsightCard";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getCustomer,
  listInvoices,
  listLeads,
  listLeadActivity,
  listMembers,
  listPayments,
  listProperties,
  listTasks,
  updateCustomer,
  qk,
} from "@/lib/crm-api";
import { useSession } from "@/hooks/use-session";
import { formatDate, formatDateTime, formatMoney, initials, type CurrencyCode } from "@/lib/format";
import { EditCustomerDialog } from "@/components/crm/EditCustomerDialog";
import { DeleteCustomerDialog } from "@/components/crm/DeleteCustomerDialog";
import { AssignCustomerDialog } from "@/components/crm/AssignCustomerDialog";
import { toast } from "sonner";
import { formatWhatsAppUrl, getGmailComposeUrl, normalizePhoneForTel } from "@/lib/communication";

export const Route = createFileRoute("/app/customers/$customerId")({
  head: () => ({
    meta: [
      { title: "Customer · BLUETORN CRM" },
      { name: "description", content: "Customer profile, relationship history, leads, and finances." },
    ],
  }),
  component: CustomerDetailPage,
});

const tabs = ["Overview", "Timeline", "Leads", "Invoices", "Tasks", "Properties"] as const;

function CustomerDetailPage() {
  const { customerId } = Route.useParams();
  const { workspace, user, role, dbRole } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const canAssign =
    role === "Owner" ||
    role === "Manager" ||
    role === "Super Admin" ||
    dbRole === "owner" ||
    dbRole === "manager" ||
    dbRole === "super_admin";

  const [editOpen, setEditOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const customerQuery = useQuery({
    queryKey: qk.customer(customerId),
    queryFn: () => getCustomer(customerId),
    enabled: !!customerId,
  });

  const customer = customerQuery.data;

  const membersQuery = useQuery({
    queryKey: qk.members(workspace.id),
    queryFn: () => listMembers(workspace.id),
    enabled: !!workspace.id,
  });

  const invoicesQuery = useQuery({
    queryKey: qk.invoices(workspace.id),
    queryFn: () => listInvoices(workspace.id),
    enabled: !!workspace.id,
  });

  const paymentsQuery = useQuery({
    queryKey: qk.payments(workspace.id),
    queryFn: () => listPayments(workspace.id),
    enabled: !!workspace.id,
  });

  const leadsQuery = useQuery({
    queryKey: qk.leads(workspace.id),
    queryFn: () => listLeads(workspace.id),
    enabled: !!workspace.id,
  });

  const propertiesQuery = useQuery({
    queryKey: qk.properties(workspace.id),
    queryFn: () => listProperties(workspace.id),
    enabled: !!workspace.id,
  });

  const tasksQuery = useQuery({
    queryKey: qk.tasks(workspace.id),
    queryFn: () => listTasks(workspace.id),
    enabled: !!workspace.id,
  });

  const allLeads = leadsQuery.data || [];
  const allInvoices = invoicesQuery.data || [];
  const allPayments = paymentsQuery.data || [];
  const allTasks = tasksQuery.data || [];
  const allProperties = propertiesQuery.data || [];

  const custLeads = allLeads.filter((l) => l.customer_id === customerId);

  const archiveMutation = useMutation({
    mutationFn: () =>
      updateCustomer(customerId, {
        status: "Archived",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.customer(customerId) });
      queryClient.invalidateQueries({ queryKey: qk.customers(workspace.id) });
      toast.success("Customer archived.");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to archive customer.");
    },
  });

  const leadActivitiesQuery = useQuery({
    queryKey: ["customer-lead-activities", customerId, custLeads.map((l) => l.id).join(",")],
    queryFn: async () => {
      if (custLeads.length === 0) return [];
      const results = await Promise.all(custLeads.map((l) => listLeadActivity(l.id).catch(() => [])));
      return results.flat();
    },
    enabled: !!customer && custLeads.length > 0,
  });

  if (customerQuery.isLoading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Loading customer details…</div>;
  }

  if (!customer) {
    return (
      <EmptyState
        icon={StickyNote}
        title="Customer not found"
        description="This record may have been archived or moved to another workspace."
        action={
          <Button asChild>
            <Link to="/app/customers">Back to customers</Link>
          </Button>
        }
      />
    );
  }

  const custInvoices = allInvoices.filter((i) => i.customer_id === customer.id);
  const custPayments = allPayments.filter(
    (p) => p.customer_id === customer.id || custInvoices.some((i) => i.id === p.invoice_id),
  );
  const custTasks = allTasks.filter(
    (t) => t.customer_id === customer.id || (t.lead_id && custLeads.some((l) => l.id === t.lead_id)),
  );

  const linkedPropertyIds = new Set([
    ...custLeads.map((l) => l.property_id).filter(Boolean),
    ...custInvoices.map((i) => i.property_id).filter(Boolean),
  ]);
  const custProperties = allProperties.filter((p) => linkedPropertyIds.has(p.id));

  const totalReceivedPayments = custPayments
    .filter((p) => p.status === "Received")
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const lifetimeValue = totalReceivedPayments > 0 ? totalReceivedPayments : Number(customer.value || 0);

  const timelineEvents = [
    {
      id: `created-${customer.id}`,
      at: customer.created_at,
      title: "Customer Profile Created",
      description: `Registered as ${customer.type} · ${customer.city || "City N/A"}`,
      kind: "created" as const,
    },
    ...custLeads.map((l) => ({
      id: `lead-${l.id}`,
      at: l.created_at,
      title: `Associated Lead: ${l.name}`,
      description: `Source: ${l.source} · Status: ${l.status} · Budget: ${l.budget ? formatMoney(l.budget, (l.currency || "INR") as any) : "N/A"}`,
      kind: "lead" as const,
    })),
    ...(leadActivitiesQuery.data || []).map((a) => ({
      id: `act-${a.id}`,
      at: a.created_at,
      title: `Activity: ${a.type} (${a.actor_label || "User"})`,
      description: a.note,
      kind: "activity" as const,
    })),
    ...custInvoices.map((i) => ({
      id: `inv-${i.id}`,
      at: i.created_at,
      title: `Invoice #${i.invoice_number} Issued`,
      description: `Status: ${i.status} · Total: ${formatMoney(i.total, (i.currency || "INR") as any)}`,
      kind: "invoice" as const,
    })),
    ...custPayments.map((p) => ({
      id: `pay-${p.id}`,
      at: p.paid_at || p.created_at,
      title: `Payment ${p.status === "Received" ? "Received" : p.status} (${p.method})`,
      description: `Ref: ${p.reference || "N/A"} · Amount: ${formatMoney(p.amount, (p.currency || "INR") as any)}`,
      kind: "payment" as const,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  let tagsArray: string[] = [];
  if (customer.tags) {
    try {
      tagsArray = typeof customer.tags === "string" ? JSON.parse(customer.tags) : customer.tags;
    } catch {
      tagsArray = [String(customer.tags)];
    }
  }

  const assignedEmployee = membersQuery.data?.find((m) => m.id === customer.assigned_to);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/app/customers">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Customers
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          {canAssign && (
            <Button variant="outline" size="sm" onClick={() => setAssignOpen(true)}>
              <UserCheck className="mr-1.5 h-4 w-4 text-primary" /> {customer.assigned_to ? "Reassign Customer" : "Assign Customer"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Edit className="mr-1.5 h-4 w-4" /> Edit Details
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="mr-1.5 h-4 w-4" /> Delete
          </Button>
        </div>
      </div>

      <div className="bg-card border-border elev-1 rounded-xl border p-4 sm:p-5">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 sm:flex sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="bg-primary text-primary-foreground grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-semibold">
              {initials(customer.name)}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold sm:text-xl">{customer.name}</h1>
              <p className="text-muted-foreground truncate text-xs">
                {customer.type} · {customer.city || "N/A"} · Assigned to: {assignedEmployee?.full_name || "Unassigned"}
              </p>
            </div>
          </div>
          <StatusBadge label={customer.status} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {customer.phone && (
            <Button size="sm" variant="outline" asChild>
              <a href={`tel:${normalizePhoneForTel(customer.phone)}`}>
                <Phone className="mr-1.5 h-4 w-4 text-emerald-600" /> Call
              </a>
            </Button>
          )}
          {customer.phone && (() => {
            const waUrl = formatWhatsAppUrl(customer.phone, `Hello ${customer.name}, this is ${user.name} from ${workspace.name}.`);
            return waUrl ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  window.open(waUrl, "_blank", "noopener,noreferrer");
                  toast.info("Opening WhatsApp…");
                }}
              >
                <MessageCircle className="mr-1.5 h-4 w-4 text-emerald-600" /> WhatsApp
              </Button>
            ) : null;
          })()}
          {customer.email && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const subject = `Update regarding your account with ${workspace.name}`;
                const body = `Hello ${customer.name},\n\nI am writing to you from ${workspace.name}.\n\nRegards,\n${user.name}`;
                const gmailUrl = getGmailComposeUrl(customer.email!, subject, body);
                toast.success(`Opening Gmail Compose for ${customer.email}…`);
                window.open(gmailUrl, "_blank", "noopener,noreferrer");
              }}
            >
              <Mail className="mr-1.5 h-4 w-4 text-blue-600" /> Compose Email
            </Button>
          )}
          <Button size="sm" onClick={() => navigate({ to: "/app/calendar" })}>
            <CalendarPlus className="mr-1.5 h-4 w-4" /> Next Action
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => archiveMutation.mutate()}
            disabled={archiveMutation.isPending || customer.status === "Archived"}
          >
            <Archive className="mr-1.5 h-4 w-4" /> Archive
          </Button>
        </div>
      </div>

      <AssignCustomerDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        customer={customer}
      />
      <EditCustomerDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        customer={customer}
      />
      <DeleteCustomerDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        customer={customer}
        onDeleted={() => navigate({ to: "/app/customers" })}
      />

      <Tabs defaultValue="Overview">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          {tabs.map((t) => (
            <TabsTrigger key={t} value={t} className="text-xs">
              {t}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="Overview" className="mt-4 grid gap-4 lg:grid-cols-3">
          <SectionCard className="lg:col-span-2" title="Details">
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              {[
                ["Phone", customer.phone || "—"],
                ["Email", customer.email || "—"],
                ["Type", customer.type],
                ["City", customer.city || "—"],
                ["Assigned Employee", assignedEmployee?.full_name || "Unassigned"],
                [
                  "Assigned at",
                  customer.assigned_at
                    ? formatDateTime(customer.assigned_at)
                    : customer.assigned_to
                      ? "Assigned"
                      : "—",
                ],
                ["Customer Value / Budget", formatMoney(lifetimeValue, (customer.currency as CurrencyCode) || "INR")],
                ["Last activity", formatDate(customer.updated_at)],
              ].map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-muted-foreground text-xs">{k}</dt>
                  <dd className="mt-0.5 truncate font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            {tagsArray.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {tagsArray.map((t) => (
                  <span key={t} className="bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-xs">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </SectionCard>
          <div className="space-y-4">
            <SectionCard title="Assigned employee">
              <div className="space-y-3">
                {assignedEmployee ? (
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                      {initials(assignedEmployee.full_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {assignedEmployee.full_name}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {assignedEmployee.email || "Workspace team member"}
                      </p>
                      {customer.assigned_at && (
                        <p className="text-muted-foreground mt-0.5 text-xs">
                          Assigned: {formatDateTime(customer.assigned_at)}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No employee assigned.</p>
                )}

                {canAssign && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setAssignOpen(true)}
                  >
                    <UserCheck className="mr-1.5 h-4 w-4" />
                    {customer.assigned_to ? "Reassign Customer" : "Assign Customer"}
                  </Button>
                )}
              </div>
            </SectionCard>
            <AiInsightCard
              lines={[
                `Registered customer record in ${workspace.name}.`,
                `${custLeads.length} lead(s) associated with this profile.`,
                `${custInvoices.length} total invoice(s) and ${custPayments.length} payment(s) recorded.`,
              ]}
            />
          </div>
        </TabsContent>

        <TabsContent value="Timeline" className="mt-4">
          <SectionCard title="Relationship timeline" description="Complete chronological audit trail from database records">
            {timelineEvents.length === 0 ? (
              <p className="text-muted-foreground text-sm">No activity recorded yet.</p>
            ) : (
              <ol className="relative space-y-4">
                {timelineEvents.map((evt, idx) => (
                  <li key={evt.id} className="relative flex gap-3">
                    {idx !== timelineEvents.length - 1 && (
                      <span className="bg-border absolute top-8 left-[15px] h-[calc(100%+8px)] w-px" />
                    )}
                    <span className="bg-accent text-accent-foreground grid h-8 w-8 shrink-0 place-items-center rounded-full">
                      {evt.kind === "created" && <UserCheck className="h-3.5 w-3.5 text-primary" />}
                      {evt.kind === "lead" && <UserCheck className="h-3.5 w-3.5 text-blue-600" />}
                      {evt.kind === "activity" && <Clock className="h-3.5 w-3.5 text-emerald-600" />}
                      {evt.kind === "invoice" && <FileText className="h-3.5 w-3.5 text-amber-600" />}
                      {evt.kind === "payment" && <CreditCard className="h-3.5 w-3.5 text-emerald-600" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">{evt.title}</p>
                        <span className="text-muted-foreground text-xs shrink-0">{formatDateTime(evt.at)}</span>
                      </div>
                      {evt.description && (
                        <p className="text-muted-foreground mt-0.5 text-xs whitespace-pre-wrap">
                          {evt.description}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="Leads" className="mt-4">
          <SectionCard bodyClassName="p-0">
            {custLeads.length === 0 ? (
              <p className="text-muted-foreground p-4 text-sm">No linked leads found for this customer.</p>
            ) : (
              <ul className="divide-border divide-y">
                {custLeads.map((l) => (
                  <li key={l.id}>
                    <Link to="/app/leads/$leadId" params={{ leadId: l.id }} className="hover:bg-accent/50 flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{l.name}</p>
                        <p className="text-muted-foreground text-xs">Source: {l.source} · Budget: {l.budget ? formatMoney(l.budget, (l.currency || "INR") as any) : "N/A"}</p>
                      </div>
                      <StatusBadge label={l.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="Properties" className="mt-4">
          <SectionCard bodyClassName="p-0">
            {custProperties.length === 0 ? (
              <p className="text-muted-foreground p-4 text-sm">No properties linked to this customer's leads or invoices yet.</p>
            ) : (
              <ul className="divide-border divide-y">
                {custProperties.map((p) => {
                  const isInterested = custLeads.some((l) => l.property_id === p.id);
                  const isInvoiced = custInvoices.some((i) => i.property_id === p.id);
                  return (
                    <li key={p.id}>
                      <Link to="/app/properties/$propertyId" params={{ propertyId: p.id }} className="hover:bg-accent/50 flex items-center gap-3 px-4 py-3">
                        <Building2 className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{p.name}</p>
                          <p className="text-muted-foreground text-xs">{p.location || "Location not set"} · {formatMoney(p.price, (p.currency || "INR") as any, true)}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isInterested && (
                            <span className="rounded-full bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-300">
                              Interested
                            </span>
                          )}
                          {isInvoiced && (
                            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                              Invoiced Deal
                            </span>
                          )}
                          <StatusBadge label={p.status} />
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="Tasks" className="mt-4">
          <SectionCard bodyClassName="p-0">
            {custTasks.length === 0 ? (
              <p className="text-muted-foreground p-4 text-sm">No tasks assigned to this customer.</p>
            ) : (
              <ul className="divide-border divide-y">
                {custTasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{t.title}</p>
                      <p className="text-muted-foreground text-xs">{t.priority} priority {t.due_at ? `· Due: ${formatDate(t.due_at)}` : ""}</p>
                    </div>
                    <StatusBadge label={t.status} />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="Invoices" className="mt-4">
          {custInvoices.length ? (
            <SectionCard bodyClassName="p-0">
              <ul className="divide-border divide-y">
                {custInvoices.map((i) => (
                  <li key={i.id}>
                    <Link to="/app/finance/invoices/$invoiceId" params={{ invoiceId: i.id }} className="hover:bg-accent/50 flex items-center gap-3 px-4 py-3">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{i.invoice_number}</span>
                      <span className="text-muted-foreground text-xs">{formatMoney(i.total, (i.currency as CurrencyCode) || "INR")}</span>
                      <StatusBadge label={i.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : (
            <EmptyState
              icon={StickyNote}
              title="No invoices yet"
              description="Create the first invoice for this customer."
              action={<Button onClick={() => navigate({ to: "/app/finance/invoices/new" })}>Create invoice</Button>}
            />
          )}
        </TabsContent>

        <TabsContent value="Payments" className="mt-4">
          {custPayments.length ? (
            <SectionCard bodyClassName="p-0">
              <ul className="divide-border divide-y">
                {custPayments.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.reference || p.id}</span>
                    <span className="text-muted-foreground text-xs">{formatMoney(p.amount, (p.currency as CurrencyCode) || "INR")}</span>
                    <StatusBadge label={p.status} />
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : (
            <EmptyState icon={StickyNote} title="No payments recorded" description="Payments appear here once an invoice is settled." />
          )}
        </TabsContent>

        <TabsContent value="Notes" className="mt-4">
          <SectionCard title="Notes">
            <p className="text-muted-foreground text-sm">
              {customer.notes || "No notes added for this customer."}
            </p>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
