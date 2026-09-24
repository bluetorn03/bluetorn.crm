import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, Edit, MoreVertical, Plus, Trash2, UserCheck } from "lucide-react";
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
import { listProperties, qk, type Property } from "@/lib/crm-api";
import { useSession } from "@/hooks/use-session";
import { formatMoney } from "@/lib/format";
import { AddPropertyDialog } from "@/components/crm/AddPropertyDialog";
import { EditPropertyDialog } from "@/components/crm/EditPropertyDialog";
import { DeletePropertyDialog } from "@/components/crm/DeletePropertyDialog";
import { AssignPropertyDialog } from "@/components/crm/AssignPropertyDialog";

export const Route = createFileRoute("/app/properties/")({
  head: () => ({
    meta: [
      { title: "Properties · BLUETORN CRM" },
      { name: "description", content: "Your live inventory with pricing, status and interested leads." },
      { property: "og:title", content: "Properties · BLUETORN CRM" },
      { property: "og:description", content: "Live real-estate inventory with status and interested leads." },
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
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={
              "rounded-full border px-3 py-1.5 text-xs font-medium " +
              (filter === f
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground")
            }
          >
            {f}
          </button>
        ))}
        <button
          onClick={() => setSort(sort === "price-desc" ? "price-asc" : "price-desc")}
          className="border-border text-muted-foreground ml-auto rounded-full border px-3 py-1.5 text-xs font-medium"
        >
          Price: {sort === "price-desc" ? "High to low" : "Low to high"}
        </button>
      </div>

      <DataState query={propertiesQuery} loadingLabel="Loading properties…">
        {(properties) => {
          const rows = properties
            .filter((p) => filter === "All" || p.status === filter)
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
                            <UserCheck className="mr-2 h-4 w-4" /> {p.assigned_to ? "Reassign Property" : "Assign Property"}
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
                    <h2 className="truncate text-sm font-semibold hover:text-primary transition-colors">{p.name}</h2>
                    <p className="text-muted-foreground truncate text-xs">
                      {p.location ?? "—"}
                    </p>
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

