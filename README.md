# Ticket System

A support desk for a B2B hardware vendor. Client companies file tickets against the products they bought, technicians work a shared queue, and admins manage companies, product access, and staff accounts. This is a final year project, built as a pnpm workspace with a Cloudflare Worker API and a React web app.

## What it does

Accounts have one of three roles, and the role decides what the API returns and which screens the web app shows.

| Role | Scope | Main work |
| --- | --- | --- |
| `client` | Own organization only | File tickets, follow replies, attach photos or video |
| `technician` | Every client organization | Claim tickets, set status and priority, assign, escalate, reply |
| `admin` | Every client organization plus admin screens | Manage all tickets, companies, entitlements, technicians, and client accounts |

Clients get a dashboard with ticket counts, a searchable and filterable list, an intake form limited to products their company is entitled to, and a ticket page with a message thread. A reply can carry images (4 files, 8 MB each) or one video up to 64 MB, hosted on UploadThing.

Technicians get a queue, a "my work" view, and per-ticket actions: status, priority, assignee, escalation, public reply, or an internal note that clients never see. Their dashboard shows queue counts and the tickets they own. Admins get the full ticket list, an escalated-only view, and a dashboard with status counts, recent activity, and escalated tickets.

Lists poll: tickets every 5 seconds, message threads every 3 seconds. There are no websockets.

Deactivating an account deletes its live sessions. Suspending a company deletes the sessions of every member. A sign-in hook and a per-request check in the API keep both out until an admin reverses the change.

## Stack

| Part | Choice |
| --- | --- |
| API | Hono and oRPC on Cloudflare Workers, with zod schemas |
| Database | PostgreSQL on Neon, Drizzle ORM over the neon-http driver |
| Auth | Better Auth with email and password, database sessions |
| Uploads | UploadThing |
| Web | React 19, Vite, TanStack Router, TanStack Query, TanStack Table |
| Styling | Tailwind CSS v4, Base UI, coss ui patterns, IBM Plex |
| State | Zustand for shell and theme state |
| Tooling | pnpm workspace, oxlint, oxfmt, Vitest |

## Layout

```
apps/
  api/                 Cloudflare Worker
    src/index.ts       Hono routes, RPC and OpenAPI handlers, CORS
    src/router.ts      oRPC router: session, products, tickets, admin
    src/access.ts      Role and organization guards
    src/auth.ts        Better Auth setup and session hooks
    src/db/schema.ts   Drizzle tables and enums
    src/uploadthing.ts Photo and video upload route
    drizzle/           Generated SQL migrations
    scripts/seed.ts    Demo company, products, and users
  web/                 React app
    src/App.tsx        TanStack Router tree
    src/routes/        Login, dashboard, tickets, admin pages
    src/lib/           oRPC query hooks and session helpers
    src/components/    Shell, dashboards, tables, UI primitives
```

The API exports `AppRouter`, and the web app imports that type directly. A broken contract fails the web type check instead of showing up at runtime.

## Getting started

You need Node 22 or newer, pnpm 11, a PostgreSQL database (Neon is what the code targets), and an UploadThing project token.

1. Install dependencies.

   ```sh
   pnpm install
   ```

2. Create the local env files.

   ```sh
   cp apps/api/.env.example apps/api/.dev.vars
   cp apps/web/.env.example apps/web/.env.local
   ```

   Fill in `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `UPLOADTHING_TOKEN` in `apps/api/.dev.vars`. The defaults for the auth URLs and `VITE_API_URL` already point at localhost.

3. Create the tables.

   ```sh
   pnpm --filter api db:push
   ```

   For a reviewed migration, use `pnpm --filter api db:generate`, then `pnpm --filter api db:migrate`.

4. Seed the demo data.

   ```sh
   pnpm --filter api db:seed
   ```

5. Start the API and web app together.

   ```sh
   pnpm dev
   ```

   The web app runs at http://localhost:5173, the Worker at http://localhost:8787, and Swagger UI at http://localhost:8787/docs.

### Environment variables

API (`apps/api/.dev.vars` locally, Worker secrets in production):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Signs session tokens, use a long random string |
| `BETTER_AUTH_URL` | Public API origin. An `https` value also switches the session cookie to `SameSite=None; Secure; Partitioned`, which the deployed split-domain setup needs |
| `WEB_URL` | Web origin allowed by CORS and Better Auth's `trustedOrigins` |
| `UPLOADTHING_TOKEN` | UploadThing application token |
| `ENVIRONMENT` | Set to `development` locally so uploads use the UploadThing dev ingest |
| `BETTER_AUTH_LOG_LVL` | Optional log level, defaults to `error` |

Web (`apps/web/.env.local`):

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | Worker origin. The auth client and oRPC client both build on it |

### Demo accounts

`pnpm --filter api db:seed` creates these accounts. A new account gets the password `demo-password-123`, and re-running the seed does not reset a password that already exists:

| Email | Role | Company |
| --- | --- | --- |
| `admin@reliable.test` | `admin` | none |
| `client@acme.test` | `client` | Acme Manufacturing |
| `tech@reliable.test` | `technician` | none |

## API

Every procedure declares a method, path, and summary, and validates its input and output with zod. One router therefore serves two interfaces: typed calls at `/rpc/*` for the web app, and REST routes with an OpenAPI spec for anything else.

- RPC: `/rpc/*`
- Auth: `/api/auth/*`, handled by Better Auth
- Uploads: `/api/uploadthing/*`
- Swagger UI: `/docs`
- Raw spec: `/docs/spec.json`

The main resources:

| Resource | Paths |
| --- | --- |
| Session | `GET /me`, `GET /hello` |
| Products | `GET /products` (client, scoped to its org) |
| Tickets | `POST /tickets`, `GET /tickets/mine`, `GET /tickets`, `GET /tickets/{ticketId}` |
| Ticket work | `PATCH /tickets/{ticketId}/status`, `PATCH /tickets/{ticketId}/assignee`, `PATCH /tickets/{ticketId}/escalation`, `GET /tickets/technicians` |
| Messages | `GET /tickets/{ticketId}/messages`, `POST /tickets/{ticketId}/messages` |
| Admin users | `GET /admin/users`, `POST /admin/technicians`, `POST /admin/clients`, `PATCH /admin/users/{userId}`, `PATCH /admin/users/{userId}/active` |
| Admin companies | `GET /admin/organizations`, `GET /admin/organizations/{organizationId}`, `PATCH /admin/organizations/{organizationId}`, `PATCH /admin/organizations/{organizationId}/active`, `PUT /admin/organizations/{organizationId}/products` |
| Admin products | `GET /admin/products`, `POST /admin/products` |

Some rules worth knowing before you change the router:

- The caller's role and organization come from the session. Request input never sets either one.
- A client asking for another organization's ticket gets `NOT_FOUND`, not `FORBIDDEN`, so the response does not confirm that the ticket exists.
- Internal notes are filtered in SQL for clients, not hidden in the UI.
- Moving a ticket's status claims it only when it has no owner. Assignment is a separate call that also clears an escalation.
- Admin procedures cannot touch admin accounts, so an admin cannot demote or deactivate another admin from the app.

## Scripts

From the repo root:

| Command | Does |
| --- | --- |
| `pnpm dev` | Runs the API and web dev servers together |
| `pnpm fmt` | Formats with oxfmt |
| `pnpm fmt:check` | Checks formatting without writing |
| `pnpm lint` | Lints with oxlint |
| `pnpm lint:fix` | Applies lint fixes |

API, with `pnpm --filter api <script>`:

| Script | Does |
| --- | --- |
| `dev` | Starts Wrangler on port 8787 |
| `deploy` | Deploys the Worker |
| `test` | Runs Vitest |
| `db:generate` | Generates a migration from schema changes |
| `db:migrate` | Applies pending migrations |
| `db:push` | Pushes the schema directly, for local work |
| `db:seed` | Creates the demo org, products, and users |
| `cf-typegen` | Regenerates Worker binding types |

Web, with `pnpm --filter web <script>`:

| Script | Does |
| --- | --- |
| `dev` | Starts Vite |
| `build` | Type checks and builds to `dist` |
| `preview` | Serves the built app |

## Tests

```sh
pnpm --filter api test
```

Vitest covers the router with a fake Drizzle client and checks that the OpenAPI spec still describes every procedure. The web app has no tests yet.

## Deploying

The API deploys to Cloudflare Workers and the web app to Cloudflare Pages. `apps/api/wrangler.jsonc` holds the Worker name and non-secret variables, including the production `BETTER_AUTH_URL` and `WEB_URL`. Update those if your domains differ.

Set the secrets once:

```sh
cd apps/api
pnpm wrangler secret put DATABASE_URL
pnpm wrangler secret put BETTER_AUTH_SECRET
pnpm wrangler secret put UPLOADTHING_TOKEN
```

Apply migrations to the production database before deploying a schema change, then deploy. Pass the production `DATABASE_URL` explicitly, since `apps/api/.dev.vars` points at your local database:

```sh
DATABASE_URL=postgresql://... pnpm --filter api db:migrate
pnpm --filter api deploy
```

Build the web app with its production API URL and upload `apps/web/dist` to Pages:

```sh
VITE_API_URL=https://your-worker.workers.dev pnpm --filter web build
```

When it runs over HTTPS on two domains, the session cookie needs `SameSite=None`, `Secure`, and `Partitioned`. `src/auth.ts` sets that automatically whenever `BETTER_AUTH_URL` starts with `https://`.

## Not built yet

Password reset and email verification have no delivery set up. Admins create technician and client accounts with an initial password handed over outside the app, so there is no invite email. Status transitions have no rules, so any status can move to any other. There is no audit log beyond the ticket message thread.

## License

ISC, as declared in `package.json`.
