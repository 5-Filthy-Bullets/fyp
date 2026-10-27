# API

The Worker exposes Better Auth at `/api/auth/*` and the protected oRPC router at `/rpc/*`.

Set these variables before starting Wrangler:

```sh
DATABASE_URL=postgresql://...
BETTER_AUTH_SECRET=use-a-long-random-secret
BETTER_AUTH_URL=http://localhost:8787
WEB_URL=http://localhost:5173
```

Use a local `.dev.vars` file for development. Set the same values as Wrangler secrets or variables when deploying.

Ticket notifications go through the SendGrid v3 API (plain HTTPS, since
Workers cannot open SMTP connections). No owned domain is needed: verify one
Gmail address under SendGrid's Single Sender Verification, then set it as the
sender. Without both values the app runs fine and skips mail delivery, which
is what local dev and tests do.

```sh
SENDGRID_API_KEY=SG.your-key-here # wrangler secret in production
EMAIL_FROM=youremail@gmail.com
```

A daily cron (`triggers.crons` in `wrangler.jsonc`, `0 9 * * *`) runs the
`scheduled` handler in `src/index.ts`: unassigned open tickets older than a
day and quiet in-progress tickets older than three days get one reminder per
24-hour cooldown window, stamped on `ticket.last_reminder_at`.

Install dependencies and start the Worker:

```sh
pnpm install
pnpm dev
```

Create the Better Auth and ticket tables in PostgreSQL during development:

```sh
pnpm db:push
```

For a committed migration, use `pnpm db:generate`, then apply it with `pnpm db:migrate`.

## Seed data

`pnpm db:seed` creates one client org, two products linked to it, and three users:

| Email                 | Role         | Organization        |
| --------------------- | ------------ | ------------------- |
| `admin@reliable.test` | `admin`      | none (vendor staff) |
| `client@acme.test`    | `client`     | Acme Manufacturing  |
| `tech@reliable.test`  | `technician` | none (vendor staff) |

A newly created account gets the password `demo-password-123`. The script signs
users up through Better Auth, then writes the role and organization that Better
Auth treats as server-owned. It is idempotent, so re-running it tops up rather
than duplicating, and it never resets the password of an account that already
exists.

## Endpoints

Swagger UI is at `/docs`, the raw spec at `/docs/spec.json`. Every procedure
carries `.route()` metadata. Roles come from the session user; the organization
is read from the session, never from request input.

| Method | Path                         | Who               | Does                                           |
| ------ | ---------------------------- | ----------------- | ---------------------------------------------- |
| GET    | `/me`                        | any signed in     | Caller id, role, organization                  |
| GET    | `/products`                  | client            | Products linked to the caller's org            |
| POST   | `/tickets`                   | client            | Files a ticket scoped to the caller's org      |
| GET    | `/tickets`                   | technician, admin | Staff queue, optional `?organizationId=`       |
| PATCH  | `/tickets/{ticketId}/status` | technician, admin | Changes status and records the caller as owner |
| GET    | `/hello`                     | any signed in     | Demo greeting                                  |

Each is reachable over both `/rpc/*` (typed client) and the REST path above.
