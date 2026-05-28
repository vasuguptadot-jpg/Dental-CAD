import { Router, type IRouter } from "express";
import OpenAI from "openai";
import { eq, asc } from "drizzle-orm";
import {
  db,
  aiTreatmentPlansTable,
  aiChatMessagesTable,
  casesTable,
  toothSegmentsTable,
  toothLandmarksTable,
  scanAnalysesTable,
  scansTable,
  patientsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();
router.use(requireAuth);

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

function buildClinicalContext(opts: {
  orthoCase: { title: string | null; description: string | null; notes: string | null; status: string; caseCode: string };
  patient: { fullName: string; age: number | null; gender: string | null } | null;
  segments: { toothId: number; label: string; centroid: { x: number; y: number; z: number } | null }[];
  landmarks: { toothId: number; type: string; position: { x: number; y: number; z: number }; confidence: number }[];
  analysis: { findings: unknown[]; complexityScore: number; complexityLabel: string; summary: string } | null;
}): string {
  const { orthoCase, patient, segments, landmarks, analysis } = opts;

  let ctx = `=== CLINICAL CONTEXT ===\n`;

  if (patient) {
    ctx += `Patient: ${patient.fullName}, Age: ${patient.age ?? "unknown"}, Gender: ${patient.gender ?? "unknown"}\n`;
  }
  ctx += `Case: ${orthoCase.caseCode} — ${orthoCase.title ?? "Untitled"}\n`;
  ctx += `Status: ${orthoCase.status}\n`;
  if (orthoCase.description) ctx += `Description: ${orthoCase.description}\n`;
  if (orthoCase.notes) ctx += `Notes: ${orthoCase.notes}\n\n`;

  if (segments.length > 0) {
    ctx += `=== SEGMENTED TEETH (${segments.length} teeth) ===\n`;
    const sorted = [...segments].sort((a, b) => a.toothId - b.toothId);
    sorted.forEach((s) => {
      const c = s.centroid;
      const pos = c ? ` at (${c.x.toFixed(1)}, ${c.y.toFixed(1)}, ${c.z.toFixed(1)})` : "";
      ctx += `  Tooth ${s.toothId} (${s.label})${pos}\n`;
    });
    ctx += "\n";
  }

  if (landmarks.length > 0) {
    ctx += `=== LANDMARKS (${landmarks.length} points) ===\n`;
    const byTooth = landmarks.reduce<Record<number, typeof landmarks>>((acc, lm) => {
      (acc[lm.toothId] ??= []).push(lm);
      return acc;
    }, {});
    Object.entries(byTooth).forEach(([tid, lms]) => {
      ctx += `  Tooth ${tid}: ${lms.map((l) => `${l.type} (conf ${(l.confidence * 100).toFixed(0)}%)`).join(", ")}\n`;
    });
    ctx += "\n";
  }

  if (analysis) {
    ctx += `=== EXISTING ANALYSIS ===\n`;
    ctx += `Complexity: ${analysis.complexityLabel} (score: ${analysis.complexityScore}/100)\n`;
    ctx += `Summary: ${analysis.summary}\n`;
    if (Array.isArray(analysis.findings) && analysis.findings.length > 0) {
      ctx += `Findings:\n`;
      (analysis.findings as Array<{ name: string; severityLabel: string; affectedTeeth: number[]; explanation: string }>).forEach((f) => {
        ctx += `  - ${f.name} (${f.severityLabel}): teeth [${f.affectedTeeth.join(", ")}] — ${f.explanation}\n`;
      });
    }
  }

  return ctx;
}

async function loadCaseContext(caseId: number, scanId?: number) {
  const [orthoCase] = await db
    .select()
    .from(casesTable)
    .where(eq(casesTable.id, caseId));

  if (!orthoCase) return null;

  const [patient] = await db
    .select({ fullName: patientsTable.fullName, age: patientsTable.age, gender: patientsTable.gender })
    .from(patientsTable)
    .where(eq(patientsTable.id, orthoCase.patientId));

  let targetScanId = scanId;
  if (!targetScanId) {
    const [latestScan] = await db
      .select({ id: scansTable.id })
      .from(scansTable)
      .where(eq(scansTable.caseId, caseId))
      .orderBy(asc(scansTable.createdAt))
      .limit(1);
    targetScanId = latestScan?.id;
  }

  let segments: { toothId: number; label: string; centroid: { x: number; y: number; z: number } | null }[] = [];
  let landmarks: { toothId: number; type: string; position: { x: number; y: number; z: number }; confidence: number }[] = [];
  let analysis: { findings: unknown[]; complexityScore: number; complexityLabel: string; summary: string } | null = null;

  if (targetScanId) {
    segments = await db
      .select({ toothId: toothSegmentsTable.toothId, label: toothSegmentsTable.label, centroid: toothSegmentsTable.centroid })
      .from(toothSegmentsTable)
      .where(eq(toothSegmentsTable.scanId, targetScanId));

    landmarks = await db
      .select({ toothId: toothLandmarksTable.toothId, type: toothLandmarksTable.type, position: toothLandmarksTable.position, confidence: toothLandmarksTable.confidence })
      .from(toothLandmarksTable)
      .where(eq(toothLandmarksTable.scanId, targetScanId));

    const [anal] = await db
      .select()
      .from(scanAnalysesTable)
      .where(eq(scanAnalysesTable.scanId, targetScanId));
    if (anal) {
      analysis = {
        findings: anal.findings as unknown[],
        complexityScore: anal.complexityScore,
        complexityLabel: anal.complexityLabel,
        summary: anal.summary,
      };
    }
  }

  return { orthoCase, patient: patient ?? null, segments, landmarks, analysis, scanId: targetScanId };
}

// ─── GET treatment plans for a case ────────────────────────────────────────
router.get("/cases/:caseId/ai/plans", async (req, res): Promise<void> => {
  const caseId = parseInt(req.params.caseId, 10);
  if (isNaN(caseId)) { res.status(400).json({ error: "Invalid caseId" }); return; }

  const plans = await db
    .select()
    .from(aiTreatmentPlansTable)
    .where(eq(aiTreatmentPlansTable.caseId, caseId))
    .orderBy(asc(aiTreatmentPlansTable.createdAt));

  res.json(plans);
});

// ─── GENERATE treatment plan (AI) ──────────────────────────────────────────
router.post("/cases/:caseId/ai/generate-plan", async (req, res): Promise<void> => {
  const caseId = parseInt(req.params.caseId, 10);
  if (isNaN(caseId)) { res.status(400).json({ error: "Invalid caseId" }); return; }

  const { scanId } = req.body as { scanId?: number };
  const ctx = await loadCaseContext(caseId, scanId);
  if (!ctx) { res.status(404).json({ error: "Case not found" }); return; }

  const clinicalCtx = buildClinicalContext(ctx);

  const systemPrompt = `You are an expert orthodontist AI assistant. Your role is to analyze clinical data and generate evidence-based treatment plans. 
You must always be scientifically rigorous, acknowledge uncertainty, and present multiple options. 
Your recommendations must never be auto-applied — they require doctor approval.
Always respond with valid JSON matching the exact schema provided.`;

  const userPrompt = `${clinicalCtx}

Generate a comprehensive orthodontic treatment plan in the following JSON format. Be specific about tooth movements using FDI notation (e.g., tooth 11 = upper right central incisor).

{
  "summary": "Brief 2-3 sentence overview of the treatment plan",
  "diagnosis": "Detailed diagnosis based on the clinical data",
  "treatmentGoals": ["goal1", "goal2", ...],
  "phases": [
    {
      "phase": 1,
      "name": "Phase name",
      "duration": "e.g. 3-4 months",
      "goals": ["goal1", "goal2"],
      "movements": [
        {
          "toothId": <FDI tooth number>,
          "toothLabel": "<tooth name e.g. Upper Right Central Incisor>",
          "movementType": "<expansion|intrusion|extrusion|rotation|distalization|mesialization|torque|tipping>",
          "magnitude": <number in mm or degrees>,
          "unit": "<mm or degrees>",
          "direction": "<optional: mesial/distal/buccal/lingual/occlusal/apical>",
          "rationale": "Why this movement is recommended",
          "risks": ["risk1", "risk2"],
          "alternatives": ["alternative1", "alternative2"],
          "priority": "<high|medium|low>",
          "sequence": <order within phase, starting at 1>
        }
      ]
    }
  ],
  "totalDuration": "e.g. 18-24 months",
  "applianceRecommendations": ["recommendation1", "recommendation2"],
  "retentionPlan": "Detailed retention protocol",
  "risks": ["overall risk1", "overall risk2"],
  "alternatives": ["alternative treatment1", "alternative treatment2"],
  "confidenceScore": <0.0 to 1.0, reflecting your confidence given the available data>,
  "evidenceBase": ["clinical evidence reference1", "reference2"]
}

${ctx.segments.length === 0 ? "NOTE: No tooth segmentation data is available. Base your plan on general principles and case description. Reflect this uncertainty in a lower confidence score." : ""}
${ctx.analysis === null ? "NOTE: No automated analysis available. Use clinical judgment." : ""}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 4096,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let planData: Record<string, unknown>;
    try {
      planData = JSON.parse(raw);
    } catch {
      res.status(500).json({ error: "AI returned malformed JSON" });
      return;
    }

    const fullPlanData = {
      ...planData,
      model: "gpt-5.4",
      generatedAt: new Date().toISOString(),
      doctorApproved: false,
    };

    const confidence = typeof planData.confidenceScore === "number"
      ? Math.min(1, Math.max(0, planData.confidenceScore))
      : 0.7;

    const [saved] = await db
      .insert(aiTreatmentPlansTable)
      .values({
        caseId,
        scanId: ctx.scanId ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        planData: fullPlanData as any,
        confidenceScore: confidence,
        doctorApproved: "pending",
      })
      .returning();

    req.log.info({ caseId, planId: saved.id }, "AI treatment plan generated");
    res.status(201).json(saved);
  } catch (err: unknown) {
    req.log.error({ err }, "AI plan generation failed");
    res.status(500).json({ error: "Failed to generate AI treatment plan" });
  }
});

// ─── APPROVE / REJECT a plan ────────────────────────────────────────────────
router.patch("/cases/:caseId/ai/plans/:planId/approval", async (req, res): Promise<void> => {
  const caseId = parseInt(req.params.caseId, 10);
  const planId = parseInt(req.params.planId, 10);
  if (isNaN(caseId) || isNaN(planId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { decision } = req.body as { decision: "approved" | "rejected" };
  if (decision !== "approved" && decision !== "rejected") {
    res.status(400).json({ error: "decision must be 'approved' or 'rejected'" });
    return;
  }

  const [updated] = await db
    .update(aiTreatmentPlansTable)
    .set({
      doctorApproved: decision,
      approvedAt: decision === "approved" ? new Date() : null,
    })
    .where(eq(aiTreatmentPlansTable.id, planId))
    .returning();

  if (!updated) { res.status(404).json({ error: "Plan not found" }); return; }

  req.log.info({ caseId, planId, decision }, "AI plan approval updated");
  res.json(updated);
});

// ─── DELETE a plan ──────────────────────────────────────────────────────────
router.delete("/cases/:caseId/ai/plans/:planId", async (req, res): Promise<void> => {
  const planId = parseInt(req.params.planId, 10);
  if (isNaN(planId)) { res.status(400).json({ error: "Invalid planId" }); return; }
  await db.delete(aiTreatmentPlansTable).where(eq(aiTreatmentPlansTable.id, planId));
  res.json({ success: true });
});

// ─── GET chat history ────────────────────────────────────────────────────────
router.get("/cases/:caseId/ai/chat", async (req, res): Promise<void> => {
  const caseId = parseInt(req.params.caseId, 10);
  if (isNaN(caseId)) { res.status(400).json({ error: "Invalid caseId" }); return; }

  const messages = await db
    .select()
    .from(aiChatMessagesTable)
    .where(eq(aiChatMessagesTable.caseId, caseId))
    .orderBy(asc(aiChatMessagesTable.createdAt));

  res.json(messages);
});

// ─── SEND chat message (streaming SSE) ─────────────────────────────────────
router.post("/cases/:caseId/ai/chat", async (req, res): Promise<void> => {
  const caseId = parseInt(req.params.caseId, 10);
  if (isNaN(caseId)) { res.status(400).json({ error: "Invalid caseId" }); return; }

  const { message, scanId } = req.body as { message: string; scanId?: number };
  if (!message?.trim()) { res.status(400).json({ error: "message is required" }); return; }

  const ctx = await loadCaseContext(caseId, scanId);
  if (!ctx) { res.status(404).json({ error: "Case not found" }); return; }

  const history = await db
    .select()
    .from(aiChatMessagesTable)
    .where(eq(aiChatMessagesTable.caseId, caseId))
    .orderBy(asc(aiChatMessagesTable.createdAt));

  await db.insert(aiChatMessagesTable).values({
    caseId,
    role: "user",
    content: message,
  });

  const clinicalCtx = buildClinicalContext(ctx);

  const systemPrompt = `You are an expert orthodontist AI copilot assisting a doctor with treatment planning. 
You have access to the patient's clinical data below. 
Be concise, clinically accurate, and evidence-based.
When discussing tooth movements, always explain the rationale, risks, and alternatives.
Never auto-apply any recommendations — emphasize that all decisions require the doctor's approval.
Use FDI tooth notation (e.g., tooth 11 = upper right central incisor).

${clinicalCtx}`;

  const chatMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.slice(-20).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: message },
  ];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-5.4",
      messages: chatMessages,
      stream: true,
      max_completion_tokens: 2048,
    });

    let fullResponse = "";
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) {
        fullResponse += delta;
        res.write(`data: ${JSON.stringify({ type: "delta", content: delta })}\n\n`);
      }
    }

    await db.insert(aiChatMessagesTable).values({
      caseId,
      role: "assistant",
      content: fullResponse,
    });

    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();
  } catch (err: unknown) {
    req.log.error({ err }, "AI chat failed");
    if (!res.headersSent) {
      res.status(500).json({ error: "AI chat failed" });
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", message: "AI chat failed" })}\n\n`);
      res.end();
    }
  }
});

// ─── CLEAR chat history ──────────────────────────────────────────────────────
router.delete("/cases/:caseId/ai/chat", async (req, res): Promise<void> => {
  const caseId = parseInt(req.params.caseId, 10);
  if (isNaN(caseId)) { res.status(400).json({ error: "Invalid caseId" }); return; }
  await db.delete(aiChatMessagesTable).where(eq(aiChatMessagesTable.caseId, caseId));
  res.json({ success: true });
});

export default router;
