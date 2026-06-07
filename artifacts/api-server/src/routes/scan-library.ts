import { Router } from "express";
import { db, scansTable, casesTable, patientsTable, scanMetadataTable } from "@workspace/db";
import { eq, desc, sql, and, ilike, or } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();
router.use(requireAuth);

function qualityScore(fileSize: number, fileType: string): number {
  let base = 0.7;
  if (fileType === "stl") base = 0.85;
  if (fileType === "obj") base = 0.80;
  if (fileType === "ply") base = 0.88;
  const sizeFactor = Math.min(1, fileSize / (50 * 1024 * 1024));
  return Math.min(1, base + sizeFactor * 0.15);
}

function qualityLabel(score: number): string {
  if (score >= 0.9) return "Excellent";
  if (score >= 0.75) return "Good";
  if (score >= 0.55) return "Fair";
  return "Poor";
}

router.get("/scan-library", async (req, res) => {
  const search = req.query.search as string | undefined;
  const jawType = req.query.jawType as string | undefined;
  const fileType = req.query.fileType as string | undefined;
  const device = req.query.device as string | undefined;
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "24"), 10)));
  const offset = (page - 1) * limit;

  const conditions: any[] = [];
  if (jawType && jawType !== "all") conditions.push(eq(scansTable.jawType, jawType));
  if (fileType && fileType !== "all") conditions.push(eq(scansTable.fileType, fileType));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ count }]] = await Promise.all([
    db.select({
      scan: scansTable,
      meta: scanMetadataTable,
      patientName: patientsTable.fullName,
      caseCode: casesTable.caseCode,
    })
      .from(scansTable)
      .leftJoin(scanMetadataTable, eq(scansTable.id, scanMetadataTable.scanId))
      .leftJoin(casesTable, eq(scansTable.caseId, casesTable.id))
      .leftJoin(patientsTable, eq(casesTable.patientId, patientsTable.id))
      .where(where)
      .orderBy(desc(scansTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(scansTable).where(where),
  ]);

  const scans = rows
    .map(({ scan, meta, patientName, caseCode }) => {
      const qs = meta?.qualityScore ?? qualityScore(scan.fileSize, scan.fileType);
      const ql = meta?.qualityLabel ?? qualityLabel(qs);
      return {
        id: scan.id,
        caseId: scan.caseId,
        caseCode: caseCode ?? null,
        patientName: patientName ?? null,
        fileName: scan.fileName,
        originalName: scan.originalName,
        fileType: scan.fileType,
        fileSize: scan.fileSize,
        jawType: scan.jawType,
        deviceName: meta?.deviceName ?? null,
        deviceModel: meta?.deviceModel ?? null,
        scanDate: meta?.scanDate ? meta.scanDate.toISOString() : scan.createdAt.toISOString(),
        qualityScore: Math.round(qs * 100),
        qualityLabel: ql,
        pairedScanId: meta?.pairedScanId ?? null,
        notes: meta?.notes ?? null,
        createdAt: scan.createdAt.toISOString(),
      };
    })
    .filter(s => {
      if (search) {
        const q = search.toLowerCase();
        return (
          s.originalName.toLowerCase().includes(q) ||
          (s.patientName ?? "").toLowerCase().includes(q) ||
          (s.caseCode ?? "").toLowerCase().includes(q) ||
          (s.deviceName ?? "").toLowerCase().includes(q)
        );
      }
      if (device) return (s.deviceName ?? "").toLowerCase().includes(device.toLowerCase());
      return true;
    });

  res.json({ scans, total: count, page, limit });
});

router.get("/scan-library/stats", async (_req, res) => {
  const [totalRow] = await db.select({ count: sql<number>`count(*)::int` }).from(scansTable);
  const byType = await db.select({
    fileType: scansTable.fileType,
    count: sql<number>`count(*)::int`,
  }).from(scansTable).groupBy(scansTable.fileType);
  const byJaw = await db.select({
    jawType: scansTable.jawType,
    count: sql<number>`count(*)::int`,
  }).from(scansTable).groupBy(scansTable.jawType);

  res.json({
    total: totalRow?.count ?? 0,
    byFileType: byType,
    byJawType: byJaw,
  });
});

router.patch("/scan-library/:scanId/metadata", async (req, res) => {
  const scanId = parseInt(req.params.scanId, 10);
  if (isNaN(scanId)) { res.status(400).json({ error: "Invalid scan ID" }); return; }

  const { deviceName, deviceModel, scanDate, pairedScanId, notes } = req.body;

  const [scan] = await db.select().from(scansTable).where(eq(scansTable.id, scanId)).limit(1);
  if (!scan) { res.status(404).json({ error: "Scan not found" }); return; }

  const qs = qualityScore(scan.fileSize, scan.fileType);
  const ql = qualityLabel(qs);

  const existing = await db.select().from(scanMetadataTable).where(eq(scanMetadataTable.scanId, scanId)).limit(1);

  let meta;
  if (existing.length > 0) {
    [meta] = await db.update(scanMetadataTable)
      .set({ deviceName, deviceModel, scanDate: scanDate ? new Date(scanDate) : null, pairedScanId, notes, updatedAt: new Date() })
      .where(eq(scanMetadataTable.scanId, scanId))
      .returning();
  } else {
    [meta] = await db.insert(scanMetadataTable)
      .values({ scanId, deviceName, deviceModel, scanDate: scanDate ? new Date(scanDate) : null, qualityScore: qs, qualityLabel: ql, pairedScanId, notes })
      .returning();
  }

  res.json({
    scanId: meta.scanId,
    deviceName: meta.deviceName,
    deviceModel: meta.deviceModel,
    scanDate: meta.scanDate ? meta.scanDate.toISOString() : null,
    qualityScore: Math.round((meta.qualityScore ?? qs) * 100),
    qualityLabel: meta.qualityLabel ?? ql,
    pairedScanId: meta.pairedScanId,
    notes: meta.notes,
  });
});

router.post("/scan-library/pair", async (req, res) => {
  const { scanId1, scanId2 } = req.body;
  if (!scanId1 || !scanId2) { res.status(400).json({ error: "scanId1 and scanId2 required" }); return; }

  const [s1] = await db.select().from(scansTable).where(eq(scansTable.id, scanId1)).limit(1);
  const [s2] = await db.select().from(scansTable).where(eq(scansTable.id, scanId2)).limit(1);
  if (!s1 || !s2) { res.status(404).json({ error: "One or both scans not found" }); return; }

  const upsertMeta = async (scanId: number, pairedWith: number) => {
    const existing = await db.select().from(scanMetadataTable).where(eq(scanMetadataTable.scanId, scanId)).limit(1);
    const qs = qualityScore(s1.fileSize, s1.fileType);
    const ql = qualityLabel(qs);
    if (existing.length > 0) {
      await db.update(scanMetadataTable).set({ pairedScanId: pairedWith, updatedAt: new Date() }).where(eq(scanMetadataTable.scanId, scanId));
    } else {
      await db.insert(scanMetadataTable).values({ scanId, pairedScanId: pairedWith, qualityScore: qs, qualityLabel: ql });
    }
  };

  await Promise.all([upsertMeta(scanId1, scanId2), upsertMeta(scanId2, scanId1)]);
  res.json({ success: true, pairedScanId1: scanId1, pairedScanId2: scanId2 });
});

export default router;
