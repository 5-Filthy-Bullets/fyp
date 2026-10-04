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
  const [form, setForm] = useState<LoginInput>(initialForm);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const setField = (field: keyof LoginInput, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
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
              />
              {fieldErrors.email !== undefined && (
                <p className="text-sm text-destructive">{fieldErrors.email}</p>
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
              />
              {fieldErrors.password !== undefined && (
                <p className="text-sm text-destructive">{fieldErrors.password}</p>
              )}
            </div>
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
