# Web

React 19 and Vite. The app talks to the API two ways:

- `src/auth.ts` holds the Better Auth client, pointed at `${VITE_API_URL}/api/auth`.
- `src/orpc.ts` holds a `RouterClient<AppRouter>` over `RPCLink`, pointed at `${VITE_API_URL}/rpc`.

Both send `credentials: "include"`, so the session cookie travels with every
request. `authClient` uses `inferAdditionalFields<Auth>()` so the session type
knows about the `role` and `organizationId` the API adds to the user.

`src/App.tsx` renders by role, with no router library:

- `client` gets the intake form. The product dropdown comes from
  `product.listForOrg`, which is already scoped to that client's org.
- `technician` and `admin` get the ticket queue, with a status dropdown per row.

Copy `.env.example` to `.env.local` and point `VITE_API_URL` at your Worker,
then:

```sh
pnpm dev
```

## Demo accounts

Seeded by `pnpm --filter api db:seed`, both with password `demo-password-123`:

- `client@acme.test` files a ticket.
- `tech@reliable.test` works the queue.

Sign in as the client, file a ticket, then sign in as the technician in a
separate browser profile or private window. The queue is not live-updating, so
press Refresh to pull the new ticket in.
