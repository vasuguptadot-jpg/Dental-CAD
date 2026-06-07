import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db, scansTable, casesTable, patientsTable, activityTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.use(requireAuth);

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const uploadsDir = path.resolve(workspaceRoot, "artifacts/api-server/uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if ([".stl", ".obj", ".ply"].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only STL, OBJ, PLY files are allowed"));
    }
  },
});

router.get("/cases/:caseId/scans", async (req, res) => {
  const caseId = parseInt(String(req.params.caseId), 10);
  if (isNaN(caseId)) {
    res.status(400).json({ error: "Invalid case ID" });
    return;
  }

  const scans = await db.select().from(scansTable).where(eq(scansTable.caseId, caseId));
  res.json(scans.map(formatScan));
});

router.post("/cases/:caseId/scans/upload", upload.single("file"), async (req, res) => {
  const caseId = parseInt(String(req.params.caseId), 10);
  if (isNaN(caseId)) {
    res.status(400).json({ error: "Invalid case ID" });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const [existingCase] = await db.select().from(casesTable).where(eq(casesTable.id, caseId)).limit(1);
  if (!existingCase) {
    fs.unlinkSync(req.file.path);
    res.status(404).json({ error: "Case not found" });
    return;
  }

  const ext = path.extname(req.file.originalname).toLowerCase().slice(1) as "stl" | "obj" | "ply";
  const jawType = (Array.isArray(req.body.jawType) ? req.body.jawType[0] : req.body.jawType) as string || "both";

  const [scan] = await db.insert(scansTable).values({
    caseId,
    fileName: req.file.filename,
    originalName: req.file.originalname,
    fileType: ext,
    fileSize: req.file.size,
    jawType,
    filePath: req.file.path,
  }).returning();

  if (existingCase.status === "new") {
    await db.update(casesTable).set({ status: "scan_uploaded", updatedAt: new Date() }).where(eq(casesTable.id, caseId));
  }

  const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, existingCase.patientId)).limit(1);
  await db.insert(activityTable).values({
    type: "scan_uploaded",
    description: `Scan uploaded for case ${existingCase.caseCode}: ${req.file.originalname}`,
    patientName: patient?.fullName ?? null,
    caseCode: existingCase.caseCode,
    patientId: existingCase.patientId,
    caseId,
  });

  res.status(201).json(formatScan(scan));
});

router.get("/scans/:scanId", async (req, res) => {
  const scanId = parseInt(req.params.scanId, 10);
  if (isNaN(scanId)) {
    res.status(400).json({ error: "Invalid scan ID" });
    return;
  }

  const [scan] = await db.select().from(scansTable).where(eq(scansTable.id, scanId)).limit(1);
  if (!scan) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }

  res.json(formatScan(scan));
});

router.get("/scans/:scanId/file", async (req, res) => {
  const scanId = parseInt(req.params.scanId, 10);
  if (isNaN(scanId)) {
    res.status(400).json({ error: "Invalid scan ID" });
    return;
  }

  const [scan] = await db.select().from(scansTable).where(eq(scansTable.id, scanId)).limit(1);
  if (!scan) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }

  if (!fs.existsSync(scan.filePath)) {
    res.status(404).json({ error: "File not found on disk" });
    return;
  }

  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${scan.originalName}"`);
  res.sendFile(scan.filePath);
});

router.delete("/scans/:scanId", async (req, res) => {
  const scanId = parseInt(req.params.scanId, 10);
  if (isNaN(scanId)) {
    res.status(400).json({ error: "Invalid scan ID" });
    return;
  }

  const [scan] = await db.delete(scansTable).where(eq(scansTable.id, scanId)).returning();
  if (!scan) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }

  if (fs.existsSync(scan.filePath)) {
    fs.unlinkSync(scan.filePath);
  }

  res.json({ success: true, message: "Scan deleted" });
});

function formatScan(s: typeof scansTable.$inferSelect) {
  return {
    id: s.id,
    caseId: s.caseId,
    fileName: s.fileName,
    originalName: s.originalName,
    fileType: s.fileType,
    fileSize: s.fileSize,
    jawType: s.jawType,
    filePath: s.filePath,
    createdAt: s.createdAt.toISOString(),
  };
}

export default router;
