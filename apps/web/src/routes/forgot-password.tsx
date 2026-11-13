import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { FormEvent } from "react";
import { z } from "zod";
import { authClient } from "@/auth";
import { SessionGuard } from "@/components/auth-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const emailSchema = z.email("Enter a valid email address.");

/**
 * Requests a reset link. The response says the same thing whether or not the
 * address exists, so this page cannot be used to probe for accounts.
 */
export function ForgotPasswordPage() {
  return (
    <SessionGuard mode="signed-out">
      <ForgotPasswordForm />
    </SessionGuard>
  );
}

function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const requestReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = emailSchema.safeParse(email.trim());

    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Enter a valid email address.");
      setSubmitError(null);
      return;
    }

    setFieldError(null);
    setSubmitError(null);
    setIsPending(true);
    try {
      const result = await authClient.requestPasswordReset({
        email: parsed.data,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (result.error !== null) {
        setSubmitError(result.error.message ?? "The request failed. Try again.");
        return;
      }
      setSent(true);
    } catch (caught) {
      console.error("Password reset request failed.", caught);
      setSubmitError("The request failed. Check your connection and try again.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>Forgot password</CardTitle>
          <CardDescription>
            Enter your account email and we will send a link to choose a new password.
          </CardDescription>
        </CardHeader>
        <CardPanel>
          {sent ? (
            <div className="grid gap-4">
              <Badge variant="success" className="justify-start whitespace-normal" role="status">
                If that email is registered, a reset link is on its way. It expires in one hour.
              </Badge>
              <p className="text-sm text-muted-foreground">
                Nothing arrived? Check spam, then try again.
              </p>
              <Button variant="outline" onClick={() => setSent(false)}>
                Send another link
              </Button>
              <Link to="/login" className="text-sm underline-offset-4 hover:underline">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form className="grid gap-4" noValidate onSubmit={requestReset}>
              <div className="grid gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  placeholder="you@company.example"
                  autoComplete="email"
                  aria-invalid={fieldError !== null}
                  aria-describedby={fieldError !== null ? "email-error" : undefined}
                />
                {fieldError !== null && (
                  <p id="email-error" role="alert" className="text-sm text-destructive">
                    {fieldError}
                  </p>
                )}
              </div>
              {submitError !== null && (
                <Badge variant="error" className="justify-start whitespace-normal" role="alert">
                  {submitError}
                </Badge>
              )}
              <Button type="submit" loading={isPending}>
                Send reset link
              </Button>
              <Link to="/login" className="text-sm underline-offset-4 hover:underline">
                Back to sign in
              </Link>
            </form>
          )}
        </CardPanel>
      </Card>
    </main>
  );
}
