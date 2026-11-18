import { Button } from "@/components/ui/button";
import { useResendVerification } from "@/lib/admin";

/**
 * Admin action for an unverified account, sent through the admin route so the
 * link can go to someone other than the signed-in admin. Better Auth builds
 * the token and mails it; the clicked link lands back on the web login page.
 */
export function ResendVerificationButton({ userId }: { readonly userId: string }) {
  const resend = useResendVerification();

  return (
    <div className="grid gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        loading={resend.isPending}
        disabled={resend.isSuccess}
        onClick={() => resend.mutate({ userId })}
      >
        {resend.isSuccess ? "Verification sent" : "Resend verification"}
      </Button>
      {resend.error !== null && (
        <p className="text-xs text-destructive" role="alert">
          {resend.error.message}
        </p>
      )}
    </div>
  );
}
