# Threat Model

## Project Overview

OrthoVision is a clinical orthodontic treatment planning platform built as a PNPM monorepo. It exposes a React 19 + Vite frontend (`ortho-platform`) backed by a Node.js Express 5 API server (`api-server`) with a PostgreSQL database accessed via Drizzle ORM. Clinicians (doctors) log in via session-based authentication to manage patients, dental scans (3D STL/OBJ files), treatment cases, lab orders, and AI-assisted treatment planning via Groq LLM. Scan and photo files are stored on the local filesystem.

## Assets

- **Patient health records** — names, clinical notes, diagnoses, treatment plans. PHI; regulatory exposure under HIPAA analogues.
- **3D scan files** — STL/OBJ files stored on disk, linked to patients via database path references. Unauthorized access exposes patient biometric data.
- **Session credentials** — `express-session` tokens stored in browser cookies. Compromise allows full account takeover.
- **Doctor accounts** — `doctorId` stored in session; all data is scoped per doctor. IDOR between doctor accounts is catastrophic.
- **Application secrets** — `SESSION_SECRET`, `GROQ_API_KEY`, `DATABASE_URL`. Leakage enables session forgery, LLM abuse, and full DB access.
- **Lab portal data** — file attachments submitted to/from dental labs. Contains patient-linked clinical artifacts.
- **Audit logs** — in-memory buffer of mutating operations. Loss means no repudiation trail.

## Trust Boundaries

- **Browser → API (`/api/*`)**: All client requests cross this boundary. The browser is fully untrusted; every endpoint must authenticate and authorize server-side.
- **API → PostgreSQL**: Drizzle ORM with parameterized queries. Direct string-concatenated SQL at this boundary is catastrophic.
- **API → Local Filesystem**: Scan, photo, and lab file paths are stored in the database and re-used to serve/delete files. A user-controlled path reaching `fs` or `res.sendFile` enables path traversal.
- **API → Groq LLM** (`https://api.groq.com`): Outbound call with `GROQ_API_KEY`. SSRF or key leakage allows LLM abuse at the application's cost.
- **Authenticated / Unauthenticated**: The `requireAuth` middleware gates most routes. Public routes must be minimal and explicitly enumerated.
- **Doctor / Doctor (multi-tenant)**: All data must be scoped to the authenticated `doctorId`. Cross-doctor IDOR is the highest-risk lateral movement vector.

## Scan Anchors

- **Production entry points**: `artifacts/api-server/src/app.ts` (Express app), `artifacts/api-server/src/routes/index.ts` (all route mounts)
- **Highest-risk code areas**:
  - `artifacts/api-server/src/routes/scans.ts` — file upload + download; path traversal surface
  - `artifacts/api-server/src/routes/photos.ts` — file serve + delete; path traversal surface
  - `artifacts/api-server/src/routes/labs.ts` — file upload + download + delete; path traversal surface
  - `artifacts/api-server/src/routes/ai-copilot.ts` — Groq SSE streaming; prompt injection surface
  - `artifacts/api-server/src/middlewares/auth.ts` — `requireAuth` guard; bypass = full breach
- **Public vs authenticated**: `/api/auth/*` is public; all other `/api/*` must require `requireAuth`. `/api/healthz` is public.
- **Dev-only**: `artifacts/mockup-sandbox/` — dev UI prototyping only, never production-reachable

## Threat Categories

### Spoofing

Doctors authenticate via email/password; the session is stored server-side with `express-session`. The `SESSION_SECRET` must be a strong random value from environment variables — a hardcoded or weak secret allows session token forgery. Each request to a protected route checks `req.session.doctorId`; a missing or bypassable check lets any unauthenticated caller act as any doctor.

**Guarantees required:**
- `SESSION_SECRET` MUST be set via environment variable and MUST NOT appear in source code.
- Every non-public API route MUST apply `requireAuth` middleware before processing the request.
- Session cookies MUST be `httpOnly`, `secure` (in production), and use `sameSite: 'strict'`.

### Tampering

Patient and case data is modified via PUT/PATCH endpoints. The application must ensure only the owning doctor can modify their own records. File paths stored in the database must never be user-supplied on write — they are assigned by the server at upload time. If the client can supply or alter stored file paths, subsequent `fs.existsSync`/`res.sendFile` calls become a path traversal vector.

**Guarantees required:**
- All write operations MUST verify that the target resource belongs to the authenticated `doctorId` before applying changes.
- File paths stored in the database MUST be set exclusively by server-side upload logic (Multer destination). Client-supplied paths MUST be rejected.
- Input to all endpoints MUST be validated against Zod schemas before reaching the database or filesystem.

### Repudiation

The audit middleware logs mutating operations to an in-memory buffer. If the server restarts, audit history is lost. There is currently no durable audit trail.

**Guarantees required:**
- Audit events for sensitive operations (patient creation/deletion, case modification, file upload/delete, auth events) MUST be persisted to the database, not only held in memory.
- Each audit entry MUST capture: `doctorId`, `action`, `resourceType`, `resourceId`, `timestamp`, `ip`.

### Information Disclosure

**Path traversal (ACTIVE — detected by SAST):** `labs.ts`, `photos.ts`, and `scans.ts` pass database-retrieved file paths directly to `fs.existsSync`, `fs.unlinkSync`, and `res.sendFile`. If a stored path was ever corrupted or injected, an attacker could read arbitrary files. Additionally, error responses from Express must not expose stack traces or raw Drizzle error messages in production.

**Cross-doctor data leakage:** Queries that fetch by resource ID without also filtering by `doctorId` expose other doctors' patient data.

**LLM key leakage:** `GROQ_API_KEY` must never appear in client-side bundles, API responses, or logs.

**Guarantees required:**
- File paths returned from the database MUST be validated against an allowed base directory (e.g., `path.resolve(UPLOAD_DIR)`) before use in any `fs` or `res.sendFile` call.
- All database queries for patient/case/scan/photo data MUST include a `doctorId` equality filter.
- Production error responses MUST return generic messages; stack traces MUST be suppressed (check `NODE_ENV`).
- `GROQ_API_KEY` and `DATABASE_URL` MUST NOT appear in any log output or API response body.

### Denial of Service

File uploads via Multer (scans, photos, labs) must have explicit size limits. The Groq SSE streaming endpoint (`/api/ai-copilot`) is resource-intensive and unauthenticated callers must not be able to trigger it. No rate limiting is currently visible on auth endpoints, enabling credential-stuffing.

**Guarantees required:**
- Multer MUST set `limits.fileSize` on all upload routes.
- `/api/ai-copilot` MUST be behind `requireAuth`.
- `/api/auth/login` MUST have rate limiting (e.g., `express-rate-limit`) to prevent brute-force.
- External service calls (Groq) MUST have a request timeout to prevent hanging connections.

### Elevation of Privilege

The application uses a single `doctor` role with no admin distinction visible in the schema. If admin routes are added in the future, they must not rely solely on frontend guards. SQL injection via Drizzle is low-risk given parameterized queries, but any raw SQL usage (e.g., `db.execute(sql\`...\``) with user input must be audited. Path traversal in file-serving routes (see Information Disclosure) is the most immediate elevation risk: an authenticated doctor could potentially read files belonging to other doctors or the server.

**Guarantees required:**
- Cross-resource access MUST be prevented by always joining resource ownership back to `doctorId` in queries.
- Any raw SQL fragments using user input MUST use Drizzle's `sql` tagged template (which parameterizes automatically) — never string concatenation.
- Uploaded file paths MUST be canonicalized and checked against the upload root before serving or deletion.

### Dependency Vulnerabilities

**Active finding (moderate):** `qs@6.15.1` (CVE-2026-8723) — `qs.stringify` throws `TypeError` on null/undefined in comma+encodeValuesOnly arrays. DoS if reachable from a request handler outside an error boundary. Fix: upgrade to `qs@6.15.2`.

**Guarantees required:**
- `qs` MUST be upgraded to `>=6.15.2`.
- Dependency audits MUST be run on every dependency update PR.
