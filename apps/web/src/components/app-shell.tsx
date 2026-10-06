import { Link, useLocation } from "@tanstack/react-router";
import { Menu } from "@base-ui/react/menu";
import { Separator } from "@base-ui/react/separator";
import {
  Building,
  ChevronLeft,
  CircleUserRound,
  House,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu as MenuIcon,
  Moon,
  Package,
  Sun,
  Ticket,
  TicketPlus,
  TriangleAlert,
  Users,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { authClient } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCaller } from "@/lib/session";
import type { Role } from "@/lib/session";
import { useShellStore } from "@/stores/shell-store";
import { useThemeStore } from "@/stores/theme-store";
import { cn } from "@/lib/utils";

interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly roles: readonly Role[];
  readonly search?: Record<string, string>;
}
const primaryNav: readonly NavItem[] = [
  { to: "/", label: "Home", icon: House, roles: ["client", "technician"] },
  { to: "/tickets", label: "My Tickets", icon: Ticket, roles: ["client"] },
  { to: "/tickets/new", label: "New Ticket", icon: TicketPlus, roles: ["client"] },
  {
    to: "/tickets",
    label: "Queue",
    icon: Inbox,
    roles: ["technician"],
    search: { scope: "queue" },
  },
  {
    to: "/tickets",
    label: "My Work",
    icon: Wrench,
    roles: ["technician"],
    search: { scope: "mine" },
  },
  { to: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["admin"] },
  // Explicit `escalated: "false"` (not a bare link): the tickets page
  // canonicalizes the All view to this query, so TanStack's own
  // active-tracking agrees with the highlight logic below instead of marking
  // every bare /tickets link current on scoped URLs.
  {
    to: "/tickets",
    label: "All Tickets",
    icon: Inbox,
    roles: ["admin"],
    search: { escalated: "false" },
  },
  {
    to: "/tickets",
    label: "Escalated",
    icon: TriangleAlert,
    roles: ["admin"],
    search: { escalated: "true" },
  },
];

const adminNav: readonly NavItem[] = [
  { to: "/admin/clients", label: "Clients", icon: Building, roles: ["admin"] },
  { to: "/admin/technicians", label: "Technicians", icon: Users, roles: ["admin"] },
  { to: "/admin/products", label: "Products", icon: Package, roles: ["admin"] },
];

const shellTitle: Record<Role, string> = {
  client: "Reliable Solutions support",
  technician: "Reliable Solutions queue",
  admin: "Reliable Solutions admin",
};

/**
 * Coss-style app shell: collapsible left sidebar with per-role nav, topbar
 * with search, theme toggle, notification bell stub, and avatar menu. The
 * nav filters by role so each portal only sees its own entries.
 */
export function AppShell({ children }: { readonly children: ReactNode }) {
  const { role, session } = useCaller();
  const collapsed = useShellStore((state) => state.collapsed);
  const mobileOpen = useShellStore((state) => state.mobileOpen);
  const toggleCollapsed = useShellStore((state) => state.toggleCollapsed);
  const setMobileOpen = useShellStore((state) => state.setMobileOpen);

  // Close the mobile drawer on Escape and lock body scroll while it is open.
  useEffect(() => {
    if (!mobileOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen, setMobileOpen]);

  // Never flash another role's nav while the session loads.
  if (role === undefined) {
    return (
      <div className="flex min-h-dvh bg-background text-foreground">
        <div
          className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6"
          aria-busy={session.isPending}
        >
          <p className="text-sm text-muted-foreground" role="status">
            {session.isPending
              ? "Loading navigation…"
              : "Your account has an unusable role. Ask the vendor team to fix it."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <aside
        aria-label="Sidebar"
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] md:block",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <SidebarContent role={role} collapsed={collapsed} onNavigate={() => setMobileOpen(false)} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            aria-hidden
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-sidebar-border bg-sidebar"
          >
            {/* The drawer is always expanded: desktop collapse must not leak in. */}
            <SidebarContent role={role} collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
          onOpenMobile={() => setMobileOpen(true)}
        />
        <main id="main-content" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarContent({
  role,
  collapsed,
  onNavigate,
}: {
  readonly role: Role;
  readonly collapsed: boolean;
  readonly onNavigate: () => void;
}) {
  const primary = primaryNav.filter((item) => item.roles.includes(role));
  const admin = adminNav.filter((item) => item.roles.includes(role));

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className={cn("flex items-center gap-2 px-4 py-4", collapsed && "justify-center px-0")}>
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
          title="Reliable Solutions"
        >
          <LifeBuoy className="size-4" aria-hidden />
        </span>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Reliable Solutions</p>
            <p className="truncate text-xs text-muted-foreground">{shellTitle[role]}</p>
          </div>
        )}
      </div>
      <Separator className="bg-sidebar-border" />
      <nav aria-label="Primary" className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {primary.map((item) => (
          <NavLink
            key={item.label}
            item={item}
            role={role}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}
        {admin.length > 0 && (
          <>
            {collapsed ? (
              <>
                <Separator className="my-2 bg-sidebar-border" />
                <span className="sr-only">Manage</span>
              </>
            ) : (
              <p className="px-2 pt-4 pb-1 text-xs font-medium text-muted-foreground">Manage</p>
            )}
            {admin.map((item) => (
              <NavLink
                key={item.label}
                item={item}
                role={role}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            ))}
          </>
        )}
      </nav>
      <div className="shrink-0 px-2 py-3">
        <SidebarFooter role={role} collapsed={collapsed} />
      </div>
    </div>
  );
}

function NavLink({
  item,
  role,
  collapsed,
  onNavigate,
}: {
  readonly item: NavItem;
  readonly role: Role;
  readonly collapsed: boolean;
  readonly onNavigate: () => void;
}) {
  const location = useLocation();
  const search = location.search as Record<string, unknown>;
  // Path match plus every search param the item declares. The client "My
  // Tickets" entry is bare (no search) and only matches when no scope tab is
  // selected, so scoped views never highlight it. The technician queue owns
  // the bare /tickets URL too: the list canonicalizes it to ?scope=queue, and
  // until that replace lands Queue stays highlighted instead of going dark.
  const isQueueDefault =
    item.search?.["scope"] === "queue" && role === "technician" && search["scope"] === undefined;
  const active =
    location.pathname === item.to &&
    (isQueueDefault ||
      (Object.entries(item.search ?? {}).every(([key, value]) => search[key] === value) &&
        (item.search !== undefined ||
          item.to !== "/tickets" ||
          (search["scope"] === undefined && search["escalated"] === undefined))));

  // Note: TanStack Link writes its own `aria-current="page"` when *it* thinks
  // the link is active (path-prefix match, and an undefined `search` inherits
  // the current query, so a bare /tickets link looks active on every tickets
  // URL). `exact` opts out of prefix matching so ticket-detail pages don't
  // light up the whole section, and the explicit "false" below (rather than
  // undefined) survives for every link the router itself calls inactive — the
  // `active` computation owns both the highlight and the accessible state.
  return (
    <Link
      to={item.to}
      search={item.search}
      activeOptions={{ exact: true }}
      onClick={onNavigate}
      aria-current={active ? "page" : "false"}
      aria-label={collapsed ? item.label : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
        collapsed && "justify-center",
      )}
    >
      <item.icon className="size-4 shrink-0" aria-hidden />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

function SidebarFooter({ role, collapsed }: { readonly role: Role; readonly collapsed: boolean }) {
  const { email } = useCaller();

  const signOut = async () => {
    await authClient.signOut();
  };

  if (collapsed) {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        className="w-full"
        onClick={signOut}
        aria-label="Sign out"
        title="Sign out"
      >
        <LogOut aria-hidden />
      </Button>
    );
  }

  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="capitalize">
          {role}
        </Badge>
      </div>
      <p className="mt-1.5 truncate text-xs text-muted-foreground" title={email ?? "unknown"}>
        {email ?? "unknown"}
      </p>
      <Button variant="ghost" size="sm" className="mt-1.5 w-full justify-start" onClick={signOut}>
        <LogOut aria-hidden />
        Sign out
      </Button>
    </div>
  );
}

function Topbar({
  collapsed,
  onToggleCollapse,
  onOpenMobile,
}: {
  readonly collapsed: boolean;
  readonly onToggleCollapse: () => void;
  readonly onOpenMobile: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-2 px-4 sm:px-6">
        <Button
          variant="ghost"
          size="icon-sm"
          className="md:hidden"
          onClick={onOpenMobile}
          aria-label="Open navigation"
        >
          <MenuIcon aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="hidden md:inline-flex"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronLeft
            className={cn("transition-transform", collapsed && "rotate-180")}
            aria-hidden
          />
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggleButton />
          <AvatarMenu />
        </div>
      </div>
    </header>
  );
}

function ThemeToggleButton() {
  const resolved = useThemeStore((state) => state.resolved);
  const setTheme = useThemeStore((state) => state.setTheme);
  const dark = resolved === "dark";

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
    </Button>
  );
}

function AvatarMenu() {
  const { email, role } = useCaller();

  const signOut = async () => {
    await authClient.signOut();
  };

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label="Account menu" title="Account menu" />
        }
      >
        <CircleUserRound aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={8} align="end">
          <Menu.Popup className="z-50 min-w-52 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
            <div className="px-2.5 py-2">
              <p className="truncate text-sm font-medium">{email ?? "unknown"}</p>
              <p className="text-xs text-muted-foreground capitalize">{role ?? "signed in"}</p>
            </div>
            <Menu.Item
              onClick={signOut}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm focus-visible:bg-accent focus-visible:outline-2 focus-visible:outline-ring data-[highlighted]:bg-accent"
            >
              <LogOut className="size-4" aria-hidden />
              Sign out
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
