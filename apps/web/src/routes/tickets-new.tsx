import { Link, useNavigate } from "@tanstack/react-router";
import { TicketPlus } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { SessionGuard } from "@/components/auth-guard";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useCaller } from "@/lib/session";
import { priorityLabel, ticketPriorities } from "@/lib/tickets";
import type { TicketPriority } from "@/lib/tickets";
import { useMyTickets } from "@/lib/tickets";
import { orpcQuery } from "@/query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const filingSchema = z.object({
  productId: z.string().min(1, "Pick the product this problem is about."),
  title: z.string().trim().min(3, "Give it a short summary (3+ characters).").max(120),
  description: z
    .string()
    .trim()
    .min(10, "Describe what happened in a sentence or two (10+ characters).")
    .max(4000),
  reporterName: z.string().trim().min(2, "Tell us who is reporting this.").max(80),
  priority: z.enum(ticketPriorities),
});

type FilingInput = z.infer<typeof filingSchema>;

const initialForm: FilingInput = {
  productId: "",
  title: "",
  description: "",
  reporterName: "",
  priority: "low",
};

type FieldErrors = Partial<Record<keyof FilingInput, string>>;

const inputClass = "w-full";

/**
 * Client-only filing form. Staff bounce back to the queue; signed-out visitors
 * never get here because the guard runs first.
 */
export function NewTicketPage() {
  return (
    <SessionGuard mode="signed-in">
      <AppShell>
        <RoleGate />
      </AppShell>
    </SessionGuard>
  );
}

function RoleGate() {
  const { role, session } = useCaller();
  const navigate = useNavigate();

  if (session.isPending || role === undefined) {
    return (
      <Card>
        <CardPanel>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </CardPanel>
      </Card>
    );
  }

  if (role !== "client") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Clients only</CardTitle>
          <CardDescription>
            Only client accounts file tickets. Staff work from the queue instead.
          </CardDescription>
        </CardHeader>
        <CardPanel>
          <Button variant="outline" onClick={() => void navigate({ to: "/tickets" })}>
            Back to tickets
          </Button>
        </CardPanel>
      </Card>
    );
  }

  return <FilingForm />;
}

function FilingForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FilingInput>(initialForm);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const productsQuery = useQuery(orpcQuery.product.listForOrg.queryOptions({ input: {} }));
  const products = productsQuery.data?.products ?? [];

  const create = useMutation(
    orpcQuery.ticket.create.mutationOptions({
      onSuccess: async (result) => {
        await queryClient.invalidateQueries({ queryKey: orpcQuery.ticket.listMine.key() });
        await navigate({
          to: "/tickets/$ticketId",
          params: { ticketId: result.ticket.id },
        });
      },
      onError: (error) => {
        const message = error instanceof Error ? error.message : "The ticket could not be filed.";
        setSubmitError(message);
      },
    }),
  );
  const queued = useMyTickets();

  const setField = (field: keyof FilingInput, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const file = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = filingSchema.safeParse(form);

    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (
          (field === "productId" ||
            field === "title" ||
            field === "description" ||
            field === "reporterName" ||
            field === "priority") &&
          next[field] === undefined
        ) {
          next[field] = issue.message;
        }
      }
      setFieldErrors(next);
      setSubmitError(null);
      return;
    }

    setFieldErrors({});
    setSubmitError(null);
    create.mutate(parsed.data);
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        title="New ticket"
        description="Tell us what broke and how urgent it is. It lands in the vendor queue immediately."
        icon={TicketPlus}
        actions={
          <Button variant="outline" render={<Link to="/tickets" />}>
            Back to tickets
          </Button>
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>What happened?</CardTitle>
          <CardDescription>
            {queued.data === undefined
              ? "File a ticket about one of your organization's products."
              : `You have ${queued.data.tickets.length} ticket${queued.data.tickets.length === 1 ? "" : "s"} so far.`}
          </CardDescription>
        </CardHeader>
        <CardPanel>
          {productsQuery.isPending ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Spinner className="size-4" aria-hidden /> Loading your products…
            </p>
          ) : productsQuery.isError ? (
            <div className="grid gap-3">
              <p className="text-sm text-destructive" role="alert">
                Could not load your products. Check your connection and try again.
              </p>
              <div>
                <Button variant="outline" size="sm" onClick={() => void productsQuery.refetch()}>
                  Try again
                </Button>
              </div>
            </div>
          ) : (
            <form className="grid gap-4" noValidate onSubmit={file}>
              <div className="grid gap-1.5">
                <Label htmlFor="product">Product</Label>
                <select
                  id="product"
                  value={form.productId}
                  onChange={(event) => setField("productId", event.target.value)}
                  aria-invalid={fieldErrors.productId !== undefined}
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base shadow-xs/5 outline-none transition-shadow focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/24 lg:h-7.5 lg:text-sm dark:bg-input/32"
                >
                  <option value="">Pick a product…</option>
                  {products.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                {fieldErrors.productId !== undefined && (
                  <p className="text-sm text-destructive">{fieldErrors.productId}</p>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="title">Summary</Label>
                <Input
                  id="title"
                  value={form.title}
                  onChange={(event) => setField("title", event.target.value)}
                  placeholder="Conveyor belt stops mid-cycle"
                  aria-invalid={fieldErrors.title !== undefined}
                  className={inputClass}
                />
                {fieldErrors.title !== undefined && (
                  <p className="text-sm text-destructive">{fieldErrors.title}</p>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="description">What happened</Label>
                <textarea
                  id="description"
                  value={form.description}
                  onChange={(event) => setField("description", event.target.value)}
                  placeholder="What happened, what you expected, and what you already tried…"
                  rows={5}
                  aria-invalid={fieldErrors.description !== undefined}
                  className="min-h-28 w-full rounded-lg border border-input bg-background px-3 py-2 text-base shadow-xs/5 outline-none transition-shadow placeholder:text-muted-foreground/72 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/24 lg:text-sm dark:bg-input/32"
                />
                {fieldErrors.description !== undefined && (
                  <p className="text-sm text-destructive">{fieldErrors.description}</p>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="reporter">Your name</Label>
                  <Input
                    id="reporter"
                    value={form.reporterName}
                    onChange={(event) => setField("reporterName", event.target.value)}
                    placeholder="Dana Okafor"
                    autoComplete="name"
                    aria-invalid={fieldErrors.reporterName !== undefined}
                    className={inputClass}
                  />
                  {fieldErrors.reporterName !== undefined && (
                    <p className="text-sm text-destructive">{fieldErrors.reporterName}</p>
                  )}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="priority">Priority</Label>
                  <select
                    id="priority"
                    value={form.priority}
                    onChange={(event) => setField("priority", event.target.value as TicketPriority)}
                    className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base shadow-xs/5 outline-none transition-shadow focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/24 lg:h-7.5 lg:text-sm dark:bg-input/32"
                  >
                    {ticketPriorities.map((value) => (
                      <option key={value} value={value}>
                        {priorityLabel(value)}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.priority !== undefined && (
                    <p className="text-sm text-destructive">{fieldErrors.priority}</p>
                  )}
                </div>
              </div>
              {submitError !== null && (
                <Badge variant="error" className="justify-start whitespace-normal" role="alert">
                  {submitError}
                </Badge>
              )}
              <div>
                <Button type="submit" loading={create.isPending}>
                  File ticket
                </Button>
              </div>
            </form>
          )}
        </CardPanel>
      </Card>
    </div>
  );
}
