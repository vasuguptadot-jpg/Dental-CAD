import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, toothSegmentsTable, scansTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.use(requireAuth);

function isValidCentroid(v: unknown): v is { x: number; y: number; z: number } {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.x === "number" && typeof o.y === "number" && typeof o.z === "number";
}

function parseSegmentInput(raw: unknown): {
  toothId: number;
  label: string;
  color: string;
  faceIndices: number[];
  centroid: { x: number; y: number; z: number } | null;
  metadata: Record<string, unknown> | null;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;

  if (typeof s.toothId !== "number" || typeof s.label !== "string" || typeof s.color !== "string") {
    return null;
  }
  if (!Array.isArray(s.faceIndices)) return null;

  return {
    toothId: s.toothId,
    label: s.label,
    color: s.color,
    faceIndices: (s.faceIndices as unknown[]).filter((x): x is number => typeof x === "number"),
    centroid: isValidCentroid(s.centroid) ? s.centroid : null,
    metadata: s.metadata && typeof s.metadata === "object" && !Array.isArray(s.metadata)
      ? (s.metadata as Record<string, unknown>)
      : null,
  };
}

router.get("/scans/:scanId/segments", async (req, res): Promise<void> => {
  const scanId = parseInt(req.params.scanId, 10);
  if (isNaN(scanId)) {
    res.status(400).json({ error: "Invalid scanId" });
    return;
  }

  const [scan] = await db.select().from(scansTable).where(eq(scansTable.id, scanId));
  if (!scan) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }

  const segments = await db
    .select()
    .from(toothSegmentsTable)
    .where(eq(toothSegmentsTable.scanId, scanId))
    .orderBy(toothSegmentsTable.toothId);

  res.json(segments);
});

router.post("/scans/:scanId/segments", async (req, res): Promise<void> => {
  const scanId = parseInt(req.params.scanId, 10);
  if (isNaN(scanId)) {
    res.status(400).json({ error: "Invalid scanId" });
    return;
  }

  const [scan] = await db.select().from(scansTable).where(eq(scansTable.id, scanId));
  if (!scan) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }

  const body = req.body as { segments?: unknown };
  if (!Array.isArray(body?.segments)) {
    res.status(400).json({ error: "segments array is required" });
    return;
  }

  const parsed = body.segments.map(parseSegmentInput).filter(Boolean) as ReturnType<typeof parseSegmentInput>[];
  if (parsed.length !== body.segments.length) {
    res.status(400).json({ error: "One or more segments have invalid shape" });
    return;
  }

  await db.delete(toothSegmentsTable).where(eq(toothSegmentsTable.scanId, scanId));

  if (parsed.length === 0) {
    res.json([]);
    return;
  }

  const rows = parsed.map((s) => ({
    scanId,
    toothId: s!.toothId,
    label: s!.label,
    color: s!.color,
    faceIndices: s!.faceIndices,
    centroid: s!.centroid,
    metadata: s!.metadata,
  }));

  const inserted = await db.insert(toothSegmentsTable).values(rows).returning();
  req.log.info({ scanId, count: inserted.length }, "Tooth segments saved");
  res.status(201).json(inserted);
});

router.patch("/segments/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const updates: Partial<typeof toothSegmentsTable.$inferInsert> = {};
  if (typeof body.label === "string") updates.label = body.label;
  if (typeof body.color === "string") updates.color = body.color;
  if (typeof body.toothId === "number") updates.toothId = body.toothId;
  if (Array.isArray(body.faceIndices)) {
    updates.faceIndices = (body.faceIndices as unknown[]).filter((x): x is number => typeof x === "number");
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  const [updated] = await db
    .update(toothSegmentsTable)
    .set(updates)
    .where(eq(toothSegmentsTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Segment not found" });
    return;
  }

  res.json(updated);
});

router.delete("/scans/:scanId/segments", async (req, res): Promise<void> => {
  const scanId = parseInt(req.params.scanId, 10);
  if (isNaN(scanId)) {
    res.status(400).json({ error: "Invalid scanId" });
    return;
  }

  await db.delete(toothSegmentsTable).where(eq(toothSegmentsTable.scanId, scanId));
  res.json({ success: true, message: "Segments deleted" });
});

export default router;
