import { createFileRoute, Link } from "@tanstack/react-router";
import { TimerOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/session-expired")({
  head: () => ({
    meta: [
      { title: "Session expired · BLUETORN CRM" },
      {
        name: "description",
        content: "Your BLUETORN CRM session has expired. Sign in again to continue.",
      },
      { property: "og:title", content: "Session expired · BLUETORN CRM" },
      {
        property: "og:description",
        content: "Your session has expired. Sign in again to continue.",
      },
    ],
  }),
  component: SessionExpired,
});

function SessionExpired() {
  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-5">
      <div className="max-w-md text-center">
        <div className="bg-muted text-muted-foreground mx-auto grid h-14 w-14 place-items-center rounded-full">
          <TimerOff className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-xl font-semibold">Session expired</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          You were signed out after 30 minutes of inactivity. Nothing was lost — drafts stay in your
          workspace.
        </p>
        <Button asChild className="mt-6">
          <Link to="/">Sign in again</Link>
        </Button>
      </div>
    </div>
  );
}
