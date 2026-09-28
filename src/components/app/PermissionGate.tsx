import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSession, type Permission } from "@/hooks/use-session";
import { PermissionDenied } from "@/components/common/DataState";

/**
 * Route-level permission gate. Wraps a page component and checks if the
 * current session has the required permission(s). If not, redirects to
 * /access-denied (hard guard) or renders an inline "Permission Denied" card.
 */
export function PermissionGate({
  requires,
  redirect = true,
  children,
}: {
  requires: Permission | Permission[];
  redirect?: boolean;
  children: ReactNode;
}) {
  const { status, can } = useSession();
  const navigate = useNavigate();

  const perms = Array.isArray(requires) ? requires : [requires];
  const allowed = status === "authenticated" && perms.some((p) => can(p));

  useEffect(() => {
    if (status === "authenticated" && !allowed && redirect) {
      navigate({ to: "/access-denied", replace: true });
    }
  }, [status, allowed, redirect, navigate]);

  if (status === "loading") {
    return (
      <div className="flex min-h-[300px] items-center justify-center p-12">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Checking permissions…
        </div>
      </div>
    );
  }

  if (status !== "authenticated") return null;
  if (!allowed) return <PermissionDenied />;

  return <>{children}</>;
}
