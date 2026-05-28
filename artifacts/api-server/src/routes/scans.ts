import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { createReadStream, existsSync } from "fs";
import { unlink } from "fs/promises";
import { db, scansTable } from "@workspace/db";
import { ListScansQueryParams, GetScanParams, DeleteScanParams, GetScanFileParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.resolve(__dirname, "../../uploads/scans");
const ALLOWED_EXTENSIONS = [".stl", ".obj", ".ply"];
const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `scan_${Date.now()}_${Math.random().toString(36).slice(2, 9)}${ext}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`));
    }
  },
});

const router: IRouter = Router();

router.use(requireAuth);

router.post("/scans/upload", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const caseId = parseInt(req.body.caseId, 10);
  const patientId = parseInt(req.body.patientId, 10);
  const jawType = req.body.jawType ?? "unknown";
  const notes = req.body.notes ?? null;

  if (isNaN(caseId) || isNaN(patientId)) {
    await unlink(req.file.path).catch(() => {});
    res.status(400).json({ error: "caseId and patientId are required" });
    return;
  }

  const ext = path.extname(req.file.originalname).toLowerCase().replace(".", "");

  const [scan] = await db
    .insert(scansTable)
    .values({
      caseId,
      patientId,
      filename: req.file.filename,
      originalName: req.file.originalname,
      fileType: ext,
      fileSize: req.file.size,
      jawType,
      notes,
    })
    .returning();

  req.log.info({ scanId: scan.id, caseId, fileType: ext }, "Scan uploaded");
  res.status(201).json(scan);
});

router.get("/scans", async (req, res): Promise<void> => {
  const parsed = ListScansQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const conditions = [];
  if (parsed.data.caseId) conditions.push(eq(scansTable.caseId, parsed.data.caseId));
  if (parsed.data.patientId) conditions.push(eq(scansTable.patientId, parsed.data.patientId));

  const scans = await db
    .select()
    .from(scansTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(scansTable.createdAt);

  res.json(scans);
});

router.get("/scans/:id", async (req, res): Promise<void> => {
  const params = GetScanParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [scan] = await db.select().from(scansTable).where(eq(scansTable.id, params.data.id));
  if (!scan) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }

  res.json(scan);
});

router.delete("/scans/:id", async (req, res): Promise<void> => {
  const params = DeleteScanParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [scan] = await db.delete(scansTable).where(eq(scansTable.id, params.data.id)).returning();
  if (!scan) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }

  const filePath = path.join(UPLOADS_DIR, scan.filename);
  if (existsSync(filePath)) {
    await unlink(filePath).catch((err) => logger.warn({ err }, "Failed to delete scan file"));
  }

  res.json({ success: true, message: "Scan deleted" });
});

router.get("/scans/:id/file", async (req, res): Promise<void> => {
  const params = GetScanFileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [scan] = await db.select().from(scansTable).where(eq(scansTable.id, params.data.id));
  if (!scan) {
    res.status(404).json({ error: "Scan not found" });
    return;
  }

  const filePath = path.join(UPLOADS_DIR, scan.filename);
  if (!existsSync(filePath)) {
    res.status(404).json({ error: "Scan file not found on disk" });
    return;
  }

  const contentTypes: Record<string, string> = {
    stl: "model/stl",
    obj: "text/plain",
    ply: "application/octet-stream",
  };

  res.setHeader("Content-Type", contentTypes[scan.fileType] ?? "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${scan.originalName}"`);
  res.setHeader("Content-Length", scan.fileSize.toString());

  createReadStream(filePath).pipe(res);
});

export default router;
