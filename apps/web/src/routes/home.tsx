import { authClient } from "@/auth";
import { useCaller } from "@/lib/session";
import { SessionGuard } from "@/components/auth-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";

/**
 * Throwaway signed-in placeholder. Phase 3 replaces it with the app shell and
 * role dashboards; the guard and role badge behavior stay the same.
 */
export function HomePage() {
  return (
    <SessionGuard mode="signed-in">
      <HomePlaceholder />
    </SessionGuard>
  );
}

function HomePlaceholder() {
  const { email, role } = useCaller();

  const signOut = async () => {
    await authClient.signOut();
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Support tickets</CardTitle>
            {role !== undefined && <Badge variant="secondary">{role}</Badge>}
          </div>
          <CardDescription>
            Signed in as {email ?? "unknown"}. The full dashboard lands in a later phase.
          </CardDescription>
        </CardHeader>
        <CardPanel className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            Nothing to do here yet. Your workspace opens from this page once it lands.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </CardPanel>
      </Card>
    </main>
  );
}
