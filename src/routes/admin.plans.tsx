import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Plus, Shield } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { DataState } from "@/components/common/DataState";
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
import { listPlans, createPlan, updatePlan, qk } from "@/lib/crm-api";
import { formatMoney } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/plans")({
  head: () => ({
    meta: [
      { title: "Plans · BLUETORN CRM" },
      { name: "description", content: "Subscription tiers, limits and pricing." },
      { property: "og:title", content: "Plans · BLUETORN CRM" },
      { property: "og:description", content: "Subscription tiers, limits and pricing." },
    ],
  }),
  component: AdminPlans,
});

function AdminPlans() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    code: "",
    name: "",
    description: "",
    priceMonthly: "",
    seatLimit: "10",
    features: "",
  });

  const plansQuery = useQuery({
    queryKey: qk.plans(),
    queryFn: () => listPlans(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createPlan({
        code: form.code.trim().toLowerCase(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        price_monthly: parseFloat(form.priceMonthly) || 0,
        seat_limit: parseInt(form.seatLimit, 10) || 10,
        features: form.features
          .split(",")
          .map((f) => f.trim())
          .filter(Boolean),
        is_active: true,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.plans() });
      setDialogOpen(false);
      setForm({ code: "", name: "", description: "", priceMonthly: "", seatLimit: "10", features: "" });
      toast.success("Plan created successfully.");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to create plan.");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updatePlan(id, { is_active: !isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.plans() });
      toast.success("Plan status updated.");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update plan.");
    },
  });

  const handleAddPlan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim() || !form.priceMonthly) {
      toast.error("Code, Name, and Monthly Price are required.");
      return;
    }
    createMutation.mutate();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Subscription Plans"
        description="Configure pricing tiers, seat limits and features for client workspaces."
        actions={
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Add plan tier
          </Button>
        }
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleAddPlan}>
            <DialogHeader>
              <DialogTitle>Add Subscription Plan</DialogTitle>
              <DialogDescription>Create a new tier available for tenant workspaces.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="planCode">Plan Code *</Label>
                  <Input
                    id="planCode"
                    placeholder="pro"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="planName">Plan Name *</Label>
                  <Input
                    id="planName"
                    placeholder="Pro Plan"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="planDesc">Description</Label>
                <Input
                  id="planDesc"
                  placeholder="Short summary of this tier"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="planPrice">Monthly Price (INR) *</Label>
                  <Input
                    id="planPrice"
                    type="number"
                    placeholder="4999"
                    value={form.priceMonthly}
                    onChange={(e) => setForm({ ...form, priceMonthly: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="planSeats">Seat Limit *</Label>
                  <Input
                    id="planSeats"
                    type="number"
                    placeholder="15"
                    value={form.seatLimit}
                    onChange={(e) => setForm({ ...form, seatLimit: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="planFeatures">Features (comma separated)</Label>
                <Input
                  id="planFeatures"
                  placeholder="Feature 1, Feature 2, Feature 3"
                  value={form.features}
                  onChange={(e) => setForm({ ...form, features: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Create Plan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DataState query={plansQuery} loadingLabel="Loading plans…">
        {(plans) => (
          <div className="grid gap-4 md:grid-cols-3">
            {plans.map((p) => (
              <SectionCard key={p.id} className="flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold">{p.name}</h3>
                    <button
                      type="button"
                      onClick={() => toggleMutation.mutate({ id: p.id, isActive: p.is_active })}
                      className="cursor-pointer"
                      disabled={toggleMutation.isPending}
                    >
                      <StatusBadge label={p.is_active ? "Active" : "Inactive"} />
                    </button>
                  </div>
                  <p className="text-muted-foreground text-xs mt-1">{p.description ?? ""}</p>
                  <div className="mt-4">
                    <span className="text-2xl font-bold">
                      {formatMoney(p.price_monthly, (p.currency ?? "INR") as any)}
                    </span>
                    <span className="text-muted-foreground text-xs"> / month</span>
                  </div>
                  <p className="text-xs font-semibold text-primary mt-1">
                    Up to {p.seat_limit} user seats
                  </p>

                  <ul className="mt-4 space-y-2 border-border border-t pt-4 text-xs">
                    {(p.features ?? []).map((f, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </SectionCard>
            ))}
          </div>
        )}
      </DataState>
    </div>
  );
}
