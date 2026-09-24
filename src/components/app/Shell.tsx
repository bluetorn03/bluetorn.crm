import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  ChevronsUpDown,
  Command as CommandIcon,
  LogOut,
  Menu,
  Moon,
  Plus,
  Search,
  Settings,
  Shield,
  Sun,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Logo, LogoMark } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/common/StatusBadge";
import { CommandPalette } from "@/components/app/CommandPalette";
import { NotificationBell } from "@/components/app/NotificationBell";
import { useSession } from "@/hooks/use-session";
import { useTheme } from "@/hooks/use-theme";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export type NavItem = {
  label: string;
  /** Omit for a pure navigation group (e.g. Finance) that only expands. */
  to?: string;
  icon: LucideIcon;
  exact?: boolean;
  requires?: Parameters<ReturnType<typeof useSession>["can"]>[0];
  children?: { label: string; to: string }[];
};


export type NavGroup = { label: string; items: NavItem[] };

export function Shell({
  groups,
  mobileNav,
  variant = "client",
  quickAdd,
  children,
}: {
  groups: NavGroup[];
  mobileNav: NavItem[];
  variant?: "client" | "admin";
  quickAdd?: ReactNode;
  children: ReactNode;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { theme, toggle } = useTheme();
  const session = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => setMobileMenu(false), [pathname]);

  const isActive = (item: NavItem) => {
    if (!item.to) return false;
    return item.exact ? pathname === item.to : pathname === item.to || pathname.startsWith(item.to + "/");
  };

  const childActive = (item: NavItem) =>
    (item.children ?? []).some((c) => pathname === c.to || pathname.startsWith(c.to + "/"));

  const visibleGroups = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.requires || session.can(i.requires)) }))
    .filter((g) => g.items.length > 0);

  const sidebar = (
    <nav className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-4" aria-label="Main">
      {visibleGroups.map((group) => (
        <div key={group.label}>
          <p className="text-muted-foreground px-3 pb-2 text-[11px] font-semibold tracking-wider uppercase">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const expanded = isActive(item) || childActive(item);
              const active = item.to ? isActive(item) : expanded;
              const rowClass = cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60",
              );
              return (
                <li key={item.to ?? item.label}>
                  {item.to ? (
                    <Link to={item.to} className={rowClass}>
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  ) : (
                    <div className={rowClass}>
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </div>
                  )}
                  {item.children && (expanded || !item.to) && (
                    <ul className="border-sidebar-border mt-1 ml-6 space-y-0.5 border-l pl-3">
                      {item.children.map((child) => (
                        <li key={child.to}>
                          <Link
                            to={child.to}
                            className={cn(
                              "block rounded-md px-2 py-1.5 text-sm transition-colors",
                              pathname === child.to || pathname.startsWith(child.to + "/")
                                ? "text-primary font-medium"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {child.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>

        </div>
      ))}
      <div className="mt-auto px-3 pt-4">
        <p className="text-muted-foreground text-[11px]">Manage customers. Not software.</p>
      </div>
    </nav>
  );

  return (
    <div className="bg-background min-h-screen">
      <aside className="bg-sidebar border-sidebar-border fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r lg:flex">
        <div className="border-sidebar-border flex h-16 items-center border-b px-4">
          <Link to={variant === "admin" ? "/admin" : "/app"} className="min-w-0">
            <Logo size="sm" />
          </Link>
        </div>
        {variant === "admin" && (
          <div className="border-sidebar-border text-primary flex items-center gap-2 border-b px-4 py-2 text-xs font-semibold">
            <Shield className="h-3.5 w-3.5" /> Platform Console
          </div>
        )}
        {sidebar}
      </aside>

      <div className="lg:pl-64">
        <header className="bg-background/85 border-border sticky top-0 z-30 border-b backdrop-blur">
          <div className="flex h-16 items-center gap-2 px-3 sm:px-6">
            <Sheet open={mobileMenu} onOpenChange={setMobileMenu}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetHeader className="border-border border-b px-4 py-3">
                  <SheetTitle className="text-left">
                    <Logo size="sm" />
                  </SheetTitle>
                </SheetHeader>
                {sidebar}
              </SheetContent>
            </Sheet>

            <LogoMark className="h-8 w-8 lg:hidden" />

            {variant === "client" ? (
              <WorkspaceChip />
            ) : (
              <div className="hidden items-center gap-2 sm:flex">
                <StatusBadge label="Super Admin" tone="brand" />
                <span className="text-muted-foreground text-sm">Bluetorn Platform</span>
              </div>
            )}

            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={() => setPaletteOpen(true)}
                className="border-border bg-card text-muted-foreground hover:bg-accent hidden h-9 w-56 items-center gap-2 rounded-lg border px-3 text-sm transition-colors md:flex xl:w-72"
              >
                <Search className="h-4 w-4" />
                <span>Search everything…</span>
                <kbd className="border-border bg-muted ml-auto rounded border px-1.5 py-0.5 text-[10px]">
                  ⌘K
                </kbd>
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Search"
                onClick={() => setPaletteOpen(true)}
              >
                <Search className="h-5 w-5" />
              </Button>
              <NotificationBell />
              <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={toggle}>
                {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </Button>
              {quickAdd}
              <ProfileMenu
                variant={variant}
                onSignOut={async () => {
                  await session.signOut();
                  navigate({ to: "/", replace: true });
                }}
              />

            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] px-3 pt-5 pb-28 sm:px-6 lg:pb-10">
          {children}
        </main>
      </div>

      <nav
        className="bg-background/95 border-border fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur lg:hidden"
        aria-label="Primary mobile"
      >
        <ul className="grid grid-cols-5">
          {mobileNav.map((item) => {
            const active = isActive(item);
            return (
              <li key={item.to ?? item.label}>
                <Link
                  to={item.to ?? "/app"}

                  className={cn(
                    "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

function WorkspaceChip() {
  const { workspace, workspaceOptions, setWorkspaceId } = useSession();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="hover:bg-accent flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors">
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{workspace.name}</span>
            <span className="text-muted-foreground block truncate text-[11px]">
              {workspace.code} · {workspace.plan}
            </span>
          </span>
          <ChevronsUpDown className="text-muted-foreground h-4 w-4 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Switch workspace</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaceOptions.map((w) => (
          <DropdownMenuItem key={w.id} onSelect={() => setWorkspaceId(w.id)} className="gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{w.name}</p>
              <p className="text-muted-foreground truncate text-xs">
                {w.code} · {w.industry}
              </p>
            </div>
            <StatusBadge label={w.status} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProfileMenu({ variant, onSignOut }: { variant: "client" | "admin"; onSignOut: () => void }) {
  const { user, role, isSuperAdmin, workspace } = useSession();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="bg-primary text-primary-foreground ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold"
          aria-label="Profile menu"
        >
          {initials(user.name)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <p className="text-sm font-medium">{user.name}</p>
          <p className="text-muted-foreground text-xs">{user.email || user.userCode}</p>
          <p className="text-muted-foreground mt-1 text-[11px]">
            {role}
            {!isSuperAdmin && workspace.code !== "—" ? ` · ${workspace.code}` : ""}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/app/settings">
            <Settings className="mr-2 h-4 w-4" /> My profile &amp; settings
          </Link>
        </DropdownMenuItem>
        {isSuperAdmin &&
          (variant === "client" ? (
            <DropdownMenuItem asChild>
              <Link to="/admin">
                <Shield className="mr-2 h-4 w-4" /> Open Platform Console
              </Link>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem asChild>
              <Link to="/app">
                <CommandIcon className="mr-2 h-4 w-4" /> Open Client CRM
              </Link>
            </DropdownMenuItem>
          ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSignOut}>
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function QuickAddButton({ items }: { items: { label: string; to: string }[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="ml-1 gap-1.5">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Quick add</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {items.map((i) => (
          <DropdownMenuItem key={i.label} asChild>
            <Link to={i.to}>{i.label}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
