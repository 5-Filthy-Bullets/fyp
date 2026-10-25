import { EmailError, noopEmailSender, type EmailMessage, type EmailSender } from "./types";

const SENDGRID_ENDPOINT = "https://api.sendgrid.com/v3/mail/send";

export interface SendGridOptions {
  readonly apiKey: string;
  readonly from: string;
  readonly fetchFn?: typeof fetch;
}

/**
 * Sends through the SendGrid v3 API, which is plain HTTPS and works from
 * Workers. SMTP is not an option there: Workers cannot open raw TCP
 * connections, so Nodemailer-style transports fail at runtime.
 */
export const createSendGridSender = (options: SendGridOptions): EmailSender => {
  const runFetch = options.fetchFn ?? fetch;

  return {
    send: async (message: EmailMessage): Promise<void> => {
      if (message.to.length === 0) {
        return;
      }

      let response: Response;
      try {
        response = await runFetch(SENDGRID_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            personalizations: [{ to: message.to.map((email) => ({ email })) }],
            from: { email: options.from },
            subject: message.subject,
            content: [
              { type: "text/plain", value: message.text },
              { type: "text/html", value: message.html },
            ],
          }),
        });
      } catch (error) {
        throw new EmailError("transport", "The email provider could not be reached.", error);
      }

      if (!response.ok) {
        throw new EmailError(
          "rejected",
          `The email provider refused the send (status ${response.status}).`,
        );
      }
    },
  };
};

export interface EmailEnv {
  readonly SENDGRID_API_KEY?: string;
  readonly EMAIL_FROM?: string;
}

/**
 * Composition root for outbound mail. With a key and a verified sender the
 * app sends through SendGrid; without either it resolves silently so local
 * dev and tests never fail on a missing secret. The free tier pairs with
 * Single Sender Verification, so no owned domain is needed: verify one
 * Gmail address and use it as `EMAIL_FROM`.
 */
export const createEmailSender = (env: EmailEnv, fetchFn?: typeof fetch): EmailSender => {
  const apiKey = env.SENDGRID_API_KEY?.trim() ?? "";
  const from = env.EMAIL_FROM?.trim() ?? "";

  if (apiKey === "" || from === "") {
    return noopEmailSender;
  }

  return createSendGridSender({ apiKey, from, ...(fetchFn === undefined ? {} : { fetchFn }) });
};
