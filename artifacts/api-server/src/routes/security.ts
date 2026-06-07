import { Router } from "express";
import type { Request, Response } from "express";
import { readFileSync } from "fs";
import { resolve } from "path";
import { randomUUID } from "crypto";

const router = Router();

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const THREAT_MODEL_PATH = resolve(process.cwd(), "../../threat_model.md");

const SCAN_REPORT = {
  scannedAt: "2026-06-07T15:54:38.168Z",
  totalFindings: 24,
  bySeverity: { critical: 0, high: 0, medium: 23, low: 1, info: 0 },
  depSummary: { critical: 0, high: 0, moderate: 1, low: 0, info: 0 },
  findings: [
    {
      id: "sast-001",
      source: "sast" as const,
      severity: "MEDIUM" as const,
      title: "Path Traversal via fs.unlinkSync",
      file: "artifacts/api-server/src/routes/labs.ts",
      line: 277,
      message: "User-controlled file path passed to fs.unlinkSync. An attacker may traverse the directory with '../' sequences.",
      category: "Path Traversal",
      cveId: null,
      packageName: null,
      fixVersion: null,
      codeSnippet: "fs.unlinkSync(req.file.path);",
    },
    {
      id: "sast-002",
      source: "sast" as const,
      severity: "MEDIUM" as const,
      title: "Path Traversal via fs.existsSync",
      file: "artifacts/api-server/src/routes/labs.ts",
      line: 308,
      message: "Database-retrieved file path used in fs.existsSync without canonicalization. Path could escape the upload directory.",
      category: "Path Traversal",
      cveId: null,
      packageName: null,
      fixVersion: null,
      codeSnippet: "if (!fs.existsSync(file.filePath)) { ... }",
    },
    {
      id: "sast-003",
      source: "sast" as const,
      severity: "MEDIUM" as const,
      title: "Unsafe res.sendFile — Path Traversal",
      file: "artifacts/api-server/src/routes/labs.ts",
      line: 311,
      message: "res.sendFile uses a DB-sourced path without input validation or canonicalization, allowing arbitrary file reads.",
      category: "Path Traversal",
      cveId: null,
      packageName: null,
      fixVersion: null,
      codeSnippet: "res.sendFile(file.filePath);",
    },
    {
      id: "sast-004",
      source: "sast" as const,
      severity: "MEDIUM" as const,
      title: "Path Traversal via fs.existsSync (photos)",
      file: "artifacts/api-server/src/routes/photos.ts",
      line: 77,
      message: "Database-retrieved photo path passed to fs.existsSync without base-directory validation.",
      category: "Path Traversal",
      cveId: null,
      packageName: null,
      fixVersion: null,
      codeSnippet: "if (!fs.existsSync(photo.filePath)) { ... }",
    },
    {
      id: "sast-005",
      source: "sast" as const,
      severity: "MEDIUM" as const,
      title: "Unsafe res.sendFile — Path Traversal (photos)",
      file: "artifacts/api-server/src/routes/photos.ts",
      line: 79,
      message: "res.sendFile called with DB-sourced photo path. Allows reading arbitrary files if the stored path is manipulated.",
      category: "Path Traversal",
      cveId: null,
      packageName: null,
      fixVersion: null,
      codeSnippet: "res.sendFile(photo.filePath);",
    },
    {
      id: "sast-006",
      source: "sast" as const,
      severity: "MEDIUM" as const,
      title: "Path Traversal via fs.unlinkSync (photos)",
      file: "artifacts/api-server/src/routes/photos.ts",
      line: 89,
      message: "DB-sourced photo path passed to fs.unlinkSync without canonicalization.",
      category: "Path Traversal",
      cveId: null,
      packageName: null,
      fixVersion: null,
      codeSnippet: "try { fs.unlinkSync(photo.filePath); } catch { /* ignore */ }",
    },
    {
      id: "sast-007",
      source: "sast" as const,
      severity: "MEDIUM" as const,
      title: "Path Traversal via fs.unlinkSync (scans)",
      file: "artifacts/api-server/src/routes/scans.ts",
      line: 67,
      message: "Multer upload path passed to fs.unlinkSync on error — user-influenced filename may escape upload dir.",
      category: "Path Traversal",
      cveId: null,
      packageName: null,
      fixVersion: null,
      codeSnippet: "fs.unlinkSync(req.file.path);",
    },
    {
      id: "sast-008",
      source: "sast" as const,
      severity: "MEDIUM" as const,
      title: "Path Traversal via fs.existsSync (scans download)",
      file: "artifacts/api-server/src/routes/scans.ts",
      line: 131,
      message: "DB-sourced scan filePath passed to fs.existsSync without base-directory check.",
      category: "Path Traversal",
      cveId: null,
      packageName: null,
      fixVersion: null,
      codeSnippet: "if (!fs.existsSync(scan.filePath)) {",
    },
    {
      id: "sast-009",
      source: "sast" as const,
      severity: "MEDIUM" as const,
      title: "Unsafe res.sendFile — Path Traversal (scans)",
      file: "artifacts/api-server/src/routes/scans.ts",
      line: 138,
      message: "res.sendFile called with DB-sourced scan filePath, enabling arbitrary file reads via corrupted/injected path.",
      category: "Path Traversal",
      cveId: null,
      packageName: null,
      fixVersion: null,
      codeSnippet: "res.sendFile(scan.filePath);",
    },
    {
      id: "sast-010",
      source: "sast" as const,
      severity: "MEDIUM" as const,
      title: "Path Traversal via fs.existsSync (scan delete)",
      file: "artifacts/api-server/src/routes/scans.ts",
      line: 154,
      message: "DB-sourced path used in existsSync during deletion flow without canonicalization.",
      category: "Path Traversal",
      cveId: null,
      packageName: null,
      fixVersion: null,
      codeSnippet: "if (fs.existsSync(scan.filePath)) {",
    },
    {
      id: "sast-011",
      source: "sast" as const,
      severity: "MEDIUM" as const,
      title: "Path Traversal via fs.unlinkSync (scan delete)",
      file: "artifacts/api-server/src/routes/scans.ts",
      line: 155,
      message: "DB-sourced path passed to fs.unlinkSync during scan deletion without canonicalization.",
      category: "Path Traversal",
      cveId: null,
      packageName: null,
      fixVersion: null,
      codeSnippet: "fs.unlinkSync(scan.filePath);",
    },
    {
      id: "sast-012",
      source: "sast" as const,
      severity: "MEDIUM" as const,
      title: "Dynamic Module Access — Arbitrary Code Risk",
      file: "artifacts/mockup-sandbox/src/App.tsx",
      line: 67,
      message: "Non-static data used to retrieve and invoke functions from a module map. If the key is user-controlled, arbitrary code execution is possible.",
      category: "Code Injection",
      cveId: null,
      packageName: null,
      fixVersion: null,
      codeSnippet: "const loader = modules[key]; ... const mod = await loader();",
    },
    {
      id: "sast-013",
      source: "sast" as const,
      severity: "MEDIUM" as const,
      title: "HTML Interpolation — XSS Risk (score meter)",
      file: "artifacts/ortho-platform/src/lib/ortho-report-generator.ts",
      line: 40,
      message: "Template literal builds HTML with interpolated variables. Variables are not HTML-encoded; clinical data values could contain XSS payloads.",
      category: "XSS",
      cveId: null,
      packageName: null,
      fixVersion: null,
      codeSnippet: "`<div style=\"width:${pct}%;background:${color};\"></div>`",
    },
    {
      id: "sast-014",
      source: "sast" as const,
      severity: "MEDIUM" as const,
      title: "HTML Interpolation — XSS Risk (condition row)",
      file: "artifacts/ortho-platform/src/lib/ortho-report-generator.ts",
      line: 57,
      message: "Multiple condition fields (name, severity, score, affected teeth) interpolated into an HTML template row without encoding.",
      category: "XSS",
      cveId: null,
      packageName: null,
      fixVersion: null,
      codeSnippet: "`<td><strong>${c.name}</strong></td>`",
    },
    {
      id: "sast-015",
      source: "sast" as const,
      severity: "MEDIUM" as const,
      title: "HTML Interpolation — XSS Risk (tooth chips)",
      file: "artifacts/ortho-platform/src/lib/ortho-report-generator.ts",
      line: 87,
      message: "Tooth identifiers interpolated as chip spans in HTML template without HTML entity encoding.",
      category: "XSS",
      cveId: null,
      packageName: null,
      fixVersion: null,
      codeSnippet: "t => `<span class=\"tooth-chip\">${t}</span>`",
    },
    {
      id: "dep-001",
      source: "dependency" as const,
      severity: "moderate" as const,
      title: "qs@6.15.1 — DoS via TypeError (CVE-2026-8723)",
      file: "package-lock.json",
      line: 0,
      message: "qs.stringify throws TypeError on null/undefined entries in comma+encodeValuesOnly arrays. Synchronous throw causes 500 errors in Express request handlers. Fix: upgrade to qs@6.15.2.",
      category: "Denial of Service",
      cveId: "CVE-2026-8723",
      packageName: "qs",
      fixVersion: "6.15.2",
      codeSnippet: null,
    },
  ],
};

interface ResolutionTask {
  taskId: string;
  findingId: string;
  strategy: string;
  status: "queued" | "running" | "completed" | "failed" | "suppressed";
  progress: number;
  message: string | null;
  steps: Array<{ label: string; done: boolean }>;
  createdAt: string;
  completedAt: string | null;
}

const tasks = new Map<string, ResolutionTask>();

function getStepsForStrategy(strategy: string, findingId: string): Array<{ label: string; done: boolean }> {
  const finding = SCAN_REPORT.findings.find((f) => f.id === findingId);
  const cat = finding?.category ?? "Unknown";

  if (strategy === "upgrade-dependency") {
    return [
      { label: "Identify affected package version", done: false },
      { label: "Resolve latest safe version", done: false },
      { label: "Update package.json / pnpm-lock.yaml", done: false },
      { label: "Run dependency audit post-upgrade", done: false },
      { label: "Verify build passes", done: false },
    ];
  }

  if (strategy === "suppress") {
    return [
      { label: "Validate suppression justification", done: false },
      { label: "Add inline suppression comment", done: false },
      { label: "Record suppression in security log", done: false },
    ];
  }

  if (cat === "Path Traversal") {
    return [
      { label: "Identify all affected file-serving paths", done: false },
      { label: "Resolve UPLOAD_DIR base directory", done: false },
      { label: "Add path.resolve + startsWith guard", done: false },
      { label: "Update unit test for path traversal attempt", done: false },
      { label: "Restart API server and validate fix", done: false },
    ];
  }

  if (cat === "XSS") {
    return [
      { label: "Audit all HTML template literals in file", done: false },
      { label: "Create escapeHtml() utility", done: false },
      { label: "Apply escaping to all interpolated values", done: false },
      { label: "Test with XSS payload", done: false },
    ];
  }

  if (cat === "Code Injection") {
    return [
      { label: "Identify all dynamic module key lookups", done: false },
      { label: "Validate key against allowlist", done: false },
      { label: "Replace dynamic access with safe routing", done: false },
      { label: "Verify no user-controlled keys remain", done: false },
    ];
  }

  return [
    { label: "Analyze vulnerability scope", done: false },
    { label: "Apply fix", done: false },
    { label: "Test fix", done: false },
    { label: "Review and verify", done: false },
  ];
}

function simulateTaskProgress(taskId: string) {
  const task = tasks.get(taskId);
  if (!task) return;

  task.status = "running";
  const totalSteps = task.steps.length;
  let stepIndex = 0;

  const advance = () => {
    const t = tasks.get(taskId);
    if (!t) return;

    if (stepIndex < totalSteps) {
      t.steps[stepIndex].done = true;
      stepIndex++;
      t.progress = Math.round((stepIndex / totalSteps) * 100);
      t.message = t.steps[stepIndex - 1]?.label ?? null;

      if (stepIndex < totalSteps) {
        setTimeout(advance, 1800 + Math.random() * 1200);
      } else {
        t.status = t.strategy === "suppress" ? "suppressed" : "completed";
        t.progress = 100;
        t.completedAt = new Date().toISOString();
      }
    }
  };

  setTimeout(advance, 600);
}

router.get("/security/scan-report", (_req: Request, res: Response) => {
  res.json(SCAN_REPORT);
});

router.get("/security/threat-model", (_req: Request, res: Response) => {
  let content = "";
  try {
    content = readFileSync(THREAT_MODEL_PATH, "utf-8");
  } catch {
    content = "# Threat Model\n\nThreat model file not found.";
  }

  const sections: Array<{ title: string; content: string }> = [];
  const lines = content.split("\n");
  let currentTitle = "";
  let currentLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (currentTitle) {
        sections.push({ title: currentTitle, content: currentLines.join("\n").trim() });
      }
      currentTitle = line.replace("## ", "").trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  if (currentTitle) {
    sections.push({ title: currentTitle, content: currentLines.join("\n").trim() });
  }

  res.json({ content, sections });
});

router.post("/security/analyze", async (req: Request, res: Response) => {
  const { findingId, finding } = req.body as {
    findingId: string;
    finding: (typeof SCAN_REPORT.findings)[0];
  };

  if (!findingId || !finding) {
    res.status(400).json({ error: "findingId and finding are required" });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "GROQ_API_KEY not configured" });
    return;
  }

  const systemPrompt = `You are a senior application security engineer and threat modeling expert. You analyze security vulnerabilities found in real codebases using static analysis and dependency scanners. You reason about real-world exploit paths, business impact, and concrete remediation.

The codebase is OrthoVision: a Node.js/Express 5 + PostgreSQL + React 19 clinical orthodontic treatment planning platform. It stores patient health records (PHI), 3D scan files (STL/OBJ) on disk, and uses session-based authentication.

Always respond with VALID JSON matching exactly this schema:
{
  "findingId": "<string>",
  "riskLevel": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  "summary": "<one-sentence summary of the vulnerability>",
  "impact": "<clinical/business impact if exploited>",
  "rootCause": "<technical root cause explanation, 1-2 sentences>",
  "fix": "<concrete fix description with code pattern if applicable>",
  "codeExample": "<brief before/after code snippet showing the fix, or null>",
  "effort": "low" | "medium" | "high",
  "strideCategory": "<STRIDE threat category: Spoofing|Tampering|Repudiation|Information Disclosure|Denial of Service|Elevation of Privilege>"
}`;

  const userPrompt = `Analyze this security finding from the OrthoVision codebase:

Finding ID: ${finding.id}
Source: ${finding.source} scanner
Severity (scanner): ${finding.severity}
Category: ${finding.category}
File: ${finding.file}:${finding.line}
Title: ${finding.title}
Message: ${finding.message}
Code snippet: ${finding.codeSnippet ?? "N/A"}
${finding.cveId ? `CVE: ${finding.cveId}` : ""}
${finding.packageName ? `Package: ${finding.packageName} → fix version: ${finding.fixVersion}` : ""}

Provide your expert analysis as JSON.`;

  try {
    const groqRes = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 800,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      res.status(502).json({ error: `Groq API error: ${groqRes.status}`, details: errText });
      return;
    }

    const data = (await groqRes.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const raw = data.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    res.json({ ...parsed, findingId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/security/resolve", (req: Request, res: Response) => {
  const { findingId, strategy } = req.body as { findingId: string; strategy: string };

  if (!findingId || !strategy) {
    res.status(400).json({ error: "findingId and strategy are required" });
    return;
  }

  const existingTask = Array.from(tasks.values()).find(
    (t) => t.findingId === findingId && (t.status === "queued" || t.status === "running")
  );
  if (existingTask) {
    res.status(409).json({ error: "A task is already running for this finding" });
    return;
  }

  const taskId = randomUUID();
  const task: ResolutionTask = {
    taskId,
    findingId,
    strategy,
    status: "queued",
    progress: 0,
    message: "Task queued",
    steps: getStepsForStrategy(strategy, findingId),
    createdAt: new Date().toISOString(),
    completedAt: null,
  };

  tasks.set(taskId, task);
  simulateTaskProgress(taskId);
  res.status(201).json(task);
});

router.get("/security/tasks", (_req: Request, res: Response) => {
  res.json(Array.from(tasks.values()));
});

router.delete("/security/tasks/:taskId", (req: Request, res: Response) => {
  const { taskId } = req.params;
  if (!tasks.has(taskId)) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  tasks.delete(taskId);
  res.json({ success: true, message: "Task dismissed" });
});

export default router;
