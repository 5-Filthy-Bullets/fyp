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

Install dependencies and start the Worker:

```sh
pnpm install
pnpm dev
```

Create the Better Auth tables in PostgreSQL during development:

```sh
pnpm db:push
```

For a committed migration, use `pnpm db:generate`, then apply it with `pnpm db:migrate`.
