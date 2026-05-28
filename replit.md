# OrthoDesk

A production-ready orthodontic treatment planning platform for managing patients, cases, and tracking treatment progress.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/ortho-app run dev` — run the frontend (port 25808)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `SESSION_SECRET` — secret key for session cookies

## Default Credentials

- Email: `doctor@ortho.com`
- Password: `doctor123`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS + shadcn/ui
- API: Express 5 + session auth (bcryptjs + express-session + connect-pg-simple)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI source of truth
- `lib/db/src/schema/` — DB schema (doctors, patients, cases, activity)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/lib/auth.ts` — password hashing + code generation
- `artifacts/api-server/src/middlewares/requireAuth.ts` — session auth middleware
- `artifacts/ortho-app/src/` — React frontend
- `artifacts/ortho-app/src/contexts/auth.tsx` — auth context + useGetMe
- `artifacts/ortho-app/src/pages/` — all page components

## Architecture decisions

- Session-based auth using PostgreSQL session store (connect-pg-simple) — no JWT tokens
- All API routes protected with `requireAuth` middleware except `/auth/login` and `/auth/me`
- Patient codes auto-generated as `PT{YY}{5-digit-random}`, case codes as `OC{YY}{5-digit-random}`
- Activity log table for dashboard feed — written on patient/case create and status changes
- Cases are cascade-deleted when their parent patient is deleted

## Product

- Doctor authentication with secure session management
- Patient management: create, search, view, edit, delete with full profile fields
- Case management: create orthodontic cases linked to patients, track through 6 treatment stages
- Dashboard: stats overview, case status distribution chart, and recent activity feed
- Case status progression: New → Scan Uploaded → Analysis Completed → Treatment Planning → Approved → Manufacturing

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Run codegen after every OpenAPI spec change: `pnpm --filter @workspace/api-spec run codegen`
- The `SESSION_SECRET` env var must be set — the server will throw on startup without it
- `pnpm --filter @workspace/db run push` must be re-run after schema changes

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
