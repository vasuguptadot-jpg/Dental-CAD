import { Router } from "express";
import { db, scanAnalysisTable, scansTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();
router.use(requireAuth);

router.get("/scans/:scanId/analysis", async (req, res) => {
  const scanId = parseInt(String(req.params.scanId), 10);
  if (isNaN(scanId)) { res.status(400).json({ error: "Invalid scan ID" }); return; }

  const [row] = await db.select().from(scanAnalysisTable).where(eq(scanAnalysisTable.scanId, scanId)).limit(1);
  if (!row) { res.status(404).json({ error: "Analysis not found" }); return; }

  res.json(formatAnalysis(row));
});

router.put("/scans/:scanId/analysis", async (req, res) => {
  const scanId = parseInt(String(req.params.scanId), 10);
  if (isNaN(scanId)) { res.status(400).json({ error: "Invalid scan ID" }); return; }

  const [scan] = await db.select().from(scansTable).where(eq(scansTable.id, scanId)).limit(1);
  if (!scan) { res.status(404).json({ error: "Scan not found" }); return; }

  const { status, segmentationData, landmarksData, measurementsData } = req.body;

  const [existing] = await db.select().from(scanAnalysisTable).where(eq(scanAnalysisTable.scanId, scanId)).limit(1);

  let row;
  if (existing) {
    [row] = await db.update(scanAnalysisTable).set({
      ...(status !== undefined && { status }),
      ...(segmentationData !== undefined && { segmentationData }),
      ...(landmarksData !== undefined && { landmarksData }),
      ...(measurementsData !== undefined && { measurementsData }),
      updatedAt: new Date(),
    }).where(eq(scanAnalysisTable.scanId, scanId)).returning();
  } else {
    [row] = await db.insert(scanAnalysisTable).values({
      scanId,
      status: status ?? "completed",
      segmentationData: segmentationData ?? null,
      landmarksData: landmarksData ?? null,
      measurementsData: measurementsData ?? null,
    }).returning();
  }

  res.json(formatAnalysis(row));
});

function formatAnalysis(row: typeof scanAnalysisTable.$inferSelect) {
  return {
    id: row.id,
    scanId: row.scanId,
    status: row.status,
    segmentationData: row.segmentationData ?? null,
    landmarksData: row.landmarksData ?? null,
    measurementsData: row.measurementsData ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export default router;
