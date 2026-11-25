# JobGiga v3

Fresh project with the same stack and folder layout as v1 (`jobgiga-app-develop`).
Bun + Turborepo monorepo: React web app, Hono API server on Cloudflare Workers,
oRPC, Better-Auth and Drizzle with D1.

## Run

```bash
bun install          # once
bun run dev:web      # web app   → http://localhost:4400
bun run dev:server   # API server → http://localhost:4401
bun run dev          # both
```

## Layout

```
apps/
  web/      React + Vite + TanStack Router (pages in src/routes/)
  server/   Hono on Cloudflare Workers; oRPC at /rpc
packages/
  api/      oRPC procedures (src/routers/), shared by server and web
  auth/     Better-Auth setup (not configured yet)
  db/       Drizzle schema (src/schema/) and D1 connection; no tables yet
  config/   shared TypeScript settings
docs/  scripts/
```

## Pages

| Route | Page |
|---|---|
| `/` | Redirects to `/employer` |
| `/employer` | Employer landing page (redesign's look) |
| `/jobseeker` | Jobseeker landing page (redesign's look) |
| `/employer/about` | About JobGiga for employers |
| `/jobseeker/about` | About JobGiga for jobseekers |

The landing pages show sample data (`apps/web/src/data/landing/`) until the
API exists; actions that need the backend show a "Coming soon" message.
Search the code for `TODO(api)`, `TODO(auth)` and `TODO(route)` to find
every spot to wire up.

## Translations

All text goes through `t()` (react-i18next), like v1. English and Malay live
in `apps/web/public/locales/{en,ms}/common.json` — add every new key to both.

## Other commands

| Command | What it does |
|---|---|
| `bun run build` | Production build |
| `bun run check-types` | Type-check every package |
| `bun run db:generate` | Create a migration from the schema |
| `bun run db:push` | Apply the schema to the D1 database |
