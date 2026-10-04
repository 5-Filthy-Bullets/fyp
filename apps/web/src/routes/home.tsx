import { authClient } from "@/auth";
import { useCaller } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { SessionGuard } from "@/components/auth-guard";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { House } from "lucide-react";

/**
 * Signed-in landing page inside the app shell. The card stays a placeholder
 * until Phase 4; the shell, guard, and role badge behavior are the real work.
 */
export function HomePage() {
  return (
    <SessionGuard mode="signed-in">
      <AppShell>
        <HomePlaceholder />
      </AppShell>
    </SessionGuard>
  );
}

function HomePlaceholder() {
  const { email, role } = useCaller();

  const signOut = async () => {
    await authClient.signOut();
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Home"
        description={`Signed in as ${email ?? "unknown"}. Your workspace opens here in a later phase.`}
        icon={House}
      />
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Support tickets</CardTitle>
            {role !== undefined && <Badge variant="secondary">{role}</Badge>}
          </div>
          <CardDescription>
            This card is a placeholder. Pick your section from the sidebar once Phase 4 lands the
            real pages.
          </CardDescription>
        </CardHeader>
        <CardPanel className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            Nothing to do here yet. The sidebar, search, theme toggle, and account menu above are
            live.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </CardPanel>
      </Card>
    </div>
  );
}
