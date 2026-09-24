import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { SectionCard } from "@/components/common/SectionCard";
import { DataState } from "@/components/common/DataState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getPlatformSettings, savePlatformSettings, qk } from "@/lib/crm-api";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({
    meta: [
      { title: "Platform settings · BLUETORN CRM" },
      { name: "description", content: "Global defaults for every workspace." },
      { property: "og:title", content: "Platform settings · BLUETORN CRM" },
      { property: "og:description", content: "Global defaults for every workspace." },
    ],
  }),
  component: AdminSettings,
});

function AdminSettings() {
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: qk.platformSettings(),
    queryFn: () => getPlatformSettings(),
  });

  const [form, setForm] = useState({
    platformName: "BLUETORN CRM",
    supportEmail: "support@bluetorn.com",
    defaultCurrency: "INR",
    defaultTimezone: "Asia/Kolkata",
    defaultSeatLimit: "10",
    allowSelfSignup: false,
    requireStrongPasswords: true,
    maintenanceMode: false,
    maintenanceMessage: "",
  });

  // Load from DB once available
  useEffect(() => {
    if (settingsQuery.data) {
      const general = settingsQuery.data["general"] ?? {};
      const security = settingsQuery.data["security"] ?? {};
      setForm({
        platformName: (general["platformName"] as string) ?? "BLUETORN CRM",
        supportEmail: (general["supportEmail"] as string) ?? "support@bluetorn.com",
        defaultCurrency: (general["defaultCurrency"] as string) ?? "INR",
        defaultTimezone: (general["defaultTimezone"] as string) ?? "Asia/Kolkata",
        defaultSeatLimit: String((general["defaultSeatLimit"] as number) ?? 10),
        allowSelfSignup: (security["allowSelfSignup"] as boolean) ?? false,
        requireStrongPasswords: (security["requireStrongPasswords"] as boolean) ?? true,
        maintenanceMode: (security["maintenanceMode"] as boolean) ?? false,
        maintenanceMessage: (security["maintenanceMessage"] as string) ?? "",
      });
    }
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await savePlatformSettings("general", {
        platformName: form.platformName,
        supportEmail: form.supportEmail,
        defaultCurrency: form.defaultCurrency,
        defaultTimezone: form.defaultTimezone,
        defaultSeatLimit: parseInt(form.defaultSeatLimit, 10) || 10,
      });
      await savePlatformSettings("security", {
        allowSelfSignup: form.allowSelfSignup,
        requireStrongPasswords: form.requireStrongPasswords,
        maintenanceMode: form.maintenanceMode,
        maintenanceMessage: form.maintenanceMessage,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.platformSettings() });
      toast.success("Platform settings saved successfully.");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to save settings.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Platform Settings"
        description="Global defaults and platform security controls for every tenant workspace."
      />

      <DataState query={settingsQuery} loadingLabel="Loading settings…">
        {() => (
          <form onSubmit={handleSubmit} className="space-y-5">
            <SectionCard title="General Platform Config">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="platformName">Platform Name</Label>
                  <Input
                    id="platformName"
                    value={form.platformName}
                    onChange={(e) => setForm({ ...form, platformName: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="supportEmail">System Support Email</Label>
                  <Input
                    id="supportEmail"
                    type="email"
                    value={form.supportEmail}
                    onChange={(e) => setForm({ ...form, supportEmail: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="defaultCurrency">Default Currency</Label>
                  <Select
                    value={form.defaultCurrency}
                    onValueChange={(v) => setForm({ ...form, defaultCurrency: v })}
                  >
                    <SelectTrigger id="defaultCurrency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INR">INR (₹)</SelectItem>
                      <SelectItem value="USD">USD ($)</SelectItem>
                      <SelectItem value="AED">AED (د.إ)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="defaultSeatLimit">Default Workspace Seat Limit</Label>
                  <Input
                    id="defaultSeatLimit"
                    type="number"
                    value={form.defaultSeatLimit}
                    onChange={(e) => setForm({ ...form, defaultSeatLimit: e.target.value })}
                    required
                  />
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Security & Maintenance">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base">Allow Self Signup</Label>
                    <p className="text-muted-foreground text-xs">
                      If disabled, only Super Admins can create new client workspaces.
                    </p>
                  </div>
                  <Switch
                    checked={form.allowSelfSignup}
                    onCheckedChange={(checked) => setForm({ ...form, allowSelfSignup: checked })}
                  />
                </div>

                <div className="flex items-center justify-between border-border border-t pt-4">
                  <div>
                    <Label className="text-base">Require Strong Passwords</Label>
                    <p className="text-muted-foreground text-xs">
                      Enforce minimum 8 characters with numbers and symbols for all tenant accounts.
                    </p>
                  </div>
                  <Switch
                    checked={form.requireStrongPasswords}
                    onCheckedChange={(checked) =>
                      setForm({ ...form, requireStrongPasswords: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between border-border border-t pt-4">
                  <div>
                    <Label className="text-base">Maintenance Mode</Label>
                    <p className="text-muted-foreground text-xs">
                      Temporarily restrict non-admin access across all workspaces during upgrades.
                    </p>
                  </div>
                  <Switch
                    checked={form.maintenanceMode}
                    onCheckedChange={(checked) => setForm({ ...form, maintenanceMode: checked })}
                  />
                </div>

                {form.maintenanceMode && (
                  <div className="space-y-1.5 border-border border-t pt-3">
                    <Label htmlFor="maintenanceMsg">Maintenance Banner Message</Label>
                    <Input
                      id="maintenanceMsg"
                      placeholder="System undergoing scheduled maintenance until 02:00 AM IST."
                      value={form.maintenanceMessage}
                      onChange={(e) => setForm({ ...form, maintenanceMessage: e.target.value })}
                    />
                  </div>
                )}
              </div>
            </SectionCard>

            <div className="flex justify-end">
              <Button type="submit" disabled={saveMutation.isPending} className="gap-2">
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {saveMutation.isPending ? "Saving..." : "Save Platform Settings"}
              </Button>
            </div>
          </form>
        )}
      </DataState>
    </div>
  );
}
