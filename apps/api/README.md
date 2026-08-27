```txt
npm install
npm run dev
```

```txt
npm run deploy
```

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```txt
npm run cf-typegen
```

Pass the `CloudflareBindings` as generics when instantiating `Hono`:

```ts
// src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>();
```

## Auth configuration

Copy the repository root `.env.example` to `.env.local`, fill in `DATABASE_URL` and a random `BETTER_AUTH_SECRET`, then start the API. Wrangler loads that file for local development.

```text
cp .env.example .env.local
```

Generate and apply the Better Auth tables with `pnpm --filter api db:generate` and `pnpm --filter api db:migrate`.
