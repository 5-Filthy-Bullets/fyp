import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { RouterClient } from "@orpc/server";
import type { AppRouter } from "../../../api/src/router";
import { orpcQuery } from "@/query";

type AdminRouter = RouterClient<AppRouter>["admin"];

export type AdminUser = Awaited<ReturnType<AdminRouter["user"]["list"]>>["users"][number];
export type AdminOrg = Awaited<ReturnType<AdminRouter["org"]["list"]>>["organizations"][number];
export type AdminOrgDetail = Awaited<ReturnType<AdminRouter["org"]["get"]>>["organization"];
export type AdminProduct = Awaited<ReturnType<AdminRouter["product"]["list"]>>["products"][number];

export interface AdminListParams {
  readonly search?: string;
  readonly limit?: number;
  readonly offset?: number;
}

/** Technicians and clients share one directory; the role narrows it. */
export const useAdminUsers = (
  params: AdminListParams & { readonly role?: "technician" | "client" },
) =>
  useQuery(
    orpcQuery.admin.user.list.queryOptions({
      input: {
        ...(params.role === undefined ? {} : { role: params.role }),
        ...(params.search === undefined || params.search === "" ? {} : { search: params.search }),
        ...(params.limit === undefined ? {} : { limit: params.limit }),
        ...(params.offset === undefined ? {} : { offset: params.offset }),
      },
    }),
  );

const invalidateUsers = async (queryClient: ReturnType<typeof useQueryClient>) => {
  await queryClient.invalidateQueries({ queryKey: orpcQuery.admin.user.list.key() });
};

/** Cache shapes mirror the router outputs, so optimistic patches stay typed. */
interface AdminUserListCache {
  readonly users: AdminUser[];
  readonly total: number;
}

interface AdminOrgListCache {
  readonly organizations: AdminOrg[];
  readonly total: number;
}

interface AdminOrgDetailCache {
  readonly organization: AdminOrgDetail;
}

type AdminCacheSnapshot = readonly (readonly [QueryKey, unknown])[];

/**
 * Counts writes per entity so a stale settle never paints over a newer
 * guess. Writes sharing an entity lane run serially (see the scopes below),
 * so only the newest write may touch the cache on the way out.
 */
const adminWriteEpoch = new Map<string, number>();

const nextAdminEpoch = (key: string): number => {
  const epoch = (adminWriteEpoch.get(key) ?? 0) + 1;
  adminWriteEpoch.set(key, epoch);
  return epoch;
};

const isLatestAdminWrite = (key: string, epoch: number): boolean =>
  adminWriteEpoch.get(key) === epoch;

const snapshotAdminUsers = (queryClient: QueryClient): AdminCacheSnapshot => [
  ...queryClient.getQueriesData({ queryKey: orpcQuery.admin.user.list.key() }),
];

const snapshotAdminOrgs = (queryClient: QueryClient): AdminCacheSnapshot => [
  ...queryClient.getQueriesData({ queryKey: orpcQuery.admin.org.list.key() }),
  ...queryClient.getQueriesData({ queryKey: orpcQuery.admin.org.get.key() }),
];

const restoreAdminSnapshot = (queryClient: QueryClient, snapshot: AdminCacheSnapshot): void => {
  for (const [key, data] of snapshot) {
    queryClient.setQueryData(key, data);
  }
};

/** Applies a field guess to one user in every directory cache. */
const patchAdminUsers = (
  queryClient: QueryClient,
  userId: string,
  patch: Partial<AdminUser>,
): void => {
  queryClient.setQueriesData<AdminUserListCache>(
    { queryKey: orpcQuery.admin.user.list.key() },
    (old) =>
      old === undefined
        ? old
        : {
            ...old,
            users: old.users.map((item) => (item.id === userId ? { ...item, ...patch } : item)),
          },
  );
};

/** Replaces one user with the server truth once the write lands. */
const writeAdminUser = (queryClient: QueryClient, user: AdminUser): void => {
  queryClient.setQueriesData<AdminUserListCache>(
    { queryKey: orpcQuery.admin.user.list.key() },
    (old) =>
      old === undefined
        ? old
        : { ...old, users: old.users.map((item) => (item.id === user.id ? user : item)) },
  );
};

/** Exact cache key for one company, so guesses never leak sideways. */
const orgDetailKeyFor = (organizationId: string): QueryKey =>
  orpcQuery.admin.org.get.queryOptions({ input: { organizationId } }).queryKey;

/** Applies a field guess to one company in every directory and detail cache. */
const patchAdminOrgs = (
  queryClient: QueryClient,
  organizationId: string,
  patch: Partial<AdminOrg>,
): void => {
  queryClient.setQueriesData<AdminOrgListCache>(
    { queryKey: orpcQuery.admin.org.list.key() },
    (old) =>
      old === undefined
        ? old
        : {
            ...old,
            organizations: old.organizations.map((item) =>
              item.id === organizationId ? { ...item, ...patch } : item,
            ),
          },
  );
  queryClient.setQueryData<AdminOrgDetailCache>(orgDetailKeyFor(organizationId), (old) =>
    old === undefined || old.organization.id !== organizationId
      ? old
      : { organization: { ...old.organization, ...patch } },
  );
};

/** Replaces one company with the server truth once the write lands. */
const writeAdminOrg = (queryClient: QueryClient, organization: AdminOrgDetail): void => {
  queryClient.setQueriesData<AdminOrgListCache>(
    { queryKey: orpcQuery.admin.org.list.key() },
    (old) =>
      old === undefined
        ? old
        : {
            ...old,
            organizations: old.organizations.map((item) =>
              // List rows carry no product ids; drop them instead of
              // letting a stale set linger on the row.
              item.id === organization.id ? toAdminOrg(organization) : item,
            ),
          },
  );
  queryClient.setQueryData<AdminOrgDetailCache>(orgDetailKeyFor(organization.id), (old) =>
    old === undefined || old.organization.id !== organization.id ? old : { organization },
  );
};

/** Detail rows carry product ids the directory rows never show. */
const toAdminOrg = (organization: AdminOrgDetail): AdminOrg => {
  const { productIds: _dropped, ...listOrg } = organization;
  return listOrg;
};

/** Creates a technician; the initial password is handed over outside the app. */
export const useCreateTechnician = () => {
  const queryClient = useQueryClient();
  return useMutation(
    orpcQuery.admin.user.createTechnician.mutationOptions({
      onSettled: async () => {
        await invalidateUsers(queryClient);
      },
    }),
  );
};

/** One flow: company row, first client account, and entitlements together. */
export const useCreateClient = () => {
  const queryClient = useQueryClient();
  return useMutation(
    orpcQuery.admin.user.createClient.mutationOptions({
      onSettled: async () => {
        await invalidateUsers(queryClient);
        await queryClient.invalidateQueries({ queryKey: orpcQuery.admin.org.list.key() });
      },
    }),
  );
};

/** Renames an account or moves it between roles and orgs, guessed up front. */
export const useUpdateAdminUser = (userId: string) => {
  const queryClient = useQueryClient();
  return useMutation(
    orpcQuery.admin.user.update.mutationOptions({
      scope: { id: `admin-user:${userId}` },
      onMutate: async (input) => {
        await queryClient.cancelQueries({ queryKey: orpcQuery.admin.user.list.key() });
        const previous = snapshotAdminUsers(queryClient);
        const epoch = nextAdminEpoch(`admin-user:${input.userId}`);
        patchAdminUsers(queryClient, input.userId, {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.role === undefined ? {} : { role: input.role }),
        });
        return { previous, epoch };
      },
      onError: (_error, input, context) => {
        if (
          context !== undefined &&
          isLatestAdminWrite(`admin-user:${input.userId}`, context.epoch)
        ) {
          restoreAdminSnapshot(queryClient, context.previous);
        }
      },
      onSuccess: (result, input, context) => {
        if (
          context === undefined ||
          isLatestAdminWrite(`admin-user:${input.userId}`, context.epoch)
        ) {
          writeAdminUser(queryClient, result.user);
        }
      },
      onSettled: async () => {
        await invalidateUsers(queryClient);
      },
    }),
  );
};

/** Deactivate drops live sessions; reactivate lifts the ban. Guessed up front. */
export const useSetUserActive = (userId: string) => {
  const queryClient = useQueryClient();
  return useMutation(
    orpcQuery.admin.user.setActive.mutationOptions({
      scope: { id: `admin-user:${userId}` },
      onMutate: async (input) => {
        await queryClient.cancelQueries({ queryKey: orpcQuery.admin.user.list.key() });
        const previous = snapshotAdminUsers(queryClient);
        const epoch = nextAdminEpoch(`admin-user:${input.userId}`);
        patchAdminUsers(queryClient, input.userId, { banned: !input.active });
        return { previous, epoch };
      },
      onError: (_error, input, context) => {
        if (
          context !== undefined &&
          isLatestAdminWrite(`admin-user:${input.userId}`, context.epoch)
        ) {
          restoreAdminSnapshot(queryClient, context.previous);
        }
      },
      onSuccess: (result, input, context) => {
        if (
          context === undefined ||
          isLatestAdminWrite(`admin-user:${input.userId}`, context.epoch)
        ) {
          writeAdminUser(queryClient, result.user);
        }
      },
      onSettled: async () => {
        await invalidateUsers(queryClient);
      },
    }),
  );
};

/** Company directory with member and entitlement counts per row. */
export const useAdminOrgs = (params: AdminListParams) =>
  useQuery(
    orpcQuery.admin.org.list.queryOptions({
      input: {
        ...(params.search === undefined || params.search === "" ? {} : { search: params.search }),
        ...(params.limit === undefined ? {} : { limit: params.limit }),
        ...(params.offset === undefined ? {} : { offset: params.offset }),
      },
    }),
  );

/** One company with its entitled product ids, for the entitlement editor. */
export const useAdminOrg = (organizationId: string) =>
  useQuery(
    orpcQuery.admin.org.get.queryOptions({
      input: { organizationId },
    }),
  );

/** Renames a company; the slug stays put. Guessed up front. */
export const useUpdateAdminOrg = (organizationId: string) => {
  const queryClient = useQueryClient();
  return useMutation(
    orpcQuery.admin.org.update.mutationOptions({
      scope: { id: `admin-org:${organizationId}` },
      onMutate: async (input) => {
        await queryClient.cancelQueries({ queryKey: orpcQuery.admin.org.list.key() });
        await queryClient.cancelQueries({ queryKey: orpcQuery.admin.org.get.key() });
        const previous = snapshotAdminOrgs(queryClient);
        const epoch = nextAdminEpoch(`admin-org:${input.organizationId}`);
        patchAdminOrgs(queryClient, input.organizationId, { name: input.name });
        return { previous, epoch };
      },
      onError: (_error, input, context) => {
        if (
          context !== undefined &&
          isLatestAdminWrite(`admin-org:${input.organizationId}`, context.epoch)
        ) {
          restoreAdminSnapshot(queryClient, context.previous);
        }
      },
      onSuccess: (result, input, context) => {
        if (
          context === undefined ||
          isLatestAdminWrite(`admin-org:${input.organizationId}`, context.epoch)
        ) {
          writeAdminOrg(queryClient, result.organization);
        }
      },
      onSettled: async () => {
        await queryClient.invalidateQueries({ queryKey: orpcQuery.admin.org.list.key() });
        await queryClient.invalidateQueries({ queryKey: orpcQuery.admin.org.get.key() });
      },
    }),
  );
};

/** Suspend drops every member session; reactivate restores access. Guessed up front. */
export const useSetOrgActive = (organizationId: string) => {
  const queryClient = useQueryClient();
  return useMutation(
    orpcQuery.admin.org.setActive.mutationOptions({
      scope: { id: `admin-org:${organizationId}` },
      onMutate: async (input) => {
        await queryClient.cancelQueries({ queryKey: orpcQuery.admin.org.list.key() });
        await queryClient.cancelQueries({ queryKey: orpcQuery.admin.org.get.key() });
        const previous = snapshotAdminOrgs(queryClient);
        const epoch = nextAdminEpoch(`admin-org:${input.organizationId}`);
        patchAdminOrgs(queryClient, input.organizationId, { isActive: input.active });
        return { previous, epoch };
      },
      onError: (_error, input, context) => {
        if (
          context !== undefined &&
          isLatestAdminWrite(`admin-org:${input.organizationId}`, context.epoch)
        ) {
          restoreAdminSnapshot(queryClient, context.previous);
        }
      },
      onSuccess: (result, input, context) => {
        if (
          context === undefined ||
          isLatestAdminWrite(`admin-org:${input.organizationId}`, context.epoch)
        ) {
          writeAdminOrg(queryClient, result.organization);
        }
      },
      onSettled: async () => {
        await queryClient.invalidateQueries({ queryKey: orpcQuery.admin.org.list.key() });
        await queryClient.invalidateQueries({ queryKey: orpcQuery.admin.org.get.key() });
      },
    }),
  );
};

/** Replaces the entitlement set wholesale. The checked set shows up at once. */
export const useSetEntitlements = (organizationId: string) => {
  const queryClient = useQueryClient();
  return useMutation(
    orpcQuery.admin.org.setEntitlements.mutationOptions({
      scope: { id: `admin-org:${organizationId}` },
      onMutate: async (input) => {
        await queryClient.cancelQueries({ queryKey: orpcQuery.admin.org.list.key() });
        await queryClient.cancelQueries({ queryKey: orpcQuery.admin.org.get.key() });
        const previous = snapshotAdminOrgs(queryClient);
        const epoch = nextAdminEpoch(`admin-org:${input.organizationId}`);
        patchAdminOrgs(queryClient, input.organizationId, {
          productCount: input.productIds.length,
        });
        queryClient.setQueryData<AdminOrgDetailCache>(
          orgDetailKeyFor(input.organizationId),
          (old) =>
            old === undefined || old.organization.id !== input.organizationId
              ? old
              : {
                  organization: {
                    ...old.organization,
                    productIds: [...input.productIds],
                    productCount: input.productIds.length,
                  },
                },
        );
        return { previous, epoch };
      },
      onError: (_error, input, context) => {
        if (
          context !== undefined &&
          isLatestAdminWrite(`admin-org:${input.organizationId}`, context.epoch)
        ) {
          restoreAdminSnapshot(queryClient, context.previous);
        }
      },
      onSuccess: (result, input, context) => {
        if (
          context === undefined ||
          isLatestAdminWrite(`admin-org:${input.organizationId}`, context.epoch)
        ) {
          writeAdminOrg(queryClient, result.organization);
        }
      },
      onSettled: async () => {
        await queryClient.invalidateQueries({ queryKey: orpcQuery.admin.org.list.key() });
        await queryClient.invalidateQueries({ queryKey: orpcQuery.admin.org.get.key() });
        await queryClient.invalidateQueries({ queryKey: orpcQuery.product.listForOrg.key() });
      },
    }),
  );
};

/** Full catalog with per-product entitlement counts. */
export const useAdminProducts = (params: AdminListParams) =>
  useQuery(
    orpcQuery.admin.product.list.queryOptions({
      input: {
        ...(params.search === undefined || params.search === "" ? {} : { search: params.search }),
        ...(params.limit === undefined ? {} : { limit: params.limit }),
        ...(params.offset === undefined ? {} : { offset: params.offset }),
      },
    }),
  );

/** Adds a product to the catalog. */
export const useCreateAdminProduct = () => {
  const queryClient = useQueryClient();
  return useMutation(
    orpcQuery.admin.product.create.mutationOptions({
      onSettled: async () => {
        await queryClient.invalidateQueries({ queryKey: orpcQuery.admin.product.list.key() });
      },
    }),
  );
};
