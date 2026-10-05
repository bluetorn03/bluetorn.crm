import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  ChevronDown,
  ChevronsUpDown,
  Command as CommandIcon,
  Eye,
  LogOut,
  Menu,
  Moon,
  Plus,
  Search,
  Settings,
  Shield,
  Sun,
} from "lucide-react";
import { toast } from "sonner";
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
  badge?: number | string | undefined;
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
    return item.exact
      ? pathname === item.to
      : pathname === item.to || pathname.startsWith(item.to + "/");
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
            {group.items.map((item) => (
              <SidebarNavItem
                key={item.to ?? item.label}
                item={item}
                pathname={pathname}
                isActive={isActive}
                childActive={childActive}
              />
            ))}
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
        <div className="border-sidebar-border flex h-16 shrink-0 items-center border-b px-4">
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
        <header className="bg-background/85 border-border sticky top-0 z-30 h-16 border-b backdrop-blur">
          <div className="flex h-full items-center gap-2 px-3 sm:px-6">
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

        {session.isViewingAs && (
          <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 sm:px-6">
            <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 text-amber-950 dark:text-amber-200">
              <div className="flex items-center gap-2.5 text-xs sm:text-sm font-medium min-w-0">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400">
                  <Eye className="h-3.5 w-3.5" />
                </span>
                <span className="truncate">
                  Viewing as: <strong className="font-semibold text-foreground">{session.user.name}</strong> — Owner Preview
                </span>
                <span className="hidden sm:inline-flex items-center rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                  Read-Only
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs font-medium border-amber-500/30 bg-background/80 hover:bg-amber-500/15 text-foreground shrink-0 shadow-sm"
                onClick={async () => {
                  try {
                    await session.exitViewAs();
                    toast.info("Exited employee view");
                    navigate({ to: "/app/settings" });
                  } catch (e: any) {
                    toast.error(e.message || "Failed to exit view");
                  }
                }}
              >
                <LogOut className="mr-1.5 h-3.5 w-3.5" />
                Exit Employee View
              </Button>
            </div>
          </div>
        )}

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

function SidebarNavItem({
  item,
  pathname,
  isActive,
  childActive,
}: {
  item: NavItem;
  pathname: string;
  isActive: (item: NavItem) => boolean;
  childActive: (item: NavItem) => boolean;
}) {
  const hasChildren = Boolean(item.children && item.children.length > 0);

  // isRouteOpen: true whenever the current URL lives inside a child route.
  // Derived fresh from pathname on every render — always in sync with the router.
  const isRouteOpen = hasChildren && childActive(item);

  // isHoverOpen: set by mouse events only.
  const [isHoverOpen, setIsHoverOpen] = useState(false);

  // showOpen: the submenu is visible if either hover OR route demands it.
  const showOpen = isHoverOpen || isRouteOpen;

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCurrent = item.to
    ? isActive(item) || childActive(item)
    : childActive(item);

  const rowClass = cn(
    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
    isCurrent
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-sidebar-foreground hover:bg-sidebar-accent/60",
  );

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsHoverOpen(true);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    // Only close the hover flag; if isRouteOpen is true the dropdown stays visible.
    timeoutRef.current = setTimeout(() => {
      setIsHoverOpen(false);
    }, 150);
  };

  // Reset hover state on route change so stale hover doesn't persist to the next page.
  useEffect(() => {
    setIsHoverOpen(false);
  }, [pathname]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  if (hasChildren && item.children) {
    // ── CASE A: item has its own page AND children (e.g. Leads → /app/leads + Pipeline)
    // The label/icon area is a Link that navigates; the chevron is a separate toggle button.
    if (item.to) {
      const linkClass = cn(
        "flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
        isCurrent
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent/60",
      );
      const chevronClass = cn(
        "flex shrink-0 items-center justify-center rounded-md p-1.5 transition-colors",
        isCurrent
          ? "text-sidebar-accent-foreground/70 hover:text-sidebar-accent-foreground"
          : "text-sidebar-foreground/50 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      );
      return (
        <li
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className="relative"
        >
          <div className="flex items-center">
            <Link to={item.to} className={linkClass}>
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setIsHoverOpen((h) => !h);
              }}
              className={chevronClass}
              aria-label={`${showOpen ? "Collapse" : "Expand"} ${item.label} submenu`}
              aria-expanded={showOpen}
            >
              <ChevronDown
                className="h-3.5 w-3.5 transition-transform duration-200"
                style={{ transform: showOpen ? "rotate(-180deg)" : "rotate(0deg)" }}
                aria-hidden
              />
            </button>
          </div>

          <div
            className="grid transition-[grid-template-rows,opacity] duration-200 ease-in-out"
            style={{
              gridTemplateRows: showOpen ? "1fr" : "0fr",
              opacity: showOpen ? 1 : 0,
              pointerEvents: showOpen ? "auto" : "none",
            }}
            aria-hidden={!showOpen}
          >
            <div className="overflow-hidden">
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
            </div>
          </div>
        </li>
      );
    }

    // ── CASE B: dropdown-only (no own page, e.g. Finance)
    // The entire row is a toggle button; clicking anywhere opens/closes the submenu.
    return (
      <li
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="relative"
      >
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            setIsHoverOpen((h) => !h);
          }}
          className={cn(rowClass, "cursor-pointer")}
          aria-expanded={showOpen}
        >
          <item.icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{item.label}</span>
          <ChevronDown
            className="ml-auto h-3.5 w-3.5 shrink-0 text-sidebar-foreground/50 transition-transform duration-200"
            style={{ transform: showOpen ? "rotate(-180deg)" : "rotate(0deg)" }}
            aria-hidden
          />
        </button>

        <div
          className="grid transition-[grid-template-rows,opacity] duration-200 ease-in-out"
          style={{
            gridTemplateRows: showOpen ? "1fr" : "0fr",
            opacity: showOpen ? 1 : 0,
            pointerEvents: showOpen ? "auto" : "none",
          }}
          aria-hidden={!showOpen}
        >
          <div className="overflow-hidden">
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
          </div>
        </div>
      </li>
    );
  }

  return (
    <li>
      {item.to ? (
        <Link to={item.to} className={rowClass}>
          <item.icon className="h-4 w-4 shrink-0" />
          <span className="truncate flex-1">{item.label}</span>
          {item.badge !== undefined && item.badge !== null && item.badge !== 0 && (
            <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground leading-none">
              {item.badge}
            </span>
          )}
        </Link>
      ) : (
        <div className={rowClass}>
          <item.icon className="h-4 w-4 shrink-0" />
          <span className="truncate flex-1">{item.label}</span>
          {item.badge !== undefined && item.badge !== null && item.badge !== 0 && (
            <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground leading-none">
              {item.badge}
            </span>
          )}
        </div>
      )}
    </li>
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

function ProfileMenu({
  variant,
  onSignOut,
}: {
  variant: "client" | "admin";
  onSignOut: () => void;
}) {
  const { user, role, isSuperAdmin, workspace } = useSession();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showLogo = Boolean(workspace.logoUrl && failedUrl !== workspace.logoUrl);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold overflow-hidden border border-border/80 hover:opacity-90 transition-opacity bg-primary text-primary-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-xs"
          aria-label="Workspace & profile menu"
          title={`${workspace.name || "Workspace"} · ${user.name}`}
        >
          {showLogo ? (
            <img
              src={workspace.logoUrl!}
              alt={workspace.name || "Workspace"}
              className="h-full w-full object-cover"
              onError={() => setFailedUrl(workspace.logoUrl)}
            />
          ) : (
            <span>{initials(workspace.name || "Workspace")}</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground truncate">{user.name}</p>
            <span className="text-[10px] font-medium uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
              {role}
            </span>
          </div>
          <p className="text-muted-foreground text-xs truncate mt-0.5">{user.email || user.userCode}</p>
          <p className="text-primary font-medium mt-1 text-[11px] truncate">
            {workspace.name}{workspace.code !== "—" ? ` (${workspace.code})` : ""}
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
