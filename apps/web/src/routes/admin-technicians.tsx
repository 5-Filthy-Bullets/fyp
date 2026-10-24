import { Copy, Check, Users } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { z } from "zod";
import { AdminGuard } from "@/components/admin-guard";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  useAdminUsers,
  useCreateTechnician,
  useSetUserActive,
  useUpdateAdminUser,
} from "@/lib/admin";
import type { AdminUser } from "@/lib/admin";

const PAGE_SIZE = 20;

const technicianSchema = z.object({
  name: z.string().trim().min(2, "Name the technician (2+ characters).").max(80),
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Initial password needs 8+ characters.").max(128),
});

type TechnicianInput = z.infer<typeof technicianSchema>;

const initialForm: TechnicianInput = { name: "", email: "", password: "" };

type FieldErrors = Partial<Record<keyof TechnicianInput, string>>;

/**
 * Technicians: directory plus create. Staff accounts carry no org, and
 * deactivating drops their sessions at once.
 */
export function AdminTechniciansPage() {
  return (
    <AdminGuard>
      <div className="grid gap-6">
        <PageHeader
          title="Technicians"
          description="Vendor staff who work the ticket queue. No organizations here."
          icon={Users}
        />
        <CreateTechnicianCard />
        <TechniciansList />
      </div>
    </AdminGuard>
  );
}

function CreateTechnicianCard() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Card>
        <CardPanel className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            New hire? Create their technician account with an initial password.
          </p>
          <Button size="sm" onClick={() => setOpen(true)}>
            New technician
          </Button>
        </CardPanel>
      </Card>
    );
  }

  return <CreateTechnicianForm onDone={() => setOpen(false)} />;
}

function CreateTechnicianForm({ onDone }: { readonly onDone: () => void }) {
  const [form, setForm] = useState<TechnicianInput>(initialForm);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const create = useCreateTechnician();

  const setField = (field: keyof TechnicianInput, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = technicianSchema.safeParse(form);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (
          (field === "name" || field === "email" || field === "password") &&
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
    setCopied(false);
    create.mutate(parsed.data, {
      onSuccess: () => {
        setCreatedPassword(parsed.data.password);
      },
      onError: (error) => {
        setSubmitError(
          error instanceof Error ? error.message : "The technician could not be created.",
        );
      },
    });
  };

  if (createdPassword !== null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Technician created</CardTitle>
          <CardDescription>
            Hand this password over outside the app. It is shown once, here.
          </CardDescription>
        </CardHeader>
        <CardPanel className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-md border bg-muted px-3 py-2 text-sm font-medium break-all">
              {createdPassword}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(createdPassword).then(() => setCopied(true));
              }}
            >
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Send it through your usual manual hand-off, never email from this app.
          </p>
          <div>
            <Button
              variant="outline"
              onClick={() => {
                setForm(initialForm);
                setCreatedPassword(null);
                onDone();
              }}
            >
              Done
            </Button>
          </div>
        </CardPanel>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New technician</CardTitle>
        <CardDescription>Staff account, no organization attached.</CardDescription>
      </CardHeader>
      <CardPanel>
        <form className="grid gap-4" noValidate onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="tech-name">Name</Label>
              <Input
                id="tech-name"
                value={form.name}
                onChange={(event) => setField("name", event.target.value)}
                placeholder="Toni Alvarez"
                autoComplete="name"
                aria-invalid={fieldErrors.name !== undefined}
              />
              {fieldErrors.name !== undefined && (
                <p className="text-sm text-destructive">{fieldErrors.name}</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tech-email">Email</Label>
              <Input
                id="tech-email"
                type="email"
                value={form.email}
                onChange={(event) => setField("email", event.target.value)}
                placeholder="toni@reliable.test"
                autoComplete="email"
                aria-invalid={fieldErrors.email !== undefined}
              />
              {fieldErrors.email !== undefined && (
                <p className="text-sm text-destructive">{fieldErrors.email}</p>
              )}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tech-password">Initial password</Label>
            <Input
              id="tech-password"
              type="password"
              value={form.password}
              onChange={(event) => setField("password", event.target.value)}
              placeholder="8+ characters, handed over manually"
              autoComplete="new-password"
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
          <div className="flex gap-2">
            <Button type="submit" loading={create.isPending}>
              Create technician
            </Button>
            <Button variant="outline" type="button" onClick={onDone}>
              Cancel
            </Button>
          </div>
        </form>
      </CardPanel>
    </Card>
  );
}

function TechniciansList() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const query = useAdminUsers({
    role: "technician",
    search,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });
  const users = query.data?.users ?? [];
  const total = query.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Directory</CardTitle>
        <CardDescription>
          {total === 0
            ? "No technicians yet."
            : `${total} ${total === 1 ? "technician" : "technicians"}.`}
        </CardDescription>
      </CardHeader>
      <CardPanel className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="tech-search">Search</Label>
          <Input
            id="tech-search"
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
            placeholder="Search name or email…"
          />
        </div>
        {query.isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Spinner className="size-4" aria-hidden /> Loading technicians…
          </p>
        ) : query.isError ? (
          <div className="grid gap-3">
            <p className="text-sm text-destructive" role="alert">
              Could not load technicians. Check your connection and try again.
            </p>
            <div>
              <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
                Try again
              </Button>
            </div>
          </div>
        ) : users.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {total === 0
              ? "Create the first technician with the button above."
              : "No technicians match this search."}
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {users.map((tech) => (
              <TechRow key={tech.id} tech={tech} />
            ))}
          </ul>
        )}
        {pageCount > 1 && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
              Page {page + 1} of {pageCount} · {total} technicians
            </p>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button
                variant="outline"
                size="sm"
                className="min-h-11 lg:min-h-0"
                disabled={page <= 0}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="min-h-11 lg:min-h-0"
                disabled={page + 1 >= pageCount}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardPanel>
    </Card>
  );
}

function TechRow({ tech }: { readonly tech: AdminUser }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tech.name);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateAdminUser(tech.id);
  const setActive = useSetUserActive(tech.id);

  const save = () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Name needs 2+ characters.");
      return;
    }
    setError(null);
    update.mutate(
      { userId: tech.id, name: trimmed },
      {
        onSuccess: () => setEditing(false),
        onError: (mutationError) => {
          setError(mutationError instanceof Error ? mutationError.message : "Could not rename.");
        },
      },
    );
  };

  const flipActive = () => {
    setError(null);
    setActive.mutate(
      // banned and active carry opposite polarity: an active account
      // (banned false) deactivates with active false, and back.
      { userId: tech.id, active: tech.banned },
      {
        onError: (mutationError) => {
          setError(mutationError instanceof Error ? mutationError.message : "Could not change.");
        },
      },
    );
  };

  return (
    <li className="grid gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        {editing ? (
          <div className="grid gap-2">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-label="Technician name"
            />
            {error !== null && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={save}>
                Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditing(false);
                  setName(tech.name);
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
              <span className="truncate">{tech.name}</span>
              {tech.banned && <Badge variant="error">Deactivated</Badge>}
            </p>
            <p className="truncate text-xs text-muted-foreground">{tech.email}</p>
            {error !== null && (
              <p className="mt-1 text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </div>
      {!editing && (
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            Rename
          </Button>
          <Button
            size="sm"
            variant={tech.banned ? "outline" : "destructive-outline"}
            onClick={flipActive}
          >
            {tech.banned ? "Reactivate" : "Deactivate"}
          </Button>
        </div>
      )}
    </li>
  );
}
