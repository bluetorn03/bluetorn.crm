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
} from "lucide-react";
import { QuickAddButton, Shell, type NavGroup, type NavItem } from "@/components/app/Shell";
import { AuthGate } from "@/components/app/AuthGate";

export const Route = createFileRoute("/app")({
  ssr: false,
  component: AppLayout,
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
