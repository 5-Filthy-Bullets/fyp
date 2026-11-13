import { useState } from "react";
import { authClient } from "@/auth";
import { Button } from "@/components/ui/button";

/**
 * Admin action for an unverified account. Better Auth builds the token and
 * mails the link, which lands back on the web login page once verified.
 */
export function ResendVerificationButton({ email }: { readonly email: string }) {
  const [state, setState] = useState<"idle" | "pending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setError(null);
    setState("pending");
    try {
      const result = await authClient.sendVerificationEmail({
        email,
        callbackURL: `${window.location.origin}/login?verified=1`,
      });
      if (result.error !== null) {
        setError(result.error.message ?? "The verification email could not be sent.");
        setState("idle");
        return;
      }
      setState("sent");
    } catch (caught) {
      console.error("Verification email request failed.", caught);
      setError("The request failed. Check your connection and try again.");
      setState("idle");
    }
  };

  return (
    <div className="grid gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        loading={state === "pending"}
        disabled={state === "sent"}
        onClick={() => void send()}
      >
        {state === "sent" ? "Verification sent" : "Resend verification"}
      </Button>
      {error !== null && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
