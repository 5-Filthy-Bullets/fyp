import { Building, Copy, Check } from "lucide-react";
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
import { useAdminOrgs, useCreateClient, useSetOrgActive, useUpdateAdminOrg } from "@/lib/admin";
import type { AdminOrg } from "@/lib/admin";
import { useAdminProducts } from "@/lib/admin";

const PAGE_SIZE = 20;

const clientSchema = z.object({
  orgName: z.string().trim().min(2, "Name the company (2+ characters).").max(120),
  name: z.string().trim().min(2, "Name the first user (2+ characters).").max(80),
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Initial password needs 8+ characters.").max(128),
  productIds: z.array(z.string().min(1)),
});

type ClientInput = z.infer<typeof clientSchema>;

const initialForm: ClientInput = {
  orgName: "",
  name: "",
  email: "",
  password: "",
  productIds: [],
};

type FieldErrors = Partial<Record<"orgName" | "name" | "email" | "password", string>>;

/**
 * Client companies: directory plus the one-flow create (org, first user,
 * entitlements). Deactivating suspends the whole company at once.
 */
export function AdminClientsPage() {
  return (
    <AdminGuard>
      <div className="grid gap-6">
        <PageHeader
          title="Clients"
          description="Companies, their users, and what each can file against."
          icon={Building}
        />
        <CreateClientCard />
        <ClientsList />
      </div>
    </AdminGuard>
  );
}

function CreateClientCard() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Card>
        <CardPanel className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            New company? Create the org, its first user, and entitlements in one flow.
          </p>
          <Button size="sm" onClick={() => setOpen(true)}>
            New client
          </Button>
        </CardPanel>
      </Card>
    );
  }

  return <CreateClientForm onDone={() => setOpen(false)} />;
}

function CreateClientForm({ onDone }: { readonly onDone: () => void }) {
  const [form, setForm] = useState<ClientInput>(initialForm);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const productsQuery = useAdminProducts({});
  const products = productsQuery.data?.products ?? [];
  const create = useCreateClient();

  const setField = (field: "orgName" | "name" | "email" | "password", value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleProduct = (productId: string) => {
    setForm((prev) => ({
      ...prev,
      productIds: prev.productIds.includes(productId)
        ? prev.productIds.filter((id) => id !== productId)
        : [...prev.productIds, productId],
    }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = clientSchema.safeParse(form);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (
          (field === "orgName" || field === "name" || field === "email" || field === "password") &&
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
        setSubmitError(error instanceof Error ? error.message : "The client could not be created.");
      },
    });
  };

  if (createdPassword !== null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Client created</CardTitle>
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
            Send it through your usual manual hand-off, never email from this app. The new user
            signs in with their email and this password.
          </p>
          <div className="flex gap-2">
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
        <CardTitle>New client</CardTitle>
        <CardDescription>
          One flow: the company, its first user, and what they can file against.
        </CardDescription>
      </CardHeader>
      <CardPanel>
        <form className="grid gap-4" noValidate onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="client-org">Company name</Label>
              <Input
                id="client-org"
                value={form.orgName}
                onChange={(event) => setField("orgName", event.target.value)}
                placeholder="Globex Corporation"
                aria-invalid={fieldErrors.orgName !== undefined}
              />
              {fieldErrors.orgName !== undefined && (
                <p className="text-sm text-destructive">{fieldErrors.orgName}</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="client-contact">First user name</Label>
              <Input
                id="client-contact"
                value={form.name}
                onChange={(event) => setField("name", event.target.value)}
                placeholder="Hank Scorpio"
                autoComplete="name"
                aria-invalid={fieldErrors.name !== undefined}
              />
              {fieldErrors.name !== undefined && (
                <p className="text-sm text-destructive">{fieldErrors.name}</p>
              )}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="client-email">First user email</Label>
              <Input
                id="client-email"
                type="email"
                value={form.email}
                onChange={(event) => setField("email", event.target.value)}
                placeholder="hank@globex.test"
                autoComplete="email"
                aria-invalid={fieldErrors.email !== undefined}
              />
              {fieldErrors.email !== undefined && (
                <p className="text-sm text-destructive">{fieldErrors.email}</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="client-password">Initial password</Label>
              <Input
                id="client-password"
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
          </div>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Entitled products</legend>
            {productsQuery.isPending ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <Spinner className="size-4" aria-hidden /> Loading products…
              </p>
            ) : products.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No products yet. Create them under Products first.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                {products.map((item) => {
                  const checked = form.productIds.includes(item.id);
                  return (
                    <Button
                      key={item.id}
                      type="button"
                      variant={checked ? "default" : "outline"}
                      size="sm"
                      aria-pressed={checked}
                      onClick={() => toggleProduct(item.id)}
                    >
                      {item.name}
                    </Button>
                  );
                })}
              </div>
            )}
          </fieldset>
          {submitError !== null && (
            <Badge variant="error" className="justify-start whitespace-normal" role="alert">
              {submitError}
            </Badge>
          )}
          <div className="flex gap-2">
            <Button type="submit" loading={create.isPending}>
              Create client
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

function ClientsList() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const query = useAdminOrgs({ search, limit: PAGE_SIZE, offset: page * PAGE_SIZE });
  const orgs = query.data?.organizations ?? [];
  const total = query.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Companies</CardTitle>
        <CardDescription>
          {total === 0 ? "No companies yet." : `${total} ${total === 1 ? "company" : "companies"}.`}
        </CardDescription>
      </CardHeader>
      <CardPanel className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="client-search">Search</Label>
          <Input
            id="client-search"
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
            placeholder="Search companies…"
          />
        </div>
        {query.isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Spinner className="size-4" aria-hidden /> Loading companies…
          </p>
        ) : query.isError ? (
          <div className="grid gap-3">
            <p className="text-sm text-destructive" role="alert">
              Could not load companies. Check your connection and try again.
            </p>
            <div>
              <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
                Try again
              </Button>
            </div>
          </div>
        ) : orgs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {total === 0
              ? "Create the first client with the button above."
              : "No companies match this search."}
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {orgs.map((org) => (
              <OrgRow key={org.id} org={org} />
            ))}
          </ul>
        )}
        {pageCount > 1 && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
              Page {page + 1} of {pageCount} · {total} companies
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

function OrgRow({ org }: { readonly org: AdminOrg }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(org.name);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateAdminOrg(org.id);
  const setActive = useSetOrgActive(org.id);

  const save = () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Name needs 2+ characters.");
      return;
    }
    setError(null);
    update.mutate(
      { organizationId: org.id, name: trimmed },
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
      { organizationId: org.id, active: !org.isActive },
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
              aria-label="Company name"
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
                  setName(org.name);
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
              <span className="truncate">{org.name}</span>
              {!org.isActive && <Badge variant="error">Suspended</Badge>}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {org.slug} · {org.memberCount} {org.memberCount === 1 ? "member" : "members"} ·{" "}
              {org.productCount} {org.productCount === 1 ? "product" : "products"}
            </p>
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
            variant={org.isActive ? "destructive-outline" : "outline"}
            onClick={flipActive}
          >
            {org.isActive ? "Suspend" : "Reactivate"}
          </Button>
        </div>
      )}
    </li>
  );
}
