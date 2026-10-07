import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Inbox, TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { SessionGuard } from "@/components/auth-guard";
import { PriorityBadge, StatusBadge } from "@/components/dashboard-cards";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import {
  Autocomplete,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
  AutocompletePopup,
} from "@/components/ui/autocomplete";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useCaller } from "@/lib/session";
import {
  formatTicketDate,
  priorityLabel,
  statusLabel,
  ticketPriorities,
  ticketStatuses,
  useAssignTicket,
  useEscalateTicket,
  usePostTicketMessage,
  useSetTicketStatus,
  useTicketDetail,
  useTicketMessages,
  useTechnicians,
} from "@/lib/tickets";
import type { TechnicianPick, TicketMessage, TicketPriority } from "@/lib/tickets";

const escalateSchema = z.object({
  reason: z.string().trim().min(3, "Say why in a few words (3+ characters).").max(500),
});

const replySchema = z.object({
  content: z.string().trim().min(1, "Write a reply first.").max(4000),
});

export function TicketDetailPage() {
  return (
    <SessionGuard mode="signed-in">
      <AppShell>
        <TicketDetail />
      </AppShell>
    </SessionGuard>
  );
}

function TicketDetail() {
  const { ticketId } = useParams({ from: "/tickets/$ticketId" });
  const { role } = useCaller();
  const detail = useTicketDetail(ticketId);

  if (detail.isPending) {
    return (
      <Card>
        <CardPanel role="status" aria-label="Loading ticket">
          <Spinner className="size-4" aria-hidden />
        </CardPanel>
      </Card>
    );
  }

  if (detail.isError) {
    return (
      <div className="grid gap-6">
        <PageHeader
          title="Ticket"
          icon={Inbox}
          actions={
            <Button variant="outline" render={<Link to="/tickets" />}>
              <ArrowLeft aria-hidden />
              Back to tickets
            </Button>
          }
        />
        <Card>
          <CardPanel className="grid gap-3">
            <p className="text-sm text-destructive" role="alert">
              Could not load this ticket. It may not exist, or belong to another organization.
            </p>
            <div>
              <Button variant="outline" size="sm" onClick={() => void detail.refetch()}>
                Try again
              </Button>
            </div>
          </CardPanel>
        </Card>
      </div>
    );
  }

  const { ticket } = detail.data;
  const isStaff = role === "technician" || role === "admin";

  return (
    <div className="grid gap-6">
      <PageHeader
        title={ticket.title}
        description={`${ticket.organizationName} · ${ticket.productName} · filed by ${ticket.reporterName} · ${formatTicketDate(ticket.createdAt)}`}
        icon={Inbox}
        actions={
          <Button variant="outline" render={<Link to="/tickets" />}>
            <ArrowLeft aria-hidden />
            Back to tickets
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={ticket.status} />
        <PriorityBadge priority={ticket.priority} />
        {ticket.escalated && <Badge variant="error">Escalated</Badge>}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid min-w-0 content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>What happened</CardTitle>
              <CardDescription>
                The reporter's story, as filed{isStaff ? ` by ${ticket.reporterName}` : ""}.
              </CardDescription>
            </CardHeader>
            <CardPanel>
              <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
            </CardPanel>
          </Card>
          <MessageThread ticketId={ticketId} />
          <Composer ticketId={ticketId} isStaff={isStaff} />
        </div>
        <div className="grid content-start gap-6">
          <ActionsCard ticketId={ticketId} />
        </div>
      </div>
    </div>
  );
}

function MessageThread({ ticketId }: { readonly ticketId: string }) {
  const thread = useTicketMessages(ticketId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conversation</CardTitle>
        <CardDescription>
          Replies oldest first. Internal notes stay inside vendor staff.
        </CardDescription>
      </CardHeader>
      {thread.isPending ? (
        <CardPanel role="status" aria-label="Loading messages">
          <Spinner className="size-4" aria-hidden />
        </CardPanel>
      ) : thread.isError ? (
        <CardPanel className="grid gap-3">
          <p className="text-sm text-destructive" role="alert">
            Could not load the conversation. Check your connection and try again.
          </p>
          <div>
            <Button variant="outline" size="sm" onClick={() => void thread.refetch()}>
              Try again
            </Button>
          </div>
        </CardPanel>
      ) : thread.data.messages.length === 0 ? (
        <CardPanel>
          <p className="text-sm text-muted-foreground">
            No replies yet. The first reply from either side shows up here.
          </p>
        </CardPanel>
      ) : (
        <CardPanel className="grid gap-0 p-0">
          <ul className="divide-y">
            {thread.data.messages.map((message) => (
              <MessageRow key={message.id} message={message} />
            ))}
          </ul>
        </CardPanel>
      )}
    </Card>
  );
}

function MessageRow({ message }: { readonly message: TicketMessage }) {
  return (
    <li className="grid gap-1 px-6 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatTicketDate(message.createdAt)}
        </span>
        {message.visibility === "internal" && (
          <Badge variant="warning" size="sm">
            Internal note
          </Badge>
        )}
      </div>
      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
    </li>
  );
}

function Composer({ ticketId, isStaff }: { readonly ticketId: string; readonly isStaff: boolean }) {
  const post = usePostTicketMessage(ticketId);
  const [content, setContent] = useState("");
  const [internal, setInternal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = replySchema.safeParse({ content });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Write a reply first.");
      return;
    }

    setError(null);
    post.mutate(
      {
        ticketId,
        content: parsed.data.content,
        ...(isStaff && internal ? { visibility: "internal" as const } : {}),
      },
      {
        onSuccess: () => {
          setContent("");
          setInternal(false);
        },
        onError: (mutationError) => {
          setError(
            mutationError instanceof Error ? mutationError.message : "The reply was not sent.",
          );
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reply</CardTitle>
        <CardDescription>
          {isStaff
            ? "Public replies go to the client. Internal notes stay inside staff."
            : "Your reply goes straight to the vendor team."}
        </CardDescription>
      </CardHeader>
      <CardPanel>
        <form className="grid gap-3" onSubmit={send}>
          <div className="grid gap-1.5">
            <Label htmlFor="reply">Message</Label>
            <textarea
              id="reply"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={4}
              placeholder="Write an update…"
              className="min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-base shadow-xs/5 outline-none transition-shadow placeholder:text-muted-foreground/72 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/24 sm:text-sm dark:bg-input/32"
            />
          </div>
          {isStaff && (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={internal}
                onChange={(event) => setInternal(event.target.checked)}
                className="size-4 accent-primary"
              />
              Internal note (clients never see this)
            </label>
          )}
          {error !== null && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          {post.isError && error === null && (
            <p className="text-sm text-destructive" role="alert">
              The reply was not sent. Try again.
            </p>
          )}
          <div>
            <Button type="submit" loading={post.isPending}>
              {isStaff && internal ? "Add internal note" : "Send reply"}
            </Button>
          </div>
        </form>
      </CardPanel>
    </Card>
  );
}

/** Matches the assignee picker query against name, email, or id. */
const matchesTechnician = (tech: TechnicianPick, query: string): boolean => {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return true;
  }
  return `${tech.name} ${tech.email} ${tech.id}`.toLowerCase().includes(needle);
};

/**
 * Autocomplete reports text, not the picked row: an exact id, email, or name
 * hit resolves back to the technician, anything else clears the selection.
 */
const resolveTechnicianId = (techs: readonly TechnicianPick[], text: string): string => {
  if (text === "") {
    return "";
  }
  const exact = techs.find((tech) => tech.id === text || tech.email === text || tech.name === text);
  return exact?.id ?? "";
};

function ActionsCard({ ticketId }: { readonly ticketId: string }) {
  const { role, userId } = useCaller();
  const detail = useTicketDetail(ticketId);
  const setStatus = useSetTicketStatus(ticketId);
  const assign = useAssignTicket(ticketId);
  const ticket = detail.data?.ticket;
  const techsQuery = useTechnicians();
  const techs = techsQuery.data?.technicians ?? [];

  const isStaff = role === "technician" || role === "admin";
  const [assigneeId, setAssigneeId] = useState("");
  const [pickerKey, setPickerKey] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!isStaff) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>What happens next</CardTitle>
          <CardDescription>The vendor team picks this up from the queue.</CardDescription>
        </CardHeader>
        <CardPanel>
          <p className="text-sm text-muted-foreground">
            Reply above if you have more detail. Status, priority, and assignment are handled by
            vendor staff.
          </p>
        </CardPanel>
      </Card>
    );
  }

  const claim = () => {
    setActionError(null);
    setStatus.mutate(
      { ticketId, status: "in_progress" },
      {
        onError: (error) => {
          setActionError(error instanceof Error ? error.message : "Could not claim the ticket.");
        },
      },
    );
  };

  const changeStatus = (status: (typeof ticketStatuses)[number]) => {
    setActionError(null);
    setStatus.mutate(
      { ticketId, status },
      {
        onError: (error) => {
          setActionError(error instanceof Error ? error.message : "Could not change status.");
        },
      },
    );
  };

  const changePriority = (priority: TicketPriority) => {
    setActionError(null);
    setStatus.mutate(
      { ticketId, priority },
      {
        onError: (error) => {
          setActionError(error instanceof Error ? error.message : "Could not change priority.");
        },
      },
    );
  };

  const assignTo = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = assigneeId.trim();
    if (trimmed === "") {
      setActionError("Pick a technician first.");
      return;
    }
    setActionError(null);
    assign.mutate(
      { ticketId, assigneeId: trimmed },
      {
        onSuccess: () => {
          setAssigneeId("");
          setPickerKey((key) => key + 1);
        },
        onError: (error) => {
          setActionError(error instanceof Error ? error.message : "Could not assign the ticket.");
        },
      },
    );
  };

  const isMine = userId !== undefined && ticket?.assignedTo === userId;
  // Never the raw user id: fall back to "someone" until the directory names them.
  const assigneeName =
    ticket?.assignedTo === undefined || ticket.assignedTo === null
      ? null
      : (techs.find((tech) => tech.id === ticket.assignedTo)?.name ?? null);
  const busy = setStatus.isPending || assign.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Actions</CardTitle>
      </CardHeader>
      <CardPanel className="grid gap-4">
        {ticket?.escalated === true && (
          <div className="grid gap-1 rounded-lg border border-destructive/32 bg-destructive/8 p-3 dark:bg-destructive/16">
            <p className="flex items-center gap-1.5 text-sm font-medium text-destructive-foreground">
              <TriangleAlert className="size-4" aria-hidden />
              Escalated for admin review
            </p>
            {ticket.escalatedReason !== null && (
              <p className="text-sm text-muted-foreground">{ticket.escalatedReason}</p>
            )}
          </div>
        )}
        {ticket?.assignedTo === null ? (
          <Button onClick={claim} loading={setStatus.isPending}>
            Claim this ticket
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            {isMine ? "You own this ticket." : `Assigned to ${assigneeName ?? "someone"}.`}
          </p>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="status-select">Status</Label>
          <select
            id="status-select"
            value={ticket?.status ?? "open"}
            onChange={(event) =>
              changeStatus(event.target.value as (typeof ticketStatuses)[number])
            }
            disabled={busy || ticket === undefined}
            className="h-8.5 w-full rounded-lg border border-input bg-background px-3 text-base shadow-xs/5 outline-none transition-shadow focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/24 disabled:opacity-64 sm:h-7.5 sm:text-sm dark:bg-input/32"
          >
            {ticketStatuses.map((value) => (
              <option key={value} value={value}>
                {statusLabel(value)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="priority-select">Priority</Label>
          <select
            id="priority-select"
            value={ticket?.priority ?? "low"}
            onChange={(event) => changePriority(event.target.value as TicketPriority)}
            disabled={busy || ticket === undefined}
            className="h-8.5 w-full rounded-lg border border-input bg-background px-3 text-base shadow-xs/5 outline-none transition-shadow focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/24 disabled:opacity-64 sm:h-7.5 sm:text-sm dark:bg-input/32"
          >
            {ticketPriorities.map((value) => (
              <option key={value} value={value}>
                {priorityLabel(value)}
              </option>
            ))}
          </select>
        </div>
        <form className="grid gap-1.5" onSubmit={assignTo}>
          <Label htmlFor="assignee">Assign to technician</Label>
          {techsQuery.isPending ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Spinner className="size-4" aria-hidden /> Loading technicians…
            </p>
          ) : (
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <Autocomplete
                  key={pickerKey}
                  items={techs}
                  filter={matchesTechnician}
                  itemToStringValue={(tech) => tech.name}
                  openOnInputClick
                  onValueChange={(text) => setAssigneeId(resolveTechnicianId(techs, text))}
                >
                  <AutocompleteInput
                    id="assignee"
                    placeholder="Search by name, email, or id…"
                    showTrigger
                    showClear
                  />
                  <AutocompletePopup>
                    <AutocompleteEmpty>No technicians match this search.</AutocompleteEmpty>
                    <AutocompleteList>
                      {(tech) => (
                        <AutocompleteItem key={tech.id} value={tech}>
                          <span className="grid min-w-0 flex-1">
                            <span className="truncate text-sm font-medium">{tech.name}</span>
                            <span className="truncate text-xs text-muted-foreground">
                              {tech.email}
                            </span>
                          </span>
                        </AutocompleteItem>
                      )}
                    </AutocompleteList>
                  </AutocompletePopup>
                </Autocomplete>
              </div>
              <Button type="submit" variant="outline" loading={assign.isPending}>
                Assign
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Search by name, email, or id. Only technician accounts can own queue work.
          </p>
        </form>
        {role === "technician" && !ticket?.escalated && <EscalateForm ticketId={ticketId} />}
        {actionError !== null && (
          <p className="text-sm text-destructive" role="alert">
            {actionError}
          </p>
        )}
      </CardPanel>
    </Card>
  );
}

function EscalateForm({ ticketId }: { readonly ticketId: string }) {
  const escalate = useEscalateTicket(ticketId);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = escalateSchema.safeParse({ reason });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Say why in a few words.");
      return;
    }

    setError(null);
    escalate.mutate(
      { ticketId, reason: parsed.data.reason },
      {
        onSuccess: () => {
          setReason("");
          setOpen(false);
        },
        onError: (mutationError) => {
          setError(
            mutationError instanceof Error
              ? mutationError.message
              : "The ticket was not escalated.",
          );
        },
      },
    );
  };

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <TriangleAlert aria-hidden />
        Escalate to admin
      </Button>
    );
  }

  return (
    <form className="grid gap-2 rounded-lg border p-3" onSubmit={submit}>
      <Label htmlFor="escalate-reason">Why does this need admin review?</Label>
      <Input
        id="escalate-reason"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Needs a replacement part…"
      />
      {error !== null && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={escalate.isPending}>
          Escalate
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
