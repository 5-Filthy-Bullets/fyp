import { useCaller } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { SessionGuard } from "@/components/auth-guard";
import { AdminDashboard } from "@/components/admin-dashboard";
import { ClientDashboard } from "@/components/client-dashboard";
import { TechnicianDashboard } from "@/components/technician-dashboard";
import { Card, CardPanel } from "@/components/ui/card";

/**
 * Signed-in landing page inside the app shell. Renders the dashboard matching
 * the caller's role; each dashboard owns its header and queries.
 */
export function HomePage() {
  return (
    <SessionGuard mode="signed-in">
      <AppShell>
        <DashboardSwitch />
      </AppShell>
    </SessionGuard>
  );
}

function DashboardSwitch() {
  const { role, session } = useCaller();

  if (session.isPending) {
    return (
      <Card>
        <CardPanel>
          <p className="text-sm text-muted-foreground">Loading dashboard…</p>
        </CardPanel>
      </Card>
    );
  }

  if (role === "client") {
    return <ClientDashboard />;
  }

  if (role === "technician") {
    return <TechnicianDashboard />;
  }

  if (role === "admin") {
    return <AdminDashboard />;
  }

  return (
    <Card>
      <CardPanel>
        <p className="text-sm text-muted-foreground" role="alert">
          Your account has an unusable role. Ask the vendor team to fix it.
        </p>
      </CardPanel>
    </Card>
  );
}
