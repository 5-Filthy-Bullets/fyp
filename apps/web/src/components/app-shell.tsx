import { Link, useLocation } from "@tanstack/react-router";
import { Menu } from "@base-ui/react/menu";
import { Separator } from "@base-ui/react/separator";
import {
  Bell,
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
  Search,
  Sun,
  Ticket,
  TicketPlus,
  TriangleAlert,
  Users,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { authClient } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCaller } from "@/lib/session";
import type { Role } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly roles: readonly Role[];
}
const primaryNav: readonly NavItem[] = [
  { to: "/", label: "Home", icon: House, roles: ["client", "technician", "admin"] },
  { to: "/", label: "My Tickets", icon: Ticket, roles: ["client"] },
  { to: "/", label: "New Ticket", icon: TicketPlus, roles: ["client"] },
  { to: "/", label: "Queue", icon: Inbox, roles: ["technician"] },
  { to: "/", label: "My Work", icon: Wrench, roles: ["technician"] },
  { to: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["admin"] },
  { to: "/", label: "Escalated", icon: TriangleAlert, roles: ["admin"] },
];

const adminNav: readonly NavItem[] = [
  { to: "/", label: "Clients", icon: Building, roles: ["admin"] },
  { to: "/", label: "Technicians", icon: Users, roles: ["admin"] },
];

const shellTitle: Record<Role, string> = {
  client: "Reliable Solutions support",
  technician: "Reliable Solutions queue",
  admin: "Reliable Solutions admin",
};

/**
 * Coss-style app shell: collapsible left sidebar with per-role nav, topbar
 * with search, theme toggle, notification bell stub, and avatar menu. All
 * links point at "/" until Phase 5 lands the ticket list/detail pages; the
 * nav filters by role so each portal only sees its own entries.
 */
export function AppShell({ children }: { readonly children: ReactNode }) {
  const { role } = useCaller();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeRole: Role = role ?? "client";

  const sidebar = (
    <SidebarContent
      role={activeRole}
      collapsed={collapsed}
      onNavigate={() => setMobileOpen(false)}
    />
  );

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] md:block",
          collapsed ? "w-16" : "w-60",
        )}
      >
        {sidebar}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 cursor-default bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-sidebar-border bg-sidebar">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((prev) => !prev)}
          onOpenMobile={() => setMobileOpen(true)}
        />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">{children}</main>
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
      <div className="flex items-center gap-2 px-4 py-4">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
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
      <nav aria-label="Primary" className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {primary.map((item) => (
          <NavLink key={item.label} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
        {admin.length > 0 && (
          <>
            {!collapsed && (
              <p className="px-2 pt-4 pb-1 text-xs font-medium text-muted-foreground">Manage</p>
            )}
            {admin.map((item) => (
              <NavLink key={item.label} item={item} collapsed={collapsed} onNavigate={onNavigate} />
            ))}
          </>
        )}
      </nav>
      <div className="px-2 py-3">
        <SidebarFooter role={role} collapsed={collapsed} />
      </div>
    </div>
  );
}

function NavLink({
  item,
  collapsed,
  onNavigate,
}: {
  readonly item: NavItem;
  readonly collapsed: boolean;
  readonly onNavigate: () => void;
}) {
  const location = useLocation();
  const active = location.pathname === item.to;

  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
        collapsed && "justify-center px-0",
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
      <p className="mt-1.5 truncate text-xs text-muted-foreground">{email ?? "unknown"}</p>
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
          aria-pressed={collapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronLeft
            className={cn("transition-transform", collapsed && "rotate-180")}
            aria-hidden
          />
        </Button>
        <SearchBox />
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggleButton />
          <NotificationBell />
          <AvatarMenu />
        </div>
      </div>
    </header>
  );
}

/**
 * Global ticket search. The ticket list does not exist yet, so the query is
 * parked in the URL (`?q=`) where the list reads it once Phase 5 lands.
 */
function SearchBox() {
  const [value, setValue] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams(window.location.search);
    if (value.trim() === "") {
      params.delete("q");
    } else {
      params.set("q", value.trim());
    }
    const query = params.toString();
    window.history.replaceState(null, "", query === "" ? "/" : `/?${query}`);
  };

  return (
    <form onSubmit={submit} role="search" className="hidden w-full max-w-xs sm:block">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Search tickets…"
          aria-label="Search tickets"
          className="pl-8"
        />
      </div>
    </form>
  );
}

function ThemeToggleButton() {
  const { resolved, setTheme } = useTheme();
  const dark = resolved === "dark";

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      aria-pressed={dark}
      title={dark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {dark ? <Sun aria-hidden /> : <Moon aria-hidden />}
    </Button>
  );
}

/** Placeholder bell. A later phase wires it to the notifications query. */
function NotificationBell() {
  return (
    <Button variant="ghost" size="icon-sm" aria-label="Notifications" title="Notifications">
      <span className="relative">
        <Bell aria-hidden />
        <span
          className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-destructive"
          aria-hidden
        />
      </span>
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
              className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-accent"
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
