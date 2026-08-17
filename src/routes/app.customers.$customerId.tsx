import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Mail, MessageCircle, Phone, CalendarPlus, Archive } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Timeline } from "@/components/common/Timeline";
import { AiInsightCard } from "@/components/common/AiInsightCard";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { activity, customerById, invoices, leads, payments, properties, tasks } from "@/lib/mock-data";
import { formatDate, formatMoney, initials } from "@/lib/format";
import { StickyNote } from "lucide-react";

export const Route = createFileRoute("/app/customers/$customerId")({
  head: () => ({
    meta: [
      { title: "Customer · BLUETORN CRM" },
      { name: "description", content: "Customer overview, timeline, leads, properties and finance." },
      { property: "og:title", content: "Customer · BLUETORN CRM" },
      { property: "og:description", content: "Customer overview and full relationship timeline." },
    ],
  }),
  component: CustomerDetail,
});

const tabs = ["Overview", "Timeline", "Leads", "Properties", "Tasks", "Invoices", "Payments", "Notes"];

function CustomerDetail() {
  const { customerId } = Route.useParams();
  const customer = customerById(customerId);

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

  const custInvoices = invoices.filter((i) => i.customerId === customer.id);
  const custPayments = payments.filter((p) => custInvoices.some((i) => i.id === p.invoiceId));

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/app/customers">
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Customers
        </Link>
      </Button>

      <div className="bg-card border-border elev-1 rounded-xl border p-4 sm:p-5">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 sm:flex sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="bg-primary text-primary-foreground grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-semibold">
              {initials(customer.name)}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold sm:text-xl">{customer.name}</h1>
              <p className="text-muted-foreground truncate text-xs">
                {customer.type} · {customer.city} · Owner: {customer.assignedTo}
              </p>
            </div>
          </div>
          <StatusBadge label={customer.status} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="outline"><Phone className="mr-1.5 h-4 w-4" /> Call</Button>
          <Button size="sm" variant="outline"><MessageCircle className="mr-1.5 h-4 w-4" /> WhatsApp</Button>
          <Button size="sm" variant="outline"><Mail className="mr-1.5 h-4 w-4" /> Email</Button>
          <Button size="sm"><CalendarPlus className="mr-1.5 h-4 w-4" /> Next Action</Button>
          <Button size="sm" variant="ghost" className="text-muted-foreground"><Archive className="mr-1.5 h-4 w-4" /> Archive</Button>
        </div>
      </div>

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
                ["Phone", customer.phone],
                ["Email", customer.email],
                ["Type", customer.type],
                ["City", customer.city],
                ["Lifetime value", formatMoney(customer.value, customer.currency)],
                ["Last activity", formatDate(customer.lastActivity)],
              ].map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-muted-foreground text-xs">{k}</dt>
                  <dd className="mt-0.5 truncate font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {customer.tags.map((t) => (
                <span key={t} className="bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-xs">
                  {t}
                </span>
              ))}
            </div>
          </SectionCard>
          <AiInsightCard
            lines={[
              "Best contact window is 6–8 PM based on past answered calls.",
              "Similar buyers closed within 21 days of first site visit.",
            ]}
          />
        </TabsContent>

        <TabsContent value="Timeline" className="mt-4">
          <SectionCard title="Relationship timeline">
            <Timeline items={activity} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="Leads" className="mt-4">
          <SectionCard bodyClassName="p-0">
            <ul className="divide-border divide-y">
              {leads.slice(0, 3).map((l) => (
                <li key={l.id}>
                  <Link to="/app/leads/$leadId" params={{ leadId: l.id }} className="hover:bg-accent/50 flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{l.name}</span>
                    <StatusBadge label={l.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </SectionCard>
        </TabsContent>

        <TabsContent value="Properties" className="mt-4">
          <SectionCard bodyClassName="p-0">
            <ul className="divide-border divide-y">
              {properties.slice(0, 2).map((p) => (
                <li key={p.id}>
                  <Link to="/app/properties/$propertyId" params={{ propertyId: p.id }} className="hover:bg-accent/50 flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                    <StatusBadge label={p.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </SectionCard>
        </TabsContent>

        <TabsContent value="Tasks" className="mt-4">
          <SectionCard bodyClassName="p-0">
            <ul className="divide-border divide-y">
              {tasks.slice(0, 4).map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                  <StatusBadge label={t.status} />
                </li>
              ))}
            </ul>
          </SectionCard>
        </TabsContent>

        <TabsContent value="Invoices" className="mt-4">
          {custInvoices.length ? (
            <SectionCard bodyClassName="p-0">
              <ul className="divide-border divide-y">
                {custInvoices.map((i) => (
                  <li key={i.id}>
                    <Link to="/app/finance/invoices/$invoiceId" params={{ invoiceId: i.id }} className="hover:bg-accent/50 flex items-center gap-3 px-4 py-3">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{i.number}</span>
                      <StatusBadge label={i.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : (
            <EmptyState icon={StickyNote} title="No invoices yet" description="Create the first invoice for this customer." action={<Button>Create invoice</Button>} />
          )}
        </TabsContent>

        <TabsContent value="Payments" className="mt-4">
          {custPayments.length ? (
            <SectionCard bodyClassName="p-0">
              <ul className="divide-border divide-y">
                {custPayments.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.reference}</span>
                    <span className="text-muted-foreground text-xs">{formatMoney(p.amount, p.currency)}</span>
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
              Prefers WhatsApp over calls. Home loan pre-approved with HDFC. Wants possession before
              March.
            </p>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
