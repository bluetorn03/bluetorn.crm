import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, Loader2, Lock, ShieldAlert } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { PromoWall } from "@/components/app/PromoWall";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "@/lib/auth.functions";
import { getPlatformStatus } from "@/lib/admin.functions";
import {
  canonicalUserCode,
  canonicalWorkspaceCode,
  PLATFORM_WORKSPACE_CODE,
} from "@/lib/auth-identity";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")(  {
  head: () => ({
    meta: [
      { title: "Sign in · BLUETORN CRM" },
      {
        name: "description",
        content:
          "Sign in to BLUETORN CRM — a real-estate-first CRM for small businesses. Work faster. Sell smarter.",
      },
      { property: "og:title", content: "Sign in · BLUETORN CRM" },
      {
        property: "og:description",
        content: "Real-estate-first CRM for small businesses. Manage customers. Not software.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoginPage,
});

type Alert = { title: string; body: string; tone: "danger" | "warning" | "info"; icon?: "lock" | "denied" };

function LoginPage() {
  const navigate = useNavigate();
  const [workspaceCode, setWorkspaceCode] = useState("");
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState<Alert | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getPlatformStatus()
      .then((s) => {
        if (!cancelled) setNeedsSetup(!s.initialized);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = canonicalWorkspaceCode(workspaceCode);
    const uid = canonicalUserCode(userId);
    if (!code || !uid || !password) {
      setAlert({
        title: "Missing details",
        body: "Workspace code, user ID and password are all required.",
        tone: "danger",
      });
      return;
    }

    setAlert(null);
    setLoading(true);
    try {
      const result = await loginAction({
        data: { workspaceCode: code, userId: uid, password },
      });

      if (result.isSuperAdmin) {
        navigate({ to: "/admin", replace: true });
      } else {
        navigate({ to: "/app", replace: true });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      if (message === "WORKSPACE_INACTIVE") {
        navigate({ to: "/workspace-inactive", replace: true });
        return;
      }

      if (message === "USER_INACTIVE") {
        setAlert({
          title: "User account is inactive",
          body: "Ask your workspace owner or Bluetorn support to reactivate this user.",
          tone: "danger",
          icon: "lock",
        });
        return;
      }

      if (message === "NO_ROLE") {
        setAlert({
          title: "Permission denied",
          body: "This user has no role assigned in this workspace yet.",
          tone: "warning",
          icon: "denied",
        });
        return;
      }

      setAlert({
        title: "Sign in failed",
        body: "Check the workspace code, user ID and password and try again.",
        tone: "danger",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-background min-h-screen lg:flex">
      <div className="hidden lg:block lg:w-3/5">
        <PromoWall />
      </div>

      <div className="flex min-h-screen w-full flex-col justify-center px-5 py-10 sm:px-10 lg:min-h-screen lg:w-2/5 lg:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Logo size="lg" showTagline />

          <div className="mt-8 lg:hidden">
            <PromoWall compact />
          </div>

          <div className="mt-8">
            <h1 className="text-xl font-semibold tracking-tight">Sign in to your workspace</h1>
            <p className="text-muted-foreground mt-1 text-sm">Manage customers. Not software.</p>
          </div>

          {needsSetup && (
            <div className="border-primary/25 bg-primary/8 text-primary mt-5 rounded-xl border p-3.5 text-sm">
              <p className="font-medium">This platform has not been set up yet</p>
              <p className="mt-0.5 opacity-90">
                Create the first Bluetorn Super Admin to start onboarding client workspaces.
              </p>
              <Link to="/setup" className="mt-2 inline-flex items-center gap-1 font-medium underline">
                Set up platform <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}

          {alert && (
            <div
              role="alert"
              className={cn(
                "mt-5 flex gap-3 rounded-xl border p-3.5 text-sm",
                alert.tone === "danger" && "border-destructive/25 bg-destructive/8 text-destructive",
                alert.tone === "warning" && "border-warning/30 bg-warning/10 text-warning",
                alert.tone === "info" && "border-primary/25 bg-primary/8 text-primary",
              )}
            >
              {alert.icon === "lock" ? (
                <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              ) : alert.icon === "denied" ? (
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="font-medium">{alert.title}</p>
                <p className="mt-0.5 opacity-90">{alert.body}</p>
              </div>
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="workspace">Workspace Code</Label>
              <Input
                id="workspace"
                value={workspaceCode}
                onChange={(e) => setWorkspaceCode(e.target.value)}
                placeholder="BT-RE-1042"
                autoComplete="organization"
                className="h-11 tracking-wide uppercase"
              />
              <p className="text-muted-foreground text-xs">
                Bluetorn staff sign in with code{" "}
                <span className="text-foreground font-medium">{PLATFORM_WORKSPACE_CODE}</span>.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user">User ID</Label>
              <Input
                id="user"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="your user id"
                autoComplete="username"
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="h-11"
              />
            </div>

            <Button type="submit" className="h-11 w-full gap-2" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Signing in…
                </>
              ) : (
                <>
                  Login <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>

            <div className="flex items-center justify-between">
              <Link
                to="/forgot-password"
                className="text-muted-foreground hover:text-foreground text-sm font-medium"
              >
                Forgot password?
              </Link>
              <span className="text-muted-foreground text-xs">Secure workspace login</span>
            </div>
          </form>

          <p className="text-muted-foreground mt-8 text-center text-xs">
            © {new Date().getFullYear()} Bluetorn. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
