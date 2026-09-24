import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/workspace-inactive")({
  head: () => ({
    meta: [
      { title: "Workspace inactive · BLUETORN CRM" },
      {
        name: "description",
        content: "This BLUETORN CRM workspace is currently inactive or suspended.",
      },
      { property: "og:title", content: "Workspace inactive · BLUETORN CRM" },
      { property: "og:description", content: "This workspace is currently inactive or suspended." },
    ],
  }),
  component: WorkspaceInactive,
});

function WorkspaceInactive() {
  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-5">
      <div className="max-w-md text-center">
        <div className="bg-destructive/12 text-destructive mx-auto grid h-14 w-14 place-items-center rounded-full">
          <Building2 className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-xl font-semibold">Workspace is inactive</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          BT-RE-4520 · Cedar &amp; Co Properties has been suspended. Data is retained for 90 days.
          Contact Bluetorn support to reactivate.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link to="/">Back to sign in</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/admin/workspaces">Open platform console</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
