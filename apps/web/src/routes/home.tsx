import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { authClient } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { orpcQuery } from "@/query";

const isRole = (value: unknown): value is "admin" | "technician" | "client" =>
  value === "admin" || value === "technician" || value === "client";

export function HomePage() {
  const session = authClient.useSession();
  const role = isRole(session.data?.user.role) ? session.data.user.role : undefined;

  const tickets = useQuery(
    orpcQuery.ticket.list.queryOptions({
      input: {},
      enabled: session.data !== null && !session.isPending,
    }),
  );

  const signOut = async () => {
    await authClient.signOut();
  };

  if (session.isPending) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-12">
        <Card>
          <CardPanel>
            <p className="text-sm text-muted-foreground">Loading session…</p>
          </CardPanel>
        </Card>
      </main>
    );
  }

  if (session.error !== null || session.data === null) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-12">
        <Card>
          <CardHeader>
            <CardTitle>Support tickets</CardTitle>
            <CardDescription>
              Clients report machine problems. Vendor staff work the queue.
            </CardDescription>
          </CardHeader>
          <CardPanel className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">You are signed out.</p>
            <Button render={<Link to="/login" />}>Sign in</Button>
          </CardPanel>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Support tickets</CardTitle>
            {role !== undefined && <Badge variant="secondary">{role}</Badge>}
          </div>
          <CardDescription>
            Signed in as {session.data.user.email}. The full dashboard lands in a later phase.
          </CardDescription>
        </CardHeader>
        <CardPanel className="grid gap-4">
          {tickets.isPending && <p className="text-sm text-muted-foreground">Loading tickets…</p>}
          {tickets.error !== null && (
            <Badge variant="error" className="justify-start whitespace-normal">
              Could not load tickets. Check your connection and try again.
            </Badge>
          )}
          {tickets.data !== undefined && (
            <p className="text-sm text-muted-foreground">
              {tickets.data.tickets.length === 0
                ? "No tickets yet. File one once the intake screen lands."
                : `${tickets.data.tickets.length} ticket${tickets.data.tickets.length === 1 ? "" : "s"} in the queue.`}
            </p>
          )}
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
