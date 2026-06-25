import { Router } from "express";
import type { Request, Response } from "express";

const router = Router();

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const SYSTEM_PROMPT = `You are an expert AI Orthodontic Copilot assisting a licensed orthodontist during treatment planning. You have deep knowledge of:
- Orthodontic biomechanics and tooth movement physics
- FDI tooth numbering system
- All common malocclusion types (Angle Class I, II, III)
- Treatment mechanics: expansion, intrusion, extrusion, rotation, distalization, mesialization, torque
- Appliance systems: braces, aligners, TADs/mini-screws, functional appliances, RPE
- Retention protocols and relapse prevention
- Evidence-based orthodontics

CRITICAL SAFETY RULES:
1. NEVER provide definitive treatment decisions — always frame as suggestions requiring clinical judgment
2. ALWAYS recommend clinical examination to verify AI findings
3. ALWAYS note when surgical or specialist referral may be needed
4. ALWAYS remind the user that recommendations need doctor approval before implementation
5. When asked about specific tooth movements, explain the biomechanical rationale, risks, and alternatives

When providing treatment plans, use this JSON structure if asked to output structured data:
{
  "movements": [{"tooth": FDI_number, "movement": "type", "amount": value, "unit": "mm or degrees", "rationale": "...", "risk": "..."}],
  "sequence": ["step 1", "step 2", ...],
  "confidence": 0-100,
  "evidence": "clinical basis",
  "alternatives": ["alternative approach 1", ...],
  "warnings": ["warning 1", ...]
}

Be concise, clinically precise, and always emphasize that the orthodontist must approve all treatment decisions.`;

function buildContextMessage(contextData: Record<string, unknown>): string {
  if (!contextData || Object.keys(contextData).length === 0) return "";

  const parts: string[] = [];

  if (contextData.segments && Array.isArray(contextData.segments)) {
    const segs = contextData.segments as Array<{ fdiNumber: number; label: string }>;
    parts.push(`SEGMENTED TEETH: ${segs.map((s) => s.fdiNumber).join(", ")} (${segs.length} teeth detected)`);
  }

  if (contextData.analysis && typeof contextData.analysis === "object") {
    const analysis = contextData.analysis as {
      conditions?: Array<{ name: string; severity: string; score: number; explanation: string }>;
      overallSeverity?: string;
      treatmentComplexity?: string;
      complexityScore?: number;
      summary?: string;
    };
    if (analysis.conditions) {
      const activeConditions = analysis.conditions.filter((c) => c.severity !== "none");
      if (activeConditions.length > 0) {
        parts.push(
          `ORTHODONTIC ANALYSIS RESULTS:\n` +
            activeConditions
              .map((c) => `- ${c.name}: ${c.severity} (score ${c.score}/10) — ${c.explanation}`)
              .join("\n")
        );
      }
      if (analysis.overallSeverity) {
        parts.push(`Overall Severity: ${analysis.overallSeverity}`);
      }
      if (analysis.treatmentComplexity) {
        parts.push(
          `Treatment Complexity: ${analysis.treatmentComplexity} (score: ${analysis.complexityScore})`
        );
      }
      if (analysis.summary) {
        parts.push(`Summary: ${analysis.summary}`);
      }
    }
  }

  if (contextData.measurements && typeof contextData.measurements === "object") {
    const meas = contextData.measurements as {
      archMeasurements?: Array<{ label: string; value: number; unit: string }>;
    };
    if (meas.archMeasurements && meas.archMeasurements.length > 0) {
      parts.push(
        `ARCH MEASUREMENTS:\n` +
          meas.archMeasurements.map((m) => `- ${m.label}: ${m.value} ${m.unit}`).join("\n")
      );
    }
  }

  if (contextData.patientInfo && typeof contextData.patientInfo === "object") {
    const info = contextData.patientInfo as { name?: string; caseCode?: string };
    if (info.name) parts.push(`Patient: ${info.name}`);
    if (info.caseCode) parts.push(`Case: ${info.caseCode}`);
  }

  return parts.length > 0
    ? `[PATIENT CONTEXT]\n${parts.join("\n\n")}\n[END CONTEXT]\n\n`
    : "";
}

// POST /api/ai-copilot/chat — SSE streaming chat
router.post("/ai-copilot/chat", async (req: Request, res: Response) => {
  const apiKey = process.env["GROQ_API_KEY"];
  if (!apiKey) {
    res.status(500).json({ error: "GROQ_API_KEY not configured" });
    return;
  }

  const { messages, contextData } = req.body as {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    contextData?: Record<string, unknown>;
  };

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: "messages array required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const contextMsg = buildContextMessage(contextData ?? {});
  const systemContent = SYSTEM_PROMPT + (contextMsg ? `\n\n${contextMsg}` : "");

  const chatMessages = [{ role: "system", content: systemContent }, ...messages];

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: chatMessages,
        max_tokens: 2048,
        temperature: 0.3,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      res.write(`data: ${JSON.stringify({ error: `Groq API error: ${errText}` })}\n\n`);
      res.end();
      return;
    }

    if (!response.body) {
      res.write(`data: ${JSON.stringify({ error: "No response body from Groq" })}\n\n`);
      res.end();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") {
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          continue;
        }

        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        } catch {
          // skip malformed chunks
        }
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    res.end();
  }
});

// POST /api/ai-copilot/treatment-plan — Generate structured treatment plan
router.post("/ai-copilot/treatment-plan", async (req: Request, res: Response) => {
  const apiKey = process.env["GROQ_API_KEY"];
  if (!apiKey) {
    res.status(500).json({ error: "GROQ_API_KEY not configured" });
    return;
  }

  const { contextData, focus } = req.body as {
    contextData: Record<string, unknown>;
    focus?: string;
  };

  const contextMsg = buildContextMessage(contextData ?? {});
  const focusLine = focus ? `\nFocus specifically on: ${focus}` : "";

  const prompt = `${contextMsg}

Based on the orthodontic analysis above, generate a comprehensive treatment plan in JSON format.${focusLine}

Include:
1. Prioritized list of tooth movements with biomechanical rationale
2. Treatment sequence (phases)
3. Confidence percentage with evidence basis
4. Alternative approaches
5. Risks and warnings
6. Expected treatment duration estimate

Respond ONLY with valid JSON in this structure:
{
  "confidence": 75,
  "evidence": "Based on arch measurements and detected conditions...",
  "duration": "18-24 months",
  "phases": [
    {"name": "Phase 1: Alignment", "duration": "6 months", "objectives": ["...", "..."]},
    {"name": "Phase 2: Space Closure", "duration": "8 months", "objectives": ["..."]}
  ],
  "movements": [
    {
      "tooth": 11,
      "movement": "intrusion",
      "amount": 2,
      "unit": "mm",
      "rationale": "Reduce deep bite by intrusion of upper central incisors",
      "risk": "Root resorption risk — monitor with periapical X-rays every 6 months",
      "priority": "high"
    }
  ],
  "alternatives": [
    {"approach": "Extraction therapy", "indication": "If arch expansion not feasible"},
    {"approach": "Orthognathic surgery", "indication": "For skeletal discrepancy > 5mm"}
  ],
  "warnings": [
    "Parafunction (bruxism) must be addressed before aligner therapy",
    "Periodontal health must be optimized before starting treatment"
  ],
  "appliance_recommendations": ["Upper and lower fixed appliances", "TAD-supported molar intrusion"],
  "retention": "Fixed lingual retainer upper and lower, with removable overlay retainer"
}`;

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        max_tokens: 3000,
        temperature: 0.2,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      res.status(500).json({ error: `Groq API error: ${errText}` });
      return;
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "{}";

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.status(500).json({ error: "Could not parse treatment plan JSON" });
      return;
    }

    const plan = JSON.parse(jsonMatch[0]) as unknown;
    res.json({ plan, rawContent: content });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// POST /api/ai-copilot/collision-safety — AI safety analysis for detected collisions
router.post("/ai-copilot/collision-safety", async (req: Request, res: Response) => {
  const apiKey = process.env["GROQ_API_KEY"];
  if (!apiKey) {
    res.status(500).json({ error: "GROQ_API_KEY not configured" });
    return;
  }

  const { collisions, scanId } = req.body as {
    collisions: Array<{ fdi: number; severity: string; pairs: number }>;
    scanId?: number;
  };

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const collisionSummary = collisions
    .map((c) => `- Tooth ${c.fdi}: ${c.severity} (${c.pairs} contact pair${c.pairs !== 1 ? "s" : ""})`)
    .join("\n");

  const prompt = `As an expert orthodontic safety consultant, analyze the following tooth collisions detected during treatment planning simulation:

${collisionSummary}

For each collision or risk zone, provide:
1. **Clinical Explanation**: What does this collision mean clinically?
2. **Risks**: What are the clinical risks if left uncorrected?
3. **Recommended Correction**: Specific movement adjustments to resolve the collision (include direction and approximate amount)
4. **Alternative Approaches**: Other treatment approaches that avoid this issue

Keep the response concise, clinically precise, and actionable. Format with clear sections.

IMPORTANT: Remind the doctor that all movement corrections require clinical judgment and doctor approval before implementation.`;

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        max_tokens: 1500,
        temperature: 0.25,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      res.write(`data: ${JSON.stringify({ error: errText })}\n\n`);
      res.end();
      return;
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") { res.write(`data: ${JSON.stringify({ done: true })}\n\n`); continue; }
        try {
          const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
        } catch { /* skip */ }
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    res.end();
  }
});

// POST /api/ai-copilot/treatment-simulation — AI narrative for aligner staging
router.post("/ai-copilot/treatment-simulation", async (req: Request, res: Response) => {
  const apiKey = process.env["GROQ_API_KEY"];
  if (!apiKey) { res.status(500).json({ error: "GROQ_API_KEY not configured" }); return; }

  const {
    totalStages, estimatedMonths, overallComplexity, successProbability,
    refinementLikelihood, totalTeethMoved, difficultMovements, phases,
  } = req.body as {
    totalStages: number; estimatedMonths: number; overallComplexity: string;
    successProbability: number; refinementLikelihood: number; totalTeethMoved: number;
    difficultMovements: Array<{ fdi: number; label: string; factors: string[] }>;
    phases: Array<{ label: string; stages: string; movement: string }>;
  };

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const difficultSummary = difficultMovements.length > 0
    ? difficultMovements.map(m => `  - Tooth ${m.fdi} (${m.label}): ${m.factors.join("; ")}`).join("\n")
    : "  None identified";

  const phasesSummary = phases.map(p => `  - ${p.label} (${p.stages}): ${p.movement}`).join("\n");

  const prompt = `Analyze this orthodontic clear aligner treatment simulation and provide a comprehensive clinical assessment:

TREATMENT OVERVIEW:
- Total aligners: ${totalStages}
- Estimated duration: ~${estimatedMonths} months
- Overall complexity: ${overallComplexity.toUpperCase()}
- Teeth being moved: ${totalTeethMoved}
- Predicted success probability: ${successProbability}%
- Refinement likelihood: ${refinementLikelihood}%

TREATMENT PHASES:
${phasesSummary}

CHALLENGING MOVEMENTS IDENTIFIED:
${difficultSummary}

Please provide a detailed clinical analysis with these sections:

**1. Treatment Prognosis**
Explain why this treatment has a ${successProbability}% success probability. What factors support or limit success?

**2. Phase-by-Phase Assessment**
For each treatment phase, describe what is clinically happening and what the doctor should monitor.

**3. Difficult Movement Analysis**
For each challenging movement, explain the biomechanical difficulty, clinical risks, and strategies to optimize outcome.

**4. Risk Factors**
Identify the top 3–5 clinical risks in this treatment plan and how to mitigate them.

**5. Optimization Recommendations**
Specific, actionable recommendations to improve treatment efficiency and reduce the ${refinementLikelihood}% refinement likelihood.

**6. Patient Monitoring Schedule**
Suggested check-up frequency and what to monitor at each visit.

Keep responses evidence-based and clinically precise. Always frame as advisory requiring professional judgment.`;

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: prompt }],
        max_tokens: 2000, temperature: 0.2, stream: true,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      res.write(`data: ${JSON.stringify({ error: err })}\n\n`);
      res.end(); return;
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data: ")) continue;
        const data = t.slice(6);
        if (data === "[DONE]") { res.write(`data: ${JSON.stringify({ done: true })}\n\n`); continue; }
        try {
          const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
        } catch { /* skip */ }
      }
    }
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    res.end();
  }
});

// POST /api/ai-copilot/auto-align — AI-driven tooth alignment suggestions
router.post("/ai-copilot/auto-align", async (req: Request, res: Response) => {
  const apiKey = process.env["GROQ_API_KEY"];
  if (!apiKey) {
    res.status(500).json({ error: "GROQ_API_KEY not configured" });
    return;
  }

  const { teeth, analysisData } = req.body as {
    teeth: Array<{ fdi: number; label: string; x: number; y: number; z: number; type: string }>;
    analysisData?: Record<string, unknown>;
  };

  if (!teeth || teeth.length === 0) {
    res.status(400).json({ error: "teeth array required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const contextMsg = analysisData ? buildContextMessage(analysisData) : "";

  const teethJson = JSON.stringify(
    teeth.map((t) => ({
      fdi: t.fdi,
      label: t.label,
      type: t.type,
      x: parseFloat(t.x.toFixed(2)),
      y: parseFloat(t.y.toFixed(2)),
      z: parseFloat(t.z.toFixed(2)),
    })),
    null,
    2
  );

  const prompt = `${contextMsg}
You are an expert orthodontic alignment AI. Analyze the 3D centroid positions of the following teeth (in millimeters, scan coordinate space) and suggest alignment movements to improve arch form, symmetry, and occlusion.

TEETH POSITIONS:
${teethJson}

Analysis instructions:
1. Compare left/right symmetry: corresponding teeth (e.g. FDI 13 vs 23) should have near-mirror X positions
2. Check spacing between adjacent teeth using their X/Z positions
3. Identify rotations needed based on expected vs actual positions
4. Check occlusal leveling (Y positions should follow a smooth curve)
5. Keep all movements conservative: tx/ty/tz max ±3mm, rx/ry/rz max ±10°

Return ONLY this JSON object — no markdown, no explanations:
{
  "overallAssessment": "2-3 sentence clinical summary of the arch condition",
  "crowdingScore": 0-10,
  "symmetryScore": 0-10,
  "estimatedImprovement": "brief description of expected outcome",
  "suggestions": [
    {
      "fdi": <number>,
      "label": "<tooth label>",
      "tx": <mm>,
      "ty": <mm>,
      "tz": <mm>,
      "rx": <degrees>,
      "ry": <degrees>,
      "rz": <degrees>,
      "rationale": "<1 sentence clinical rationale>",
      "confidence": <0-100>,
      "priority": "high|medium|low"
    }
  ]
}
Only include teeth that genuinely need movement. Omit teeth that are already well-positioned.`;

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        max_tokens: 3000,
        temperature: 0.15,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      res.write(`data: ${JSON.stringify({ error: `Groq API error: ${errText}` })}\n\n`);
      res.end();
      return;
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "{}";

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      res.write(`data: ${JSON.stringify({ error: "Could not parse AI alignment response" })}\n\n`);
      res.end();
      return;
    }

    try {
      const plan = JSON.parse(jsonMatch[0]) as unknown;
      res.write(`data: ${JSON.stringify({ plan })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch {
      res.write(`data: ${JSON.stringify({ error: "Invalid JSON in AI response" })}\n\n`);
      res.end();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    res.end();
  }
});

export default router;
