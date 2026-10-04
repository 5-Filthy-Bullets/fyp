import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { authClient } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsPending(true);
    try {
      const result = await authClient.signIn.email({ email: email.trim(), password });
      if (result.error !== null) {
        setError(result.error.message ?? "Sign in failed.");
        return;
      }
      await navigate({ to: "/" });
    } catch (caught) {
      console.error("Sign in failed.", caught);
      setError("The request failed. Check your connection and try again.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Use a seeded demo account to try each role.</CardDescription>
        </CardHeader>
        <CardPanel>
          <form className="grid gap-4" onSubmit={signIn}>
            <div className="grid gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                placeholder="client@acme.test"
                required
                autoComplete="email"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                placeholder="demo-password-123"
                required
                autoComplete="current-password"
              />
            </div>
            {error !== null && (
              <Badge variant="error" className="justify-start whitespace-normal">
                {error}
              </Badge>
            )}
            <Button type="submit" loading={isPending}>
              Sign in
            </Button>
          </form>
          <p className="mt-4 text-sm text-muted-foreground">
            Signed in already? <Link to="/">Back to home</Link>
          </p>
        </CardPanel>
      </Card>
    </main>
  );
}
