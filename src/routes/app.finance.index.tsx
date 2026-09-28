import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/finance/")({
  beforeLoad: () => {
    throw redirect({ to: "/app/finance/invoices" });
  },
});
