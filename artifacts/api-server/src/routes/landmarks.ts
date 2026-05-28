import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, toothLandmarksTable, scansTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();
router.use(requireAuth);

function isVec3(v: unknown): v is { x: number; y: number; z: number } {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.x === "number" && typeof o.y === "number" && typeof o.z === "number";
}

function parseLandmarkInput(raw: unknown): {
  toothId: number;
  type: string;
  position: { x: number; y: number; z: number };
  confidence: number;
  isManual: boolean;
  metadata: Record<string, unknown> | null;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.toothId !== "number" || typeof s.type !== "string" || !isVec3(s.position)) return null;
  return {
    toothId: s.toothId,
    type: s.type,
    position: s.position as { x: number; y: number; z: number },
    confidence: typeof s.confidence === "number" ? Math.round(s.confidence) : 100,
    isManual: !!s.isManual,
    metadata: s.metadata && typeof s.metadata === "object" && !Array.isArray(s.metadata)
      ? (s.metadata as Record<string, unknown>)
      : null,
  };
}

router.get("/scans/:scanId/landmarks", async (req, res): Promise<void> => {
  const scanId = parseInt(req.params.scanId, 10);
  if (isNaN(scanId)) { res.status(400).json({ error: "Invalid scanId" }); return; }

  const [scan] = await db.select().from(scansTable).where(eq(scansTable.id, scanId));
  if (!scan) { res.status(404).json({ error: "Scan not found" }); return; }

  const rows = await db
    .select()
    .from(toothLandmarksTable)
    .where(eq(toothLandmarksTable.scanId, scanId))
    .orderBy(toothLandmarksTable.toothId);

  res.json(rows);
});

router.post("/scans/:scanId/landmarks", async (req, res): Promise<void> => {
  const scanId = parseInt(req.params.scanId, 10);
  if (isNaN(scanId)) { res.status(400).json({ error: "Invalid scanId" }); return; }

  const [scan] = await db.select().from(scansTable).where(eq(scansTable.id, scanId));
  if (!scan) { res.status(404).json({ error: "Scan not found" }); return; }

  const body = req.body as { landmarks?: unknown };
  if (!Array.isArray(body?.landmarks)) {
    res.status(400).json({ error: "landmarks array is required" });
    return;
  }

  const parsed = body.landmarks.map(parseLandmarkInput).filter(Boolean);
  if (parsed.length !== body.landmarks.length) {
    res.status(400).json({ error: "One or more landmarks have invalid shape" });
    return;
  }

  await db.delete(toothLandmarksTable).where(eq(toothLandmarksTable.scanId, scanId));

  if (parsed.length === 0) { res.json([]); return; }

  const rows = parsed.map((l) => ({
    scanId,
    toothId: l!.toothId,
    type: l!.type,
    position: l!.position,
    confidence: l!.confidence,
    isManual: l!.isManual,
    metadata: l!.metadata,
  }));

  const inserted = await db.insert(toothLandmarksTable).values(rows).returning();
  req.log.info({ scanId, count: inserted.length }, "Tooth landmarks saved");
  res.status(201).json(inserted);
});

router.patch("/landmarks/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const body = req.body as Record<string, unknown>;
  const updates: Partial<typeof toothLandmarksTable.$inferInsert> = {};
  if (isVec3(body.position)) updates.position = body.position as { x: number; y: number; z: number };
  if (typeof body.type === "string") updates.type = body.type;
  if (typeof body.confidence === "number") updates.confidence = Math.round(body.confidence);
  updates.isManual = true;

  const [updated] = await db
    .update(toothLandmarksTable)
    .set(updates)
    .where(eq(toothLandmarksTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Landmark not found" }); return; }
  res.json(updated);
});

router.delete("/scans/:scanId/landmarks", async (req, res): Promise<void> => {
  const scanId = parseInt(req.params.scanId, 10);
  if (isNaN(scanId)) { res.status(400).json({ error: "Invalid scanId" }); return; }
  await db.delete(toothLandmarksTable).where(eq(toothLandmarksTable.scanId, scanId));
  res.json({ success: true, message: "Landmarks deleted" });
});

export default router;
