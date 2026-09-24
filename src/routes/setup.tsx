import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bootstrapPlatform, getPlatformStatus } from "@/lib/admin.functions";
import { PLATFORM_WORKSPACE_CODE } from "@/lib/auth-identity";

export const Route = createFileRoute("/setup")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Platform setup · BLUETORN CRM" },
      {
        name: "description",
        content:
          "Create the first Bluetorn platform Super Admin to start onboarding client workspaces.",
      },
      { property: "og:title", content: "Platform setup · BLUETORN CRM" },
      {
        property: "og:description",
        content: "One-time setup for the Bluetorn platform Super Admin account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SetupPage,
});

function SetupPage() {
  const navigate = useNavigate();
  const bootstrap = useServerFn(bootstrapPlatform);
  const [checking, setChecking] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [form, setForm] = useState({
    userCode: "",
    fullName: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    void getPlatformStatus()
      .then((s) => setInitialized(s.initialized))
      .catch(() => undefined)
      .finally(() => setChecking(false));
  }, []);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setSaving(true);
    try {
      await bootstrap({
        data: {
          userCode: form.userCode,
          fullName: form.fullName,
          email: form.email,
          password: form.password,
        },
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete setup.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-background grid min-h-screen place-items-center px-5 py-12">
      <div className="w-full max-w-md">
        <Logo size="lg" showTagline />

        {checking ? (
          <p className="text-muted-foreground mt-10 flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking platform status…
          </p>
        ) : done ? (
          <div className="border-border bg-card mt-8 rounded-2xl border p-6">
            <CheckCircle2 className="text-primary h-8 w-8" />
            <h1 className="mt-3 text-lg font-semibold">Platform is ready</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Sign in with workspace code{" "}
              <span className="text-foreground font-medium">{PLATFORM_WORKSPACE_CODE}</span>, user
              ID{" "}
              <span className="text-foreground font-medium">
                {form.userCode.trim().toLowerCase()}
              </span>{" "}
              and the password you just set.
            </p>
            <Button
              className="mt-5 w-full gap-2"
              onClick={() => navigate({ to: "/", replace: true })}
            >
              Go to sign in <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        ) : initialized ? (
          <div className="border-border bg-card mt-8 rounded-2xl border p-6">
            <ShieldCheck className="text-primary h-8 w-8" />
            <h1 className="mt-3 text-lg font-semibold">Setup already completed</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              This platform already has a Super Admin. Ask them to create your account.
            </p>
            <Link
              to="/"
              className="text-primary mt-4 inline-block text-sm font-medium hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-8">
              <h1 className="text-xl font-semibold tracking-tight">
                Create the platform Super Admin
              </h1>
              <p className="text-muted-foreground mt-1 text-sm">
                This one-time step creates the Bluetorn staff account that onboards client
                workspaces.
              </p>
            </div>

            {error && (
              <div className="border-destructive/25 bg-destructive/8 text-destructive mt-5 rounded-xl border p-3.5 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={submit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="fullName">Full name</Label>
                <Input
                  id="fullName"
                  value={form.fullName}
                  onChange={set("fullName")}
                  className="h-11"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="userCode">User ID</Label>
                <Input
                  id="userCode"
                  value={form.userCode}
                  onChange={set("userCode")}
                  placeholder="admin"
                  autoComplete="username"
                  className="h-11"
                  required
                />
                <p className="text-muted-foreground text-xs">
                  You will sign in as {PLATFORM_WORKSPACE_CODE} ·{" "}
                  {form.userCode.trim().toLowerCase() || "admin"}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Contact email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={set("email")}
                  className="h-11"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={form.password}
                  onChange={set("password")}
                  autoComplete="new-password"
                  className="h-11"
                  required
                />
                <p className="text-muted-foreground text-xs">At least 10 characters.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={form.confirm}
                  onChange={set("confirm")}
                  autoComplete="new-password"
                  className="h-11"
                  required
                />
              </div>

              <Button type="submit" className="h-11 w-full gap-2" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Creating account…
                  </>
                ) : (
                  <>
                    Create Super Admin <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
