import { RouterProvider, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { AdminClientsPage } from "./routes/admin-clients";
import { AdminProductsPage } from "./routes/admin-products";
import { AdminTechniciansPage } from "./routes/admin-technicians";
import { HomePage } from "./routes/home";
import { LoginPage } from "./routes/login";
import { TicketDetailPage } from "./routes/ticket-detail";
import { NewTicketPage } from "./routes/tickets-new";
import { TicketsPage } from "./routes/tickets";
import type { TicketListSearch } from "@/lib/tickets";

const rootRoute = createRootRoute();

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});

const ticketsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tickets",
  component: TicketsPage,
  validateSearch: (search: Record<string, unknown>): TicketListSearch => ({
    q: typeof search.q === "string" ? search.q : undefined,
    status: typeof search.status === "string" ? search.status : undefined,
    escalated: typeof search.escalated === "string" ? search.escalated : undefined,
  }),
});

const newTicketRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tickets/new",
  component: NewTicketPage,
});

const ticketDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tickets/$ticketId",
  component: TicketDetailPage,
});

const adminClientsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/clients",
  component: AdminClientsPage,
});

const adminTechniciansRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/technicians",
  component: AdminTechniciansPage,
});

const adminProductsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/products",
  component: AdminProductsPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  ticketsRoute,
  newTicketRoute,
  ticketDetailRoute,
  adminClientsRoute,
  adminTechniciansRoute,
  adminProductsRoute,
]);

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function App() {
  return <RouterProvider router={router} />;
}
