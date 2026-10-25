# Web

React 19 and Vite. The app talks to the API two ways:

- `src/auth.ts` holds the Better Auth client, pointed at `${VITE_API_URL}/api/auth`.
- `src/orpc.ts` holds a `RouterClient<AppRouter>` over `RPCLink`, pointed at `${VITE_API_URL}/rpc`.

Both send `credentials: "include"`, so the session cookie travels with every
request. `authClient` uses `inferAdditionalFields<Auth>()` so the session type
knows about the `role` and `organizationId` the API adds to the user.

`src/App.tsx` defines a TanStack Router tree. The home route renders a dashboard
by role:

- `client` sees its own tickets and the intake form. The product dropdown comes
  from `product.listForOrg`, which is already scoped to that client's org.
- `technician` sees the shared queue and the tickets assigned to them.
- `admin` sees ticket stats, all tickets, and the client, technician, and
  product admin pages.

Copy `.env.example` to `.env.local` and point `VITE_API_URL` at your Worker,
then:

```sh
pnpm dev
```

## Demo accounts

Seeded by `pnpm --filter api db:seed`. A new account gets the password
`demo-password-123`; an existing account keeps its own password.

- `admin@reliable.test` manages companies, products, and staff accounts.
- `client@acme.test` files a ticket.
- `tech@reliable.test` works the queue.

Sign in as the client and file a ticket, then sign in as the technician or admin
in a separate browser profile or private window. Tickets poll every 5 seconds,
so the new ticket appears without a refresh.
