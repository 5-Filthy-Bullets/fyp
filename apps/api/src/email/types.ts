/** One outbound message. `to` holds verified recipient addresses. */
export interface EmailMessage {
  readonly to: ReadonlyArray<string>;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

/**
 * Sends one message through the configured provider. Implementations throw
 * `EmailError` when the provider rejects the send, and resolve silently
 * when there is nothing to deliver to.
 */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

type EmailReason = "transport" | "rejected";

/** Tagged error for failed sends. Carries no recipient addresses. */
export class EmailError extends Error {
  readonly _tag = "EmailError" as const;
  readonly reason: EmailReason;
  override readonly cause?: unknown;

  constructor(reason: EmailReason, detail: string, cause?: unknown) {
    super(detail);
    this.reason = reason;
    this.cause = cause;
  }
}

/** Sender used when no provider is configured. Drops every message. */
export const noopEmailSender: EmailSender = {
  send: async () => {},
};
