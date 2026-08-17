import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useSession } from "@/hooks/use-session";

/**
 * Client-side session gate. Protects workspace and admin routes based on session state.
 */
export function AuthGate({ requireSuperAdmin = false, children }: { requireSuperAdmin?: boolean; children: ReactNode }) {
  const { status, isSuperAdmin } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === "unauthenticated") navigate({ to: "/", replace: true });
    else if (status === "authenticated" && requireSuperAdmin && !isSuperAdmin)
      navigate({ to: "/access-denied", replace: true });
  }, [status, isSuperAdmin, requireSuperAdmin, navigate]);

  if (status !== "authenticated" || (requireSuperAdmin && !isSuperAdmin)) {
    return (
      <div className="bg-background grid min-h-screen place-items-center">
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your workspace…
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
