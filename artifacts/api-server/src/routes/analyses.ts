import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, scanAnalysesTable, scansTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();
router.use(requireAuth);

router.get("/scans/:scanId/analysis", async (req, res): Promise<void> => {
  const scanId = parseInt(req.params.scanId, 10);
  if (isNaN(scanId)) { res.status(400).json({ error: "Invalid scanId" }); return; }

  const [scan] = await db.select({ id: scansTable.id }).from(scansTable).where(eq(scansTable.id, scanId));
  if (!scan) { res.status(404).json({ error: "Scan not found" }); return; }

  const [row] = await db.select().from(scanAnalysesTable).where(eq(scanAnalysesTable.scanId, scanId));
  if (!row) { res.status(404).json({ error: "No analysis found for this scan" }); return; }
  res.json(row);
});

router.post("/scans/:scanId/analysis", async (req, res): Promise<void> => {
  const scanId = parseInt(req.params.scanId, 10);
  if (isNaN(scanId)) { res.status(400).json({ error: "Invalid scanId" }); return; }

  const [scan] = await db.select({ id: scansTable.id }).from(scansTable).where(eq(scansTable.id, scanId));
  if (!scan) { res.status(404).json({ error: "Scan not found" }); return; }

  const body = req.body as Record<string, unknown>;
  if (!Array.isArray(body.findings)) { res.status(400).json({ error: "findings array required" }); return; }
  if (typeof body.complexityScore !== "number") { res.status(400).json({ error: "complexityScore required" }); return; }
  if (typeof body.complexityLabel !== "string") { res.status(400).json({ error: "complexityLabel required" }); return; }
  if (typeof body.summary !== "string") { res.status(400).json({ error: "summary required" }); return; }

  const payload = {
    scanId,
    findings: body.findings as import("@workspace/db").OrthoFindingRow[],
    complexityScore: Math.round(body.complexityScore as number),
    complexityLabel: body.complexityLabel as string,
    summary: body.summary as string,
    analyzedAt: new Date(),
  };

  const existing = await db.select({ id: scanAnalysesTable.id }).from(scanAnalysesTable).where(eq(scanAnalysesTable.scanId, scanId));

  let result;
  if (existing.length > 0) {
    [result] = await db.update(scanAnalysesTable).set(payload).where(eq(scanAnalysesTable.scanId, scanId)).returning();
  } else {
    [result] = await db.insert(scanAnalysesTable).values(payload).returning();
  }

  req.log.info({ scanId }, "Orthodontic analysis saved");
  res.status(201).json(result);
});

router.delete("/scans/:scanId/analysis", async (req, res): Promise<void> => {
  const scanId = parseInt(req.params.scanId, 10);
  if (isNaN(scanId)) { res.status(400).json({ error: "Invalid scanId" }); return; }
  await db.delete(scanAnalysesTable).where(eq(scanAnalysesTable.scanId, scanId));
  res.json({ success: true });
});

export default router;
