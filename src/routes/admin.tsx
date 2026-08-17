import { createFileRoute, Outlet } from "@tanstack/react-router";
import {
  Building,
  CreditCard,
  FileClock,
  Gauge,
  Images,
  ScrollText,
  Settings,
  Users,
} from "lucide-react";
import { QuickAddButton, Shell, type NavGroup, type NavItem } from "@/components/app/Shell";
import { AuthGate } from "@/components/app/AuthGate";

export const Route = createFileRoute("/admin")({
  ssr: false,
  component: AdminLayout,
});

const groups: NavGroup[] = [
  {
    label: "Platform",
    items: [
      { label: "Admin Dashboard", to: "/admin", icon: Gauge, exact: true },
      { label: "Workspaces", to: "/admin/workspaces", icon: Building },
      { label: "Users", to: "/admin/users", icon: Users },
      { label: "Plans", to: "/admin/plans", icon: CreditCard },
    ],
  },
  {
    label: "Content",
    items: [{ label: "Promotional Media", to: "/admin/media", icon: Images }],
  },
  {
    label: "Operations",
    items: [
      { label: "System Logs", to: "/admin/logs", icon: ScrollText },
      { label: "Audit Logs", to: "/admin/audit", icon: FileClock },
      { label: "Admin Settings", to: "/admin/settings", icon: Settings },
    ],
  },
];

const mobileNav: NavItem[] = [
  { label: "Home", to: "/admin", icon: Gauge, exact: true },
  { label: "Spaces", to: "/admin/workspaces", icon: Building },
  { label: "Users", to: "/admin/users", icon: Users },
  { label: "Media", to: "/admin/media", icon: Images },
  { label: "Logs", to: "/admin/logs", icon: ScrollText },
];

function AdminLayout() {
  return (
    <AuthGate requireSuperAdmin>
      <Shell
        variant="admin"
        groups={groups}
        mobileNav={mobileNav}
        quickAdd={
          <QuickAddButton
            items={[
              { label: "Create workspace", to: "/admin/workspaces/new" },
              { label: "Add promotional media", to: "/admin/media" },
            ]}
          />
        }
      >
        <Outlet />
      </Shell>
    </AuthGate>
  );
}
