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

export default router;
