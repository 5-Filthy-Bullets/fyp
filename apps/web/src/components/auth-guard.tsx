import { Navigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { authClient } from "@/auth";
import { Card, CardPanel } from "@/components/ui/card";
import { homePathForRole, isRole } from "@/lib/session";

const sessionShellClass = "mx-auto w-full max-w-md px-4 py-12";

const sessionLoading = (
  <main className={sessionShellClass}>
    <Card>
      <CardPanel>
        <p className="text-sm text-muted-foreground">Loading session…</p>
      </CardPanel>
    </Card>
  </main>
);

interface GuardProps {
  readonly mode: "signed-in" | "signed-out";
  readonly children: ReactNode;
}

/**
 * Single gate both pages share. `signed-in` renders only with a session,
 * `signed-out` only without one, so the login page never shows to a signed-in
 * user and authed placeholders never flash for signed-out visitors.
 *
 * Only blocks on the initial session load. better-auth revalidates on window
 * focus by default and marks `isPending` again on every signed-out refetch,
 * so gating on `isPending` alone flashes "Loading session…" on each tab
 * switch. The settled latch keeps rendering the last known state through
 * background refetches instead.
 */
export function SessionGuard({ mode, children }: GuardProps) {
  const session = authClient.useSession();
  const [hasSettled, setHasSettled] = useState(false);

  useEffect(() => {
    if (!session.isPending) {
      setHasSettled(true);
    }
  }, [session.isPending]);

  if (!hasSettled && session.isPending) {
    return sessionLoading;
  }

  if (mode === "signed-out") {
    if (session.data !== null) {
      const role = isRole(session.data.user.role) ? session.data.user.role : undefined;
      return <Navigate to={role === undefined ? "/" : homePathForRole(role)} />;
    }
    return <>{children}</>;
  }

  if (session.data === null || session.error !== null) {
    return <Navigate to="/login" />;
  }

  return <>{children}</>;
}
