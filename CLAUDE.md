# CLAUDE.md

## Commands

- `npx netlify dev` — run the full app locally.
- `npm run db:generate` — generate a Drizzle migration in `migrations/` from changes to `db/schema.ts`.
- `npm run db:migrate` — apply pending migrations against the database in `DATABASE_URL` (runs under `netlify dev:exec` so `.env` is loaded).

Just worry about code changes. The dev will compile, build, lint, and run.

## Architecture

This is a Netlify-hosted SPA with a serverless API. There is no separate Node server — the frontend talks to functions under `/.netlify/functions/*`.

### Frontend (`src/`)

- React 19 + React Router + MUI. Single `App.tsx` declares the theme and routes. All non-login routes are wrapped in `ProtectedRoute`, which reads from `AuthContext`.
- `api.ts` is the single client-side wrapper around every function endpoint, as well as shared interfaces `Passage`, `Section`, `Project`, etc. Reuse these data structures when possible.
- [src/PassageContext.tsx](src/PassageContext.tsx) is the passage context shared by every step page. Including this queries the database and has a performance cost, but if one component onscreen is using it, it is safe and recommended to reuse the data on it.
- `StepNavState` is the context state passed between pages, without polling the database. Its properties must be kept updated (e.g. when changing passages) with current information to avoid bugs.

### Backend (`netlify/functions/`)

Each file is one Netlify Function. They share helpers from [_auth.ts](netlify/functions/_auth.ts).

### Database (`db/`, `migrations/`)

- Neon serverless Postgres. [db/schema.ts](db/schema.ts) is the single source of truth for the schema; `drizzle.config.ts` reads it directly for migration generation. At runtime, every function talks to Postgres via raw tagged-template SQL from `getDb()` in [netlify/functions/db.ts](netlify/functions/db.ts) — the Drizzle query builder is not used.
- Domain hierarchy: `teams` → `projects` → `sections` → `passages` → `passage_versions` & `replacements`, where most but not all `replacements` are associated with a passage version.

### Migrations

Drizzle-kit only. Edit `db/schema.ts`, run `npm run db:generate`, then `npm run db:migrate`. Do not hand-edit migration files.
