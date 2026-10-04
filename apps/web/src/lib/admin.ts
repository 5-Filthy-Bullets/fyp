import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

/** Renames an account or moves it between roles and orgs. */
export const useUpdateAdminUser = () => {
  const queryClient = useQueryClient();
  return useMutation(
    orpcQuery.admin.user.update.mutationOptions({
      onSettled: async () => {
        await invalidateUsers(queryClient);
      },
    }),
  );
};

/** Deactivate drops live sessions; reactivate lifts the ban. */
export const useSetUserActive = () => {
  const queryClient = useQueryClient();
  return useMutation(
    orpcQuery.admin.user.setActive.mutationOptions({
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

/** Renames a company; the slug stays put. */
export const useUpdateAdminOrg = () => {
  const queryClient = useQueryClient();
  return useMutation(
    orpcQuery.admin.org.update.mutationOptions({
      onSettled: async () => {
        await queryClient.invalidateQueries({ queryKey: orpcQuery.admin.org.list.key() });
        await queryClient.invalidateQueries({ queryKey: orpcQuery.admin.org.get.key() });
      },
    }),
  );
};

/** Suspend drops every member session; reactivate restores access. */
export const useSetOrgActive = () => {
  const queryClient = useQueryClient();
  return useMutation(
    orpcQuery.admin.org.setActive.mutationOptions({
      onSettled: async () => {
        await queryClient.invalidateQueries({ queryKey: orpcQuery.admin.org.list.key() });
        await queryClient.invalidateQueries({ queryKey: orpcQuery.admin.org.get.key() });
      },
    }),
  );
};

/** Replaces the entitlement set wholesale. */
export const useSetEntitlements = () => {
  const queryClient = useQueryClient();
  return useMutation(
    orpcQuery.admin.org.setEntitlements.mutationOptions({
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
