import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/access-denied")({
  head: () => ({
    meta: [
      { title: "Permission denied · BLUETORN CRM" },
      { name: "description", content: "You do not have permission to view this area of the workspace." },
      { property: "og:title", content: "Permission denied · BLUETORN CRM" },
      { property: "og:description", content: "You do not have permission to view this area." },
    ],
  }),
  component: AccessDenied,
});

function AccessDenied() {
  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-5">
      <div className="max-w-md text-center">
        <div className="bg-warning/12 text-warning mx-auto grid h-14 w-14 place-items-center rounded-full">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-xl font-semibold">Permission denied</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Your role in this workspace doesn't include this module. Ask the workspace owner to grant
          access, or switch to a workspace where you have permission.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link to="/app">Back to Home</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/">Sign in as another user</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
