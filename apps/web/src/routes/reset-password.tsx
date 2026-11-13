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

const resetSchema = z
  .object({
    newPassword: z.string().min(8, "Use at least 8 characters.").max(128),
    confirmPassword: z.string().min(1, "Repeat the new password."),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "The passwords do not match.",
    path: ["confirmPassword"],
  });

type ResetInput = z.infer<typeof resetSchema>;

type FieldErrors = Partial<Record<keyof ResetInput, string>>;

const initialForm: ResetInput = { newPassword: "", confirmPassword: "" };

/**
 * Lands from the reset link with a token in the query string. Better Auth
 * redirects here with `?error=INVALID_TOKEN` when the link is expired or was
 * already used, so that case never shows the form.
 */
export function ResetPasswordPage() {
  return (
    <SessionGuard mode="signed-out">
      <ResetPasswordForm />
    </SessionGuard>
  );
}

function ResetPasswordForm() {
  const search = useSearch({ strict: false });
  const token = typeof search.token === "string" ? search.token : undefined;
  const hasError = typeof search.error === "string";

  const [form, setForm] = useState<ResetInput>(initialForm);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [done, setDone] = useState(false);

  const setField = (field: keyof ResetInput, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const reset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (token === undefined) {
      return;
    }

    const parsed = resetSchema.safeParse(form);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if ((field === "newPassword" || field === "confirmPassword") && next[field] === undefined) {
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
      const result = await authClient.resetPassword({
        newPassword: parsed.data.newPassword,
        token,
      });
      if (result.error !== null) {
        setSubmitError(
          result.error.code === "INVALID_TOKEN"
            ? "This link has expired or was already used. Request a new one."
            : (result.error.message ?? "The password could not be changed."),
        );
        return;
      }
      setDone(true);
    } catch (caught) {
      console.error("Password reset failed.", caught);
      setSubmitError("The request failed. Check your connection and try again.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>Choose a new password</CardTitle>
          <CardDescription>
            Use at least 8 characters. Other sessions will be signed out.
          </CardDescription>
        </CardHeader>
        <CardPanel>
          {token === undefined || hasError ? (
            <div className="grid gap-4">
              <Badge variant="error" className="justify-start whitespace-normal" role="alert">
                This reset link is invalid or has expired.
              </Badge>
              <Link to="/forgot-password" className="text-sm underline-offset-4 hover:underline">
                Request a new link
              </Link>
            </div>
          ) : done ? (
            <div className="grid gap-4">
              <Badge variant="success" className="justify-start whitespace-normal" role="status">
                Password updated. Sign in with the new password.
              </Badge>
              <Link to="/login" className="text-sm underline-offset-4 hover:underline">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form className="grid gap-4" noValidate onSubmit={reset}>
              <div className="grid gap-1.5">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  value={form.newPassword}
                  onChange={(event) => setField("newPassword", event.target.value)}
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={fieldErrors.newPassword !== undefined}
                  aria-describedby={
                    fieldErrors.newPassword !== undefined ? "new-password-error" : undefined
                  }
                />
                {fieldErrors.newPassword !== undefined && (
                  <p id="new-password-error" role="alert" className="text-sm text-destructive">
                    {fieldErrors.newPassword}
                  </p>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="confirm-password">Repeat new password</Label>
                <Input
                  id="confirm-password"
                  value={form.confirmPassword}
                  onChange={(event) => setField("confirmPassword", event.target.value)}
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={fieldErrors.confirmPassword !== undefined}
                  aria-describedby={
                    fieldErrors.confirmPassword !== undefined ? "confirm-password-error" : undefined
                  }
                />
                {fieldErrors.confirmPassword !== undefined && (
                  <p id="confirm-password-error" role="alert" className="text-sm text-destructive">
                    {fieldErrors.confirmPassword}
                  </p>
                )}
              </div>
              {submitError !== null && (
                <Badge variant="error" className="justify-start whitespace-normal" role="alert">
                  {submitError}
                </Badge>
              )}
              <Button type="submit" loading={isPending}>
                Update password
              </Button>
            </form>
          )}
        </CardPanel>
      </Card>
    </main>
  );
}
