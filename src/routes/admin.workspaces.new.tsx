import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
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
import { adminCreateWorkspace } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/workspaces/new")({
  head: () => ({
    meta: [
      { title: "New workspace · BLUETORN CRM" },
      { name: "description", content: "Provision a new tenant workspace and its Owner account." },
      { property: "og:title", content: "New workspace · BLUETORN CRM" },
      {
        property: "og:description",
        content: "Provision a new tenant workspace and its Owner account.",
      },
    ],
  }),
  component: AdminWorkspaceNew,
});

function AdminWorkspaceNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createWorkspace = useServerFn(adminCreateWorkspace);

  const [form, setForm] = useState({
    code: "",
    name: "",
    legalName: "",
    industry: "Real Estate",
    plan: "Starter",
    status: "trial" as "active" | "trial" | "suspended" | "inactive",
    currency: "INR",
    timezone: "Asia/Kolkata",
    contactEmail: "",
    contactPhone: "",
    seatLimit: 10,
    ownerUserCode: "",
    ownerFullName: "",
    ownerEmail: "",
    ownerPhone: "",
    ownerPassword: "",
  });

  const set = (key: keyof typeof form, value: string | number) =>
    setForm((f) => ({ ...f, [key]: value }));

  const mutation = useMutation({
    mutationFn: () =>
      createWorkspace({
        data: {
          code: form.code,
          name: form.name,
          legalName: form.legalName,
          industry: form.industry,
          plan: form.plan,
          status: form.status,
          currency: form.currency,
          timezone: form.timezone,
          contactEmail: form.contactEmail,
          contactPhone: form.contactPhone,
          seatLimit: Number(form.seatLimit) || 10,
          owner: {
            userCode: form.ownerUserCode,
            fullName: form.ownerFullName,
            email: form.ownerEmail,
            phone: form.ownerPhone,
            password: form.ownerPassword,
          },
        },
      }),
    onSuccess: async (result) => {
      toast.success(`Workspace ${result.code} created`, {
        description: `Owner signs in with ${result.code} / ${result.ownerUserCode}.`,
      });
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
      navigate({
        to: "/admin/workspaces/$workspaceId",
        params: { workspaceId: result.workspaceId },
      });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="New workspace"
        description="Provision a tenant workspace together with its Owner sign-in."
      />

      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <SectionCard title="Company" description="Shown across the tenant workspace.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Workspace code" hint="Used at sign-in, e.g. BT-RE-1042">
              <Input
                value={form.code}
                onChange={(e) => set("code", e.target.value.toUpperCase())}
                placeholder="BT-RE-1042"
                required
              />
            </Field>
            <Field label="Company name">
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Skyline Realty"
                required
              />
            </Field>
            <Field label="Legal name">
              <Input
                value={form.legalName}
                onChange={(e) => set("legalName", e.target.value)}
                placeholder="Skyline Realty Pvt Ltd"
              />
            </Field>
            <Field label="Industry">
              <Input value={form.industry} onChange={(e) => set("industry", e.target.value)} />
            </Field>
            <Field label="Plan">
              <Select value={form.plan} onValueChange={(v) => set("plan", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Starter", "Growth", "Scale"].map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["trial", "active", "suspended", "inactive"].map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Currency">
              <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["INR", "USD", "AED", "EUR"].map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Seat limit">
              <Input
                type="number"
                min={1}
                value={form.seatLimit}
                onChange={(e) => set("seatLimit", Number(e.target.value))}
              />
            </Field>
            <Field label="Contact email">
              <Input
                type="email"
                value={form.contactEmail}
                onChange={(e) => set("contactEmail", e.target.value)}
              />
            </Field>
            <Field label="Contact phone">
              <Input
                value={form.contactPhone}
                onChange={(e) => set("contactPhone", e.target.value)}
              />
            </Field>
          </div>
        </SectionCard>

        <SectionCard
          title="Owner account"
          description="Signs in with workspace code, user ID and password."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="User ID" hint="Lowercase, e.g. arjun.mehta">
              <Input
                value={form.ownerUserCode}
                onChange={(e) => set("ownerUserCode", e.target.value.toLowerCase())}
                placeholder="arjun.mehta"
                required
              />
            </Field>
            <Field label="Full name">
              <Input
                value={form.ownerFullName}
                onChange={(e) => set("ownerFullName", e.target.value)}
                required
              />
            </Field>
            <Field label="Email" hint="For contact and recovery only.">
              <Input
                type="email"
                value={form.ownerEmail}
                onChange={(e) => set("ownerEmail", e.target.value)}
              />
            </Field>
            <Field label="Phone">
              <Input value={form.ownerPhone} onChange={(e) => set("ownerPhone", e.target.value)} />
            </Field>
            <Field label="Temporary password" hint="Minimum 8 characters.">
              <Input
                type="password"
                value={form.ownerPassword}
                onChange={(e) => set("ownerPassword", e.target.value)}
                required
                minLength={8}
              />
            </Field>
          </div>
        </SectionCard>

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Create workspace
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate({ to: "/admin/workspaces" })}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}
