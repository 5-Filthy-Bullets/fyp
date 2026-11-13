import { Link, useSearch } from "@tanstack/react-router";
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

const loginSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

const emailSchema = z.email("Enter a valid email address.");

type LoginInput = z.infer<typeof loginSchema>;

const initialForm: LoginInput = { email: "", password: "" };

type FieldErrors = Partial<Record<keyof LoginInput, string>>;

const INVALID_CREDENTIALS = "Invalid email or password.";

/** Better Auth reports bad credentials through nested error codes. */
const isInvalidCredentials = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return (
    code === "INVALID_EMAIL_OR_PASSWORD" ||
    code === "INVALID_CREDENTIALS" ||
    code === "USER_NOT_FOUND"
  );
};

export function LoginPage() {
  return (
    <SessionGuard mode="signed-out">
      <LoginForm />
    </SessionGuard>
  );
}

function LoginForm() {
  const { verified } = useSearch({ from: "/login" });
  const [form, setForm] = useState<LoginInput>(initialForm);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [resendState, setResendState] = useState<"idle" | "pending" | "sent">("idle");
  const [resendError, setResendError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const setField = (field: keyof LoginInput, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const resendVerification = async () => {
    const parsed = emailSchema.safeParse(form.email.trim());
    if (!parsed.success) {
      setFieldErrors((prev) => ({
        ...prev,
        email: parsed.error.issues[0]?.message ?? "Enter a valid email address.",
      }));
      setResendError(null);
      return;
    }

    setFieldErrors((prev) => ({ ...prev, email: undefined }));
    setResendError(null);
    setResendState("pending");
    try {
      const result = await authClient.sendVerificationEmail({
        email: parsed.data,
        callbackURL: `${window.location.origin}/login?verified=1`,
      });
      if (result.error !== null) {
        setResendError(result.error.message ?? "The verification email could not be sent.");
        setResendState("idle");
        return;
      }
      setResendState("sent");
    } catch (caught) {
      console.error("Verification email request failed.", caught);
      setResendError("The request failed. Check your connection and try again.");
      setResendState("idle");
    }
  };

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = loginSchema.safeParse({ email: form.email.trim(), password: form.password });

    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if ((field === "email" || field === "password") && next[field] === undefined) {
          next[field] = issue.message;
        }
      }
      setFieldErrors(next);
      setSubmitError(null);
      return;
    }

    setFieldErrors({});
    setSubmitError(null);
    setIsPending(true);
    try {
      const result = await authClient.signIn.email(parsed.data);
      if (result.error !== null) {
        setSubmitError(
          isInvalidCredentials(result.error)
            ? INVALID_CREDENTIALS
            : (result.error.message ?? "Sign in failed."),
        );
        return;
      }
      // No manual navigate: the guard sees the new session and bounces to "/".
    } catch (caught) {
      console.error("Sign in failed.", caught);
      setSubmitError("The request failed. Check your connection and try again.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Reliable Solutions support. Use your assigned account.</CardDescription>
        </CardHeader>
        <CardPanel>
          {verified === "1" && (
            <Badge variant="success" className="mb-4 justify-start whitespace-normal" role="status">
              Email verified. Sign in to continue.
            </Badge>
          )}
          <form className="grid gap-4" noValidate onSubmit={signIn}>
            <div className="grid gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                value={form.email}
                onChange={(event) => setField("email", event.target.value)}
                type="email"
                placeholder="you@company.example"
                autoComplete="email"
                aria-invalid={fieldErrors.email !== undefined}
                aria-describedby={fieldErrors.email !== undefined ? "email-error" : undefined}
              />
              {fieldErrors.email !== undefined && (
                <p id="email-error" role="alert" className="text-sm text-destructive">
                  {fieldErrors.email}
                </p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                value={form.password}
                onChange={(event) => setField("password", event.target.value)}
                type="password"
                autoComplete="current-password"
                aria-invalid={fieldErrors.password !== undefined}
                aria-describedby={fieldErrors.password !== undefined ? "password-error" : undefined}
              />
              {fieldErrors.password !== undefined && (
                <p id="password-error" role="alert" className="text-sm text-destructive">
                  {fieldErrors.password}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link to="/forgot-password" className="text-sm underline-offset-4 hover:underline">
                Forgot password?
              </Link>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto px-0 py-0 text-sm lg:h-auto"
                loading={resendState === "pending"}
                onClick={resendVerification}
              >
                Resend verification email
              </Button>
            </div>
            {resendState === "sent" && (
              <Badge variant="success" className="justify-start whitespace-normal" role="status">
                Verification email sent. Check your inbox.
              </Badge>
            )}
            {resendError !== null && (
              <Badge variant="error" className="justify-start whitespace-normal" role="alert">
                {resendError}
              </Badge>
            )}
            {submitError !== null && (
              <Badge variant="error" className="justify-start whitespace-normal" role="alert">
                {submitError}
              </Badge>
            )}
            <Button type="submit" loading={isPending}>
              Sign in
            </Button>
          </form>
          <p className="mt-4 text-sm text-muted-foreground">
            No account yet? Your credentials are handed over manually by the vendor team.
          </p>
        </CardPanel>
      </Card>
    </main>
  );
}
