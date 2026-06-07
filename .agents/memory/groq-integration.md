---
name: Groq Integration Pattern
description: How Groq API is used in this project for AI chat — OpenAI-compatible REST with SSE streaming via native fetch.
---

# Groq Integration

**Why:** Replit AI Integrations (OpenAI) required account upgrade; user provided their own GROQ_API_KEY secret instead.

**How to apply:** Use native `fetch` against `https://api.groq.com/openai/v1/chat/completions` with `Authorization: Bearer ${process.env.GROQ_API_KEY}`. Groq is OpenAI-compatible — same request/response shape.

**Model used:** `llama-3.3-70b-versatile` — good balance of speed and capability for clinical reasoning tasks.

**SSE streaming:** Parse `data: {...}` lines from the ReadableStream reader. Skip `[DONE]` lines. The route is at `artifacts/api-server/src/routes/ai-copilot.ts`.

**Safety constraint (hardcoded):** All AI treatment recommendations are advisory only. The system prompt enforces this on every call — never remove it.
