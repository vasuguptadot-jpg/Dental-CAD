import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db, photosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();
router.use(requireAuth);

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const photosDir = path.resolve(workspaceRoot, "artifacts/api-server/uploads/photos");
fs.mkdirSync(photosDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, photosDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".webp", ".pdf"].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPG, PNG, WebP, and PDF files are allowed"));
    }
  },
});

router.get("/cases/:caseId/photos", async (req, res) => {
  const caseId = parseInt(req.params.caseId, 10);
  if (isNaN(caseId)) { res.status(400).json({ error: "Invalid case ID" }); return; }
  const photos = await db.select().from(photosTable).where(eq(photosTable.caseId, caseId));
  res.json(photos);
});

router.post("/cases/:caseId/photos/upload", upload.single("file"), async (req, res) => {
  const caseId = parseInt(req.params.caseId, 10);
  if (isNaN(caseId)) { res.status(400).json({ error: "Invalid case ID" }); return; }
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }

  const type = typeof req.body.type === "string" ? req.body.type : "intraoral";
  const notes = typeof req.body.notes === "string" ? req.body.notes : null;
  const scanDate = typeof req.body.scanDate === "string" ? req.body.scanDate : null;

  const [photo] = await db.insert(photosTable).values({
    caseId,
    type,
    fileName: req.file.filename,
    originalName: req.file.originalname,
    filePath: req.file.path,
    fileSize: req.file.size,
    notes,
    scanDate,
  }).returning();

  res.status(201).json(photo);
});

router.get("/photos/:photoId/file", async (req, res) => {
  const photoId = parseInt(req.params.photoId, 10);
  if (isNaN(photoId)) { res.status(400).json({ error: "Invalid photo ID" }); return; }

  const [photo] = await db.select().from(photosTable).where(eq(photosTable.id, photoId)).limit(1);
  if (!photo) { res.status(404).json({ error: "Photo not found" }); return; }

  if (!fs.existsSync(photo.filePath)) { res.status(404).json({ error: "File not found on disk" }); return; }

  res.sendFile(photo.filePath);
});

router.delete("/photos/:photoId", async (req, res) => {
  const photoId = parseInt(req.params.photoId, 10);
  if (isNaN(photoId)) { res.status(400).json({ error: "Invalid photo ID" }); return; }

  const [photo] = await db.delete(photosTable).where(eq(photosTable.id, photoId)).returning();
  if (!photo) { res.status(404).json({ error: "Photo not found" }); return; }

  try { fs.unlinkSync(photo.filePath); } catch { /* ignore */ }
  res.json({ success: true });
});

export default router;
