import { Package } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useAdminOrg,
  useAdminOrgs,
  useAdminProducts,
  useCreateAdminProduct,
  useSetEntitlements,
} from "@/lib/admin";

const PAGE_SIZE = 20;

const productSchema = z.object({
  name: z.string().trim().min(2, "Name the product (2+ characters).").max(120),
});

/**
 * Products: catalog plus create, and the per-org entitlement editor. The
 * checkboxes send the whole checked set; the API replaces it wholesale.
 */
export function AdminProductsPage() {
  return (
    <AdminGuard>
      <div className="grid gap-6">
        <PageHeader
          title="Products"
          description="Catalog and which companies can file against each product."
          icon={Package}
        />
        <CreateProductCard />
        <ProductsList />
        <EntitlementEditor />
      </div>
    </AdminGuard>
  );
}

function CreateProductCard() {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useCreateAdminProduct();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = productSchema.safeParse({ name });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Name the product (2+ characters).");
      return;
    }
    setError(null);
    create.mutate(parsed.data, {
      onSuccess: () => setName(""),
      onError: (mutationError) => {
        setError(mutationError instanceof Error ? mutationError.message : "Could not create.");
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>New product</CardTitle>
        <CardDescription>The slug is built from the name automatically.</CardDescription>
      </CardHeader>
      <CardPanel>
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" noValidate onSubmit={submit}>
          <div className="grid flex-1 gap-1.5">
            <Label htmlFor="product-name">Product name</Label>
            <Input
              id="product-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Line 10 Controller"
              aria-invalid={error !== null}
            />
            {error !== null && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
          <Button type="submit" loading={create.isPending}>
            Create product
          </Button>
        </form>
      </CardPanel>
    </Card>
  );
}

function ProductsList() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const query = useAdminProducts({ search, limit: PAGE_SIZE, offset: page * PAGE_SIZE });
  const products = query.data?.products ?? [];
  const total = query.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Catalog</CardTitle>
        <CardDescription>
          {total === 0 ? "No products yet." : `${total} ${total === 1 ? "product" : "products"}.`}
        </CardDescription>
      </CardHeader>
      <CardPanel className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="product-search">Search</Label>
          <Input
            id="product-search"
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
            placeholder="Search products…"
          />
        </div>
        {query.isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Spinner className="size-4" aria-hidden /> Loading products…
          </p>
        ) : query.isError ? (
          <div className="grid gap-3">
            <p className="text-sm text-destructive" role="alert">
              Could not load products. Check your connection and try again.
            </p>
            <div>
              <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
                Try again
              </Button>
            </div>
          </div>
        ) : products.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {total === 0
              ? "Create the first product with the form above."
              : "No products match this search."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Organizations</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{item.slug}</p>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary">
                      {item.organizationCount} {item.organizationCount === 1 ? "org" : "orgs"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {pageCount > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
              Page {page + 1} of {pageCount} · {total} products
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 0}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
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

function EntitlementEditor() {
  const [orgId, setOrgId] = useState("");
  const orgsQuery = useAdminOrgs({ limit: 100 });
  const orgs = orgsQuery.data?.organizations ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entitlements</CardTitle>
        <CardDescription>
          Pick a company, check what it can file against, save once.
        </CardDescription>
      </CardHeader>
      <CardPanel className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="entitlement-org">Company</Label>
          <select
            id="entitlement-org"
            value={orgId}
            onChange={(event) => setOrgId(event.target.value)}
            className="h-8.5 w-full rounded-lg border border-input bg-background px-3 text-base shadow-xs/5 outline-none transition-shadow focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/24 sm:h-7.5 sm:text-sm dark:bg-input/32"
          >
            <option value="">Pick a company…</option>
            {orgs.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>
        {orgId === "" ? (
          <p className="text-sm text-muted-foreground">
            {orgsQuery.isPending ? "Loading companies…" : "Choose a company to edit its products."}
          </p>
        ) : (
          <EntitlementForm key={orgId} organizationId={orgId} />
        )}
      </CardPanel>
    </Card>
  );
}

function EntitlementForm({ organizationId }: { readonly organizationId: string }) {
  const orgQuery = useAdminOrg(organizationId);
  const productsQuery = useAdminProducts({ limit: 100 });
  const [checked, setChecked] = useState<readonly string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const save = useSetEntitlements(organizationId);

  const org = orgQuery.data?.organization;
  const products = productsQuery.data?.products ?? [];
  const current = checked ?? org?.productIds ?? [];

  const toggle = (productId: string) => {
    setSaved(false);
    setChecked(
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
  };

  const submit = () => {
    setError(null);
    setSaved(false);
    save.mutate(
      { organizationId, productIds: [...current] },
      {
        onSuccess: () => {
          setSaved(true);
          setChecked(null);
        },
        onError: (mutationError) => {
          setError(mutationError instanceof Error ? mutationError.message : "Could not save.");
        },
      },
    );
  };

  if (orgQuery.isPending || productsQuery.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Spinner className="size-4" aria-hidden /> Loading entitlements…
      </p>
    );
  }

  if (orgQuery.isError || productsQuery.isError || org === undefined) {
    return (
      <div className="grid gap-3">
        <p className="text-sm text-destructive" role="alert">
          Could not load entitlements. Check your connection and try again.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void orgQuery.refetch()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        {org.name}: {org.productCount} {org.productCount === 1 ? "product" : "products"} entitled,{" "}
        {org.memberCount} {org.memberCount === 1 ? "member" : "members"}.
      </p>
      {products.length === 0 ? (
        <p className="text-sm text-muted-foreground">No products in the catalog yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {products.map((item) => {
            const active = current.includes(item.id);
            return (
              <Button
                key={item.id}
                type="button"
                variant={active ? "default" : "outline"}
                size="sm"
                aria-pressed={active}
                onClick={() => toggle(item.id)}
              >
                {item.name}
              </Button>
            );
          })}
        </div>
      )}
      {error !== null && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="text-sm text-muted-foreground" role="status">
          Saved. The client filing form reads this list.
        </p>
      )}
      <div>
        <Button size="sm" onClick={submit}>
          Save entitlements
        </Button>
      </div>
    </div>
  );
}
