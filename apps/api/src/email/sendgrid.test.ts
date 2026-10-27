import { describe, expect, it, vi } from "vitest";
import { EmailError, noopEmailSender } from "./types";
import { createEmailSender, createSendGridSender } from "./sendgrid";

const message = {
  to: ["tech@reliable.test"],
  subject: "Subject",
  html: "<p>Hi</p>",
  text: "Hi",
};

describe("createEmailSender", () => {
  it("stays silent without credentials instead of failing local dev", async () => {
    const sender = createEmailSender({});
    const fetchFn = vi.fn();

    await expect(sender.send(message)).resolves.toBeUndefined();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("stays silent when only one of the key or sender is set", async () => {
    await expect(
      createEmailSender({ SENDGRID_API_KEY: "key" }).send(message),
    ).resolves.toBeUndefined();
    await expect(
      createEmailSender({ EMAIL_FROM: "app@test.dev" }).send(message),
    ).resolves.toBeUndefined();
  });

  it("exposes a noop sender that drops every message", async () => {
    await expect(noopEmailSender.send(message)).resolves.toBeUndefined();
  });
});

describe("createSendGridSender", () => {
  const makeRecordedFetch = (response: Response) => {
    const calls: Array<Parameters<typeof fetch>> = [];
    const fetchFn = (async (...args: Parameters<typeof fetch>) => {
      calls.push(args);
      return response;
    }) satisfies typeof fetch;
    return { fetchFn, calls };
  };

  it("posts one personalization per recipient with the verified sender", async () => {
    const { fetchFn, calls } = makeRecordedFetch(new Response("{}", { status: 202 }));
    const sender = createSendGridSender({
      apiKey: "test-key",
      from: "app@test.dev",
      fetchFn,
    });

    await sender.send({ ...message, to: ["a@test.dev", "b@test.dev"] });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe("https://api.sendgrid.com/v3/mail/send");
    const init = calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)?.["Authorization"]).toBe("Bearer test-key");
    const body = JSON.parse(String((init as { body?: unknown })?.body));
    expect(body.personalizations).toEqual([
      { to: [{ email: "a@test.dev" }, { email: "b@test.dev" }] },
    ]);
    expect(body.from).toEqual({ email: "app@test.dev" });
    expect(body.subject).toBe("Subject");
  });

  it("skips the network when there is nobody to mail", async () => {
    const { fetchFn, calls } = makeRecordedFetch(new Response("{}", { status: 202 }));
    const sender = createSendGridSender({ apiKey: "key", from: "app@test.dev", fetchFn });

    await sender.send({ ...message, to: [] });

    expect(calls).toHaveLength(0);
  });

  it("throws a tagged error without secrets when the provider refuses the send", async () => {
    const { fetchFn } = makeRecordedFetch(new Response("bad request", { status: 400 }));
    const sender = createSendGridSender({ apiKey: "key", from: "app@test.dev", fetchFn });

    const failure = await sender.send(message).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(EmailError);
    expect((failure as EmailError).reason).toBe("rejected");
    expect((failure as EmailError).message).toContain("400");
    expect((failure as EmailError).message).not.toContain("key");
  });

  it("wraps a dead connection as a transport error", async () => {
    const failing: typeof fetch = (async () => {
      throw new TypeError("fetch failed");
    }) satisfies typeof fetch;

    const failure = await createSendGridSender({
      apiKey: "key",
      from: "app@test.dev",
      fetchFn: failing,
    })
      .send(message)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(EmailError);
    expect((failure as EmailError).reason).toBe("transport");
  });
});
