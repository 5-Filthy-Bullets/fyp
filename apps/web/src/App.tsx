import { useCallback, useEffect, useState } from "react";
import { ORPCError } from "@orpc/client";
import { authClient } from "./auth";
import { orpc } from "./orpc";
import "./App.css";

type Role = "admin" | "technician" | "client";
type TicketStatus = "open" | "in_progress" | "resolved";

const STATUS_LABELS = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
} as const satisfies Record<TicketStatus, string>;

const isRole = (value: unknown): value is Role =>
  value === "admin" || value === "technician" || value === "client";

const isTicketStatus = (value: string): value is TicketStatus => value in STATUS_LABELS;

const errorName = (value: unknown): string | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  if (!("name" in value)) return undefined;
  return typeof value.name === "string" ? value.name : undefined;
};

/** Timeout aborts surface as `TimeoutError`; caller cancels as `AbortError`, possibly wrapped in `cause`. */
const isTimeoutOrAbort = (error: unknown): boolean => {
  let current: unknown = error;
  for (let depth = 0; depth < 3; depth += 1) {
    const name = errorName(current);
    if (name === "TimeoutError" || name === "AbortError") return true;
    if (typeof current !== "object" || current === null || !("cause" in current)) return false;
    current = current.cause;
  }
  return false;
};

const messageFor = (error: unknown): string => {
  if (error instanceof ORPCError) {
    if (error.code === "UNAUTHORIZED") return "Your session expired. Sign in again.";
    if (error.code === "FORBIDDEN") return error.message;
    if (error.code === "BAD_REQUEST") return "Check the highlighted fields and try again.";
  }
  if (isTimeoutOrAbort(error)) return "The request timed out. Try again.";
  return "The request failed. Check your connection and try again.";
};

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

function IntakeForm({ onMessage }: { onMessage: (text: string) => void }) {
  const [products, setProducts] = useState<readonly { id: string; name: string }[]>([]);
  const [productId, setProductId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reporterName, setReporterName] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    orpc.product
      .listForOrg({})
      .then(({ products: available }) => {
        if (!active) return;
        setProducts(available);
        setProductId(available[0]?.id ?? "");
      })
      .catch((error: unknown) => {
        if (active) setFormError(messageFor(error));
      });

    return () => {
      active = false;
    };
  }, []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setIsPending(true);

    try {
      const { ticket } = await orpc.ticket.create({
        productId,
        title: title.trim(),
        description: description.trim(),
        reporterName: reporterName.trim(),
      });
      onMessage(`Ticket filed: ${ticket.title} (${STATUS_LABELS[ticket.status]})`);
      setTitle("");
      setDescription("");
      setReporterName("");
    } catch (error) {
      console.error("Filing the ticket failed.", error);
      setFormError(messageFor(error));
    } finally {
      setIsPending(false);
    }
  };

  return (
    <section className="panel" aria-labelledby="intake-heading">
      <h2 id="intake-heading">Report a problem</h2>
      <p className="muted">
        Tell us which machine is misbehaving and what you expected to happen instead.
      </p>

      <form onSubmit={submit}>
        <label>
          Product
          <select value={productId} onChange={(event) => setProductId(event.target.value)} required>
            {products.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          What is the problem
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Conveyor stops mid-cycle"
            required
            minLength={3}
            maxLength={120}
          />
        </label>
        <label>
          Details
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="The line halts after about twenty minutes of runtime. Restarting clears it temporarily."
            required
            minLength={10}
            maxLength={4000}
            rows={5}
          />
        </label>
        <label>
          Your name
          <input
            value={reporterName}
            onChange={(event) => setReporterName(event.target.value)}
            placeholder="Dana Okafor"
            required
            minLength={2}
            maxLength={80}
            autoComplete="name"
          />
        </label>
        <div className="actions">
          <button className="primary" type="submit" disabled={isPending || products.length === 0}>
            {isPending ? "Filing..." : "File ticket"}
          </button>
        </div>
      </form>

      {formError && <p className="status error">{formError}</p>}
    </section>
  );
}

function TicketQueue() {
  const [tickets, setTickets] = useState<
    readonly {
      id: string;
      title: string;
      organizationName: string;
      productName: string;
      status: TicketStatus;
      createdAt: string;
      assignedTo: string | null;
    }[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await orpc.ticket.list({});
      setTickets(result.tickets);
    } catch (caught) {
      console.error("Loading the ticket queue failed.", caught);
      setError(messageFor(caught));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // `active` guards the state writes, since a fast sign-out or unmount would
    // otherwise land a response on a component that is already gone.
    let active = true;

    orpc.ticket
      .list({})
      .then((result) => {
        if (active) setTickets(result.tickets);
      })
      .catch((caught: unknown) => {
        if (active) setError(messageFor(caught));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const setStatus = async (id: string, status: TicketStatus) => {
    setBusyId(id);
    setError(null);
    try {
      const { ticket } = await orpc.ticket.setStatus({ ticketId: id, status });
      setTickets((current) =>
        current.map((item) =>
          item.id === ticket.id
            ? { ...item, status: ticket.status, assignedTo: ticket.assignedTo }
            : item,
        ),
      );
    } catch (caught) {
      console.error("Updating the ticket status failed.", caught);
      setError(messageFor(caught));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="panel" aria-labelledby="queue-heading">
      <div className="panel-head">
        <div>
          <h2 id="queue-heading">Ticket queue</h2>
          <p className="muted">Every client organization, newest first.</p>
        </div>
        <button type="button" onClick={load}>
          Refresh
        </button>
      </div>

      {isLoading && <p className="status">Loading tickets...</p>}
      {error && <p className="status error">{error}</p>}

      {!isLoading && tickets.length === 0 && !error && (
        <p className="status">No tickets yet. Sign in as a client and file one.</p>
      )}

      {tickets.length > 0 && (
        <table className="ticket-table">
          <thead>
            <tr>
              <th scope="col">Organization</th>
              <th scope="col">Product</th>
              <th scope="col">Problem</th>
              <th scope="col">Status</th>
              <th scope="col">Filed</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((item) => (
              <tr key={item.id}>
                <td>{item.organizationName}</td>
                <td>{item.productName}</td>
                <td>{item.title}</td>
                <td>
                  <label className="visually-hidden" htmlFor={`status-${item.id}`}>
                    Status for {item.title}
                  </label>
                  <select
                    id={`status-${item.id}`}
                    value={item.status}
                    disabled={busyId === item.id}
                    onChange={(event) => {
                      const next: string = event.target.value;
                      if (isTicketStatus(next)) setStatus(item.id, next);
                    }}
                  >
                    {(Object.keys(STATUS_LABELS) as TicketStatus[]).map((value) => (
                      <option key={value} value={value}>
                        {STATUS_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="date">{formatDate(item.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function SignInForm({ onMessage }: { onMessage: (text: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const signIn = async () => {
    const result = await authClient.signIn.email({ email: email.trim(), password });
    onMessage(result.error?.message ?? "Signed in.");
  };

  return (
    <section className="panel auth-panel" aria-labelledby="signin-heading">
      <h2 id="signin-heading">Sign in</h2>
      <p className="muted">Use the seeded demo accounts to try each role.</p>
      <form onSubmit={(event) => event.preventDefault()}>
        <label>
          Email
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            placeholder="client@acme.test"
            required
            autoComplete="email"
          />
        </label>
        <label>
          Password
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            placeholder="demo-password-123"
            required
            autoComplete="current-password"
          />
        </label>
        <div className="actions">
          <button className="primary" type="submit" onClick={signIn}>
            Sign in
          </button>
        </div>
      </form>
    </section>
  );
}

export function App() {
  const [message, setMessage] = useState<string | null>(null);
  const session = authClient.useSession();
  // Better Auth types the session role as a plain string, since that is all it
  // knows the column holds. Narrow it before deciding which screen to render.
  const role = isRole(session.data?.user.role) ? session.data.user.role : undefined;

  const signOut = async () => {
    await authClient.signOut();
    setMessage("Signed out.");
  };

  return (
    <main className="app-shell">
      <header className="brand">
        <p className="eyebrow">Reliable Solutions</p>
        <h1>Support tickets</h1>
        <p>Clients report machine problems. Vendor staff work the queue.</p>
      </header>

      {session.isPending && <p className="status">Loading session...</p>}
      {session.error && <p className="status error">{session.error.message}</p>}

      {!session.isPending && !session.data && <SignInForm onMessage={setMessage} />}

      {session.data && role === "client" && <IntakeForm onMessage={setMessage} />}
      {session.data && (role === "technician" || role === "admin") && <TicketQueue />}

      {session.data && (
        <div className="actions">
          <button type="button" onClick={signOut}>
            Sign out
          </button>
        </div>
      )}

      {message && <p className="status">{message}</p>}
    </main>
  );
}
