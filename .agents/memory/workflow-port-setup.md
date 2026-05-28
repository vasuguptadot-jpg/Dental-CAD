---
name: Workflow PORT setup
description: How to correctly pass PORT env var to api-server and ortho-app workflows in this monorepo
---

## Rule
Both the API server and frontend require PORT to be set explicitly — it is not injected automatically.

- **Artifact-managed workflows** (ortho-app, api-server): set PORT in `[services.env]` in the artifact's `artifact.toml`. The ortho-app already has `PORT = "25808"` and `BASE_PATH = "/"` there. The api-server needed `PORT = "8080"` added.
- **Manually created workflows** (via configureWorkflow): prefix the command with `PORT=8080`, e.g. `PORT=8080 pnpm --filter @workspace/api-server run dev`.

**Why:** The vite.config.ts and api-server index.ts both throw if PORT is not set — they do not fall back silently. The artifact TOML `[services.env]` block injects env vars into the artifact workflow's process.

**How to apply:** After any fresh install (pnpm install), restart artifact workflows. If a workflow fails with "PORT environment variable is required", check that [services.env] or the command prefix includes PORT.

## First-run setup sequence
1. `pnpm install` (installs all workspace deps)
2. `pnpm --filter @workspace/db run push` (applies DB schema)
3. `mkdir -p artifacts/api-server/uploads/scans` (required for scan file storage)
4. Restart workflows: `artifacts/ortho-app: web` (port 25808) and `API Server` (port 8080)
