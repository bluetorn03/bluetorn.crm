import { createFileRoute, Outlet } from "@tanstack/react-router";
import {
  Building2,
  CalendarDays,
  CheckSquare,
  Home,
  LineChart,
  Settings,
  Sparkles,
  Users,
  UserRound,
  Wallet,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { QuickAddButton, Shell, type NavGroup, type NavItem } from "@/components/app/Shell";
import { AuthGate } from "@/components/app/AuthGate";

export const Route = createFileRoute("/app")({
  ssr: false,
  component: AppLayout,
  errorComponent: ({ error }) => (
    <div className="bg-background min-h-screen flex items-center justify-center p-6 text-center">
      <div className="max-w-md space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Workspace Encountered an Error</h2>
        <p className="text-sm text-muted-foreground">
          {error?.message || "An unexpected error occurred while loading this page."}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Reload Workspace
        </button>
      </div>
    </div>
  ),
  pendingComponent: () => (
    <div className="bg-background grid min-h-screen place-items-center">
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your workspace…
      </div>
    </div>
  ),
});

const groups: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { label: "Home", to: "/app", icon: Home, exact: true },
      { label: "Customers", to: "/app/customers", icon: Users },
      {
        label: "Leads",
        to: "/app/leads",
        icon: Sparkles,
        children: [{ label: "Pipeline", to: "/app/leads/pipeline" }],
      },
      { label: "Properties", to: "/app/properties", icon: Building2 },
    ],
  },
  {
    label: "Work",
    items: [
      { label: "Tasks", to: "/app/tasks", icon: CheckSquare },
      { label: "Calendar", to: "/app/calendar", icon: CalendarDays },
    ],
  },
  {
    label: "Business",
    items: [
      {
        label: "Finance",
        icon: Wallet,
        requires: "view.finance",
        children: [
          { label: "Invoices", to: "/app/finance/invoices" },
          { label: "Payments", to: "/app/finance/payments" },
        ],
      },

      { label: "Reports", to: "/app/reports", icon: LineChart, requires: "view.reports" },
      { label: "Settings", to: "/app/settings", icon: Settings },
    ],
  },
];

const mobileNav: NavItem[] = [
  { label: "Home", to: "/app", icon: Home, exact: true },
  { label: "Leads", to: "/app/leads", icon: Sparkles },
  { label: "Properties", to: "/app/properties", icon: Building2 },
  { label: "Tasks", to: "/app/tasks", icon: CheckSquare },
  { label: "Customers", to: "/app/customers", icon: UserRound },
];

function AppLayout() {
  return (
    <AuthGate>
      <Shell
        groups={groups}
        mobileNav={mobileNav}
        quickAdd={
          <QuickAddButton
            items={[
              { label: "New lead", to: "/app/leads" },
              { label: "New customer", to: "/app/customers" },
              { label: "New property", to: "/app/properties" },
              { label: "New task", to: "/app/tasks" },
              { label: "New invoice", to: "/app/finance/invoices/new" },
            ]}
          />
        }
      >
        <Outlet />
      </Shell>
    </AuthGate>
  );
}
