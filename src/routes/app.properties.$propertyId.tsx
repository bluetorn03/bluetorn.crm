import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Building2, CalendarPlus, Edit, Trash2, UserCheck } from "lucide-react";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { getProperty, listEvents, listLeads, listMembers, qk } from "@/lib/crm-api";
import { useSession } from "@/hooks/use-session";
import { formatDateTime, formatMoney, initials, type CurrencyCode } from "@/lib/format";
import propertyImgDefault from "@/assets/property-1.jpg";
import { EditPropertyDialog } from "@/components/crm/EditPropertyDialog";
import { DeletePropertyDialog } from "@/components/crm/DeletePropertyDialog";
import { AssignPropertyDialog } from "@/components/crm/AssignPropertyDialog";

export const Route = createFileRoute("/app/properties/$propertyId")({
  head: () => ({
    meta: [
      { title: "Property · BLUETORN CRM" },
      {
        name: "description",
        content:
          "Property detail with interested leads, site visits, assigned employee and documents.",
      },
      { property: "og:title", content: "Property · BLUETORN CRM" },
      { property: "og:description", content: "Property detail with visits, leads and documents." },
    ],
  }),
  component: PropertyDetailPage,
});

function PropertyDetailPage() {
  const { propertyId } = Route.useParams();
  const { workspace, role, dbRole } = useSession();
  const navigate = useNavigate();

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

  const propertyQuery = useQuery({
    queryKey: qk.property(propertyId),
    queryFn: () => getProperty(propertyId),
    enabled: !!propertyId,
  });

  const eventsQuery = useQuery({
    queryKey: qk.events(workspace.id),
    queryFn: () => listEvents(workspace.id),
    enabled: !!workspace.id,
  });

  const leadsQuery = useQuery({
    queryKey: qk.leads(workspace.id),
    queryFn: () => listLeads(workspace.id),
    enabled: !!workspace.id,
  });

  const membersQuery = useQuery({
    queryKey: qk.members(workspace.id),
    queryFn: () => listMembers(workspace.id),
    enabled: !!workspace.id,
  });

  const p = propertyQuery.data;

  if (propertyQuery.isLoading) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">Loading property details…</div>
    );
  }

  if (!p) {
    return (
      <EmptyState
        icon={Building2}
        title="Property not found"
        description="It may be archived or moved to another workspace."
        action={
          <Button asChild>
            <Link to="/app/properties">Back to properties</Link>
          </Button>
        }
      />
    );
  }

  const allEvents = eventsQuery.data ?? [];
  const allLeads = leadsQuery.data ?? [];

  const visits = allEvents.filter((v) => v.property_id === p.id);
  const interested = allLeads.filter((l) => l.property_id === p.id);

  const leadMap = new Map(allLeads.map((l) => [l.id, l.name]));
  const assignedMember = membersQuery.data?.find((m) => m.id === p.assigned_to);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/app/properties">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Properties
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          {canAssign && (
            <Button variant="outline" size="sm" onClick={() => setAssignOpen(true)}>
              <UserCheck className="mr-1.5 h-4 w-4 text-primary" />{" "}
              {p.assigned_to ? "Reassign Property" : "Assign Property"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Edit className="mr-1.5 h-4 w-4" /> Edit Property
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

      <AssignPropertyDialog open={assignOpen} onOpenChange={setAssignOpen} property={p} />
      <EditPropertyDialog open={editOpen} onOpenChange={setEditOpen} property={p} />
      <DeletePropertyDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        property={p}
        onDeleted={() => navigate({ to: "/app/properties" })}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="overflow-hidden rounded-xl bg-muted">
            <img
              src={p.image_url || propertyImgDefault}
              alt={p.name}
              width={1024}
              height={768}
              className="h-64 w-full object-cover sm:h-80"
            />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold">{p.name}</h1>
              <p className="text-muted-foreground truncate text-sm">
                {p.location ?? "Location not specified"}
              </p>
            </div>
            <StatusBadge label={p.status} />
          </div>

          <SectionCard title="Key Specifications">
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-muted-foreground text-xs">Price</dt>
                <dd className="mt-0.5 font-semibold">
                  {formatMoney(p.price, (p.currency as CurrencyCode) || "INR")}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Type</dt>
                <dd className="mt-0.5 font-medium">{p.type}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Area</dt>
                <dd className="mt-0.5 font-medium">{p.area_sqft ? `${p.area_sqft} sq.ft` : "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Bedrooms</dt>
                <dd className="mt-0.5 font-medium">{p.bedrooms ?? "—"}</dd>
              </div>
            </dl>
          </SectionCard>

          {p.description && (
            <SectionCard title="Description">
              <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap">
                {p.description}
              </p>
            </SectionCard>
          )}

          <SectionCard
            title="Scheduled site visits"
            action={
              <Button size="sm" variant="outline" asChild>
                <Link to="/app/calendar">
                  <CalendarPlus className="mr-1.5 h-4 w-4" /> Calendar
                </Link>
              </Button>
            }
            bodyClassName="p-0"
          >
            <ul className="divide-border divide-y">
              {visits.length === 0 && (
                <li className="text-muted-foreground p-4 text-sm">
                  No visits scheduled for this property yet.
                </li>
              )}
              {visits.map((v) => (
                <li key={v.id} className="px-4 py-3 sm:px-5">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {v.lead_id ? leadMap.get(v.lead_id) || "Lead" : v.title}
                    </span>
                    <StatusBadge label={v.status} />
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {formatDateTime(v.start_at)} ·{" "}
                    {v.assigned_to
                      ? membersQuery.data?.find((m) => m.id === v.assigned_to)?.full_name ||
                        "Assigned"
                      : "Unassigned"}
                  </p>
                  {v.notes && (
                    <p className="text-muted-foreground mt-1 text-xs italic">{v.notes}</p>
                  )}
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="Assigned employee">
            <div className="space-y-3">
              {assignedMember ? (
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                    {initials(assignedMember.full_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{assignedMember.full_name}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {assignedMember.email || "Workspace team member"}
                    </p>
                    {p.assigned_at && (
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        Assigned: {formatDateTime(p.assigned_at)}
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
                  {p.assigned_to ? "Reassign Property" : "Assign Property"}
                </Button>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Interested leads" bodyClassName="p-0">
            <ul className="divide-border divide-y">
              {interested.length === 0 && (
                <li className="text-muted-foreground p-4 text-sm">
                  No leads linked to this property yet.
                </li>
              )}
              {interested.map((l) => (
                <li key={l.id}>
                  <Link
                    to="/app/leads/$leadId"
                    params={{ leadId: l.id }}
                    className="hover:bg-accent/50 flex items-center gap-2 px-4 py-3"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">{l.name}</span>
                    <StatusBadge label={l.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
