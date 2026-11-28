import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, Edit, MoreVertical, Plus, Trash2, UserCheck, X } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { DataState } from "@/components/common/DataState";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { listProperties, propertyTypes, qk, type Property } from "@/lib/crm-api";
import { useSession } from "@/hooks/use-session";
import { formatMoney, parseDbUtcTimestamp } from "@/lib/format";
import { AddPropertyDialog } from "@/components/crm/AddPropertyDialog";
import { EditPropertyDialog } from "@/components/crm/EditPropertyDialog";
import { DeletePropertyDialog } from "@/components/crm/DeletePropertyDialog";
import { AssignPropertyDialog } from "@/components/crm/AssignPropertyDialog";

export const Route = createFileRoute("/app/properties/")({
  head: () => ({
    meta: [
      { title: "Properties · BLUETORN CRM" },
      {
        name: "description",
        content: "Your live inventory with pricing, status and interested leads.",
      },
      { property: "og:title", content: "Properties · BLUETORN CRM" },
      {
        property: "og:description",
        content: "Live real-estate inventory with status and interested leads.",
      },
    ],
  }),
  component: PropertiesPage,
});

const filters = ["All", "Available", "Reserved", "Booked", "Sold", "Inactive"] as const;

function PropertiesPage() {
  const { workspace, role, dbRole } = useSession();

  const canAssign =
    role === "Owner" ||
    role === "Manager" ||
    role === "Super Admin" ||
    dbRole === "owner" ||
    dbRole === "manager" ||
    dbRole === "super_admin";

  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const [propertyType, setPropertyType] = useState<string>("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState<"price-desc" | "price-asc">("price-desc");
  const [addOpen, setAddOpen] = useState(false);
  const [assigningProperty, setAssigningProperty] = useState<Property | null>(null);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [deletingProperty, setDeletingProperty] = useState<Property | null>(null);

  const propertiesQuery = useQuery({
    queryKey: qk.properties(workspace.id),
    queryFn: () => listProperties(workspace.id),
    enabled: !!workspace.id,
  });

  const filterProperty = (p: Property) => {
    if (filter !== "All" && p.status !== filter) return false;
    if (propertyType !== "All" && p.type !== propertyType) return false;
    if (dateFrom || dateTo) {
      const ts = parseDbUtcTimestamp(p.created_at);
      if (!ts) return false;
      const dateStr = ts.toISOString().slice(0, 10);
      if (dateFrom && dateStr < dateFrom) return false;
      if (dateTo && dateStr > dateTo) return false;
    }
    return true;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Properties"
        description="Real-estate-first inventory."
        actions={
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Add Property
          </Button>
        }
      />

      <AddPropertyDialog open={addOpen} onOpenChange={setAddOpen} />
      <AssignPropertyDialog
        open={!!assigningProperty}
        onOpenChange={(open) => !open && setAssigningProperty(null)}
        property={assigningProperty}
      />
      {editingProperty && (
        <EditPropertyDialog
          open={!!editingProperty}
          onOpenChange={(open) => !open && setEditingProperty(null)}
          property={editingProperty}
        />
      )}

      {deletingProperty && (
        <DeletePropertyDialog
          open={!!deletingProperty}
          onOpenChange={(open) => !open && setDeletingProperty(null)}
          property={deletingProperty}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={
                "rounded-full border px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors " +
                (filter === f
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground")
              }
            >
              {f}
            </button>
          ))}
        </div>

        {/* Property Type Filter */}
        <select
          value={propertyType}
          onChange={(e) => setPropertyType(e.target.value)}
          className="rounded-md border border-border bg-background px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer h-8"
        >
          <option value="All">All Types</option>
          {propertyTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        {/* Date range filter: From */}
        <div className="flex items-center gap-1">
          <label className="text-muted-foreground text-xs whitespace-nowrap">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              if (dateTo && e.target.value && dateTo < e.target.value) setDateTo("");
            }}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer h-8"
          />
        </div>

        {/* Date range filter: To */}
        <div className="flex items-center gap-1">
          <label className="text-muted-foreground text-xs whitespace-nowrap">To</label>
          <input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer h-8"
          />
        </div>

        {/* Reset button */}
        {(dateFrom || dateTo || propertyType !== "All" || filter !== "All") && (
          <button
            onClick={() => {
              setDateFrom("");
              setDateTo("");
              setPropertyType("All");
              setFilter("All");
            }}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/30 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors cursor-pointer"
          >
            Reset Filters
            <X className="h-3 w-3 ml-0.5" />
          </button>
        )}

        <button
          onClick={() => setSort(sort === "price-desc" ? "price-asc" : "price-desc")}
          className="border-border text-muted-foreground ml-auto rounded-full border px-3 py-1.5 text-xs font-medium cursor-pointer hover:text-foreground transition-colors"
        >
          Price: {sort === "price-desc" ? "High to low" : "Low to high"}
        </button>
      </div>

      <DataState query={propertiesQuery} loadingLabel="Loading properties…">
        {(properties) => {
          const rows = properties
            .filter(filterProperty)
            .sort((a, b) => (sort === "price-desc" ? b.price - a.price : a.price - b.price));

          if (rows.length === 0) {
            return (
              <EmptyState
                icon={Building2}
                title="No properties in this view"
                description="Change the filter or add your first listing."
                action={<Button onClick={() => setAddOpen(true)}>Add Property</Button>}
              />
            );
          }

          return (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((p) => (
                <div
                  key={p.id}
                  className="bg-card border-border elev-1 hover:elev-2 group relative flex flex-col justify-between overflow-hidden rounded-xl border transition-shadow"
                >
                  <Link
                    to="/app/properties/$propertyId"
                    params={{ propertyId: p.id }}
                    className="block flex-1"
                  >
                    {p.image_url ? (
                      <div className="relative">
                        <img
                          src={p.image_url}
                          alt={p.name}
                          loading="lazy"
                          width={1024}
                          height={768}
                          className="h-44 w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                        />
                        <span className="absolute top-3 left-3">
                          <StatusBadge
                            label={p.status}
                            className="bg-background/90 backdrop-blur"
                          />
                        </span>
                      </div>
                    ) : (
                      <div className="bg-accent/30 relative flex h-44 items-center justify-center">
                        <Building2 className="text-muted-foreground h-12 w-12" />
                        <span className="absolute top-3 left-3">
                          <StatusBadge
                            label={p.status}
                            className="bg-background/90 backdrop-blur"
                          />
                        </span>
                      </div>
                    )}
                  </Link>

                  <div className="absolute top-3 right-3 z-10">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="secondary"
                          size="icon"
                          className="h-8 w-8 rounded-full bg-background/80 backdrop-blur hover:bg-background shadow-sm"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link to="/app/properties/$propertyId" params={{ propertyId: p.id }}>
                            View Property
                          </Link>
                        </DropdownMenuItem>
                        {canAssign && (
                          <DropdownMenuItem onClick={() => setAssigningProperty(p)}>
                            <UserCheck className="mr-2 h-4 w-4" />{" "}
                            {p.assigned_to ? "Reassign Property" : "Assign Property"}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => setEditingProperty(p)}>
                          <Edit className="mr-2 h-4 w-4" /> Edit Details
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                          onClick={() => setDeletingProperty(p)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete Property
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <Link
                    to="/app/properties/$propertyId"
                    params={{ propertyId: p.id }}
                    className="p-4 block"
                  >
                    <h2 className="truncate text-sm font-semibold hover:text-primary transition-colors">
                      {p.name}
                    </h2>
                    <p className="text-muted-foreground truncate text-xs">{p.location ?? "—"}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-base font-semibold">
                        {formatMoney(p.price, (p.currency ?? "INR") as any, true)}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {p.type} · {p.area_sqft ? `${p.area_sqft} sq.ft` : "—"}
                      </span>
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          );
        }}
      </DataState>
    </div>
  );
}
