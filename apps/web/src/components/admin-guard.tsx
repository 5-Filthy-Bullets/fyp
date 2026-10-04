import { Navigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { SessionGuard } from "@/components/auth-guard";
import { Card, CardPanel } from "@/components/ui/card";
import { useCaller } from "@/lib/session";

/**
 * Admin-only section guard. Signed-out visitors bounce to /login through the
 * session guard; signed-in non-admins land back on / so the URL never leaks
 * whether the section exists beyond a redirect.
 */
export function AdminGuard({ children }: { readonly children: ReactNode }) {
  return (
    <SessionGuard mode="signed-in">
      <AppShell>
        <AdminRoleGate>{children}</AdminRoleGate>
      </AppShell>
    </SessionGuard>
  );
}

function AdminRoleGate({ children }: { readonly children: ReactNode }) {
  const { role, session } = useCaller();

  if (session.isPending || role === undefined) {
    return (
      <Card>
        <CardPanel>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </CardPanel>
      </Card>
    );
  }

  if (role !== "admin") {
    return <Navigate to="/" />;
  }

  return <>{children}</>;
}
