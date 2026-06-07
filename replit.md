# OrthoVision Platform

A production-ready orthodontic treatment planning platform for dental clinics. Doctors manage patients, track cases through treatment stages, view 3D dental scans, and monitor clinic performance.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/ortho-platform run dev` — run the frontend (port varies)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `SESSION_SECRET` — session signing secret

## Default login credentials

- Email: `doctor@orthovision.com`
- Password: `doctor123`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS + shadcn/ui + Three.js
- API: Express 5 with express-session
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- Auth: Session-based (bcryptjs for password hashing)
- File upload: Multer (local disk at `artifacts/api-server/uploads/`)
- 3D Viewer: Three.js + three-stdlib (STL, OBJ, PLY)
- Charts: Recharts
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contracts)
- `lib/db/src/schema/` — Drizzle table definitions (doctors, patients, cases, scans, activity)
- `artifacts/api-server/src/routes/` — Express route handlers (auth, patients, cases, scans, dashboard)
- `artifacts/api-server/uploads/` — Uploaded 3D scan files
- `artifacts/ortho-platform/src/` — React frontend
- `lib/api-client-react/src/generated/` — Generated React Query hooks (do not edit)
- `lib/api-zod/src/generated/` — Generated Zod schemas (do not edit)

## Architecture decisions

- Contract-first OpenAPI → codegen generates typed hooks and Zod schemas
- Session-based auth (server-side sessions with express-session + cookie); no JWT
- Scan files stored on local disk; path saved in DB; served via `/api/scans/:id/file`
- Activity log table (denormalized names/codes) for fast dashboard feed without joins
- Three.js viewer loads scan binary from API, uses STL/OBJ/PLY loaders from three-stdlib

## Product

- Doctor authentication with role system
- Patient management: create, edit, delete, search with pagination
- Case management: create cases linked to patients, track status through 6 stages
- 3D scan upload (STL/OBJ/PLY), storage, and interactive viewer with OrbitControls
- Dashboard: live stats, case status chart, recent activity feed
- Dark mode with localStorage sync

## Gotchas

- Always run `pnpm run typecheck:libs` after changing any `lib/*` package before checking artifact packages
- After changing `openapi.yaml`, re-run `pnpm --filter @workspace/api-spec run codegen`
- After adding/changing DB schema, run `pnpm --filter @workspace/db run push`
- Scan file serving route is `/api/scans/:scanId/file` — not generated from OpenAPI (multipart)
- Frontend scan upload uses raw XHR/fetch (not generated hook) because it's multipart form-data

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
