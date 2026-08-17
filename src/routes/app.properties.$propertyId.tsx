import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Building2, CalendarPlus, FileText } from "lucide-react";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Timeline } from "@/components/common/Timeline";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { activity, leadById, leads, propertyById, siteVisits } from "@/lib/mock-data";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";

export const Route = createFileRoute("/app/properties/$propertyId")({
  head: () => ({
    meta: [
      { title: "Property · BLUETORN CRM" },
      { name: "description", content: "Property detail with interested leads, site visits, owner and documents." },
      { property: "og:title", content: "Property · BLUETORN CRM" },
      { property: "og:description", content: "Property detail with visits, leads and documents." },
    ],
  }),
  component: PropertyDetail,
});

function PropertyDetail() {
  const { propertyId } = Route.useParams();
  const p = propertyById(propertyId);
  if (!p) {
    return <EmptyState icon={Building2} title="Property not found" description="It may be archived." action={<Button asChild><Link to="/app/properties">Back to properties</Link></Button>} />;
  }
  const visits = siteVisits.filter((v) => v.propertyId === p.id);
  const interested = leads.filter((l) => l.interestedPropertyId === p.id);

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/app/properties"><ArrowLeft className="mr-1.5 h-4 w-4" /> Properties</Link>
      </Button>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="overflow-hidden rounded-xl">
            <img src={p.image} alt={p.name} width={1024} height={768} className="h-64 w-full object-cover sm:h-80" />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold">{p.name}</h1>
              <p className="text-muted-foreground truncate text-sm">{p.location}</p>
            </div>
            <StatusBadge label={p.status} />
          </div>

          <SectionCard title="Details">
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              {[
                ["Price", formatMoney(p.price, p.currency)],
                ["Type", p.type],
                ["Area", p.area],
                ["Bedrooms", p.beds ? `${p.beds} BHK` : "—"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-muted-foreground text-xs">{k}</dt>
                  <dd className="mt-0.5 font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {p.highlights.map((h) => (
                <span key={h} className="bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-xs">{h}</span>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Site visits" description="Schedule and feedback" action={<Button size="sm"><CalendarPlus className="mr-1.5 h-4 w-4" /> Schedule visit</Button>} bodyClassName="p-0">
            <ul className="divide-border divide-y">
              {visits.length === 0 && <li className="text-muted-foreground p-4 text-sm">No visits scheduled for this property yet.</li>}
              {visits.map((v) => (
                <li key={v.id} className="px-4 py-3 sm:px-5">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                    <span className="truncate text-sm font-medium">{leadById(v.leadId)?.name}</span>
                    <StatusBadge label={v.status} />
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-xs">{formatDateTime(v.scheduledAt)} · {v.assignedTo}</p>
                  {v.feedback && <p className="text-muted-foreground mt-1 text-xs italic">{v.feedback}</p>}
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="Activity">
            <Timeline items={activity.slice(0, 4)} />
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="Owner">
            <p className="text-sm font-medium">{p.ownerName}</p>
            <p className="text-muted-foreground text-xs">{p.ownerPhone}</p>
          </SectionCard>

          <SectionCard title="Interested leads" bodyClassName="p-0">
            <ul className="divide-border divide-y">
              {interested.length === 0 && <li className="text-muted-foreground p-4 text-sm">No leads linked yet.</li>}
              {interested.map((l) => (
                <li key={l.id}>
                  <Link to="/app/leads/$leadId" params={{ leadId: l.id }} className="hover:bg-accent/50 flex items-center gap-2 px-4 py-3">
                    <span className="min-w-0 flex-1 truncate text-sm">{l.name}</span>
                    <StatusBadge label={l.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </SectionCard>

          <SectionCard title="Documents" bodyClassName="p-0">
            <ul className="divide-border divide-y">
              {p.documents.length === 0 && <li className="text-muted-foreground p-4 text-sm">No documents uploaded.</li>}
              {p.documents.map((d) => (
                <li key={d.name} className="flex items-center gap-2 px-4 py-3">
                  <FileText className="text-muted-foreground h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-sm">{d.name}</span>
                  <span className="text-muted-foreground text-xs">{d.size} · {formatDate(d.uploadedAt)}</span>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
