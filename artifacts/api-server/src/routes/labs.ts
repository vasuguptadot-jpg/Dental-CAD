import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  db, labsTable, labOrdersTable, labOrderFilesTable, labMessagesTable,
  casesTable, patientsTable,
} from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();
router.use(requireAuth);

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const labUploadsDir = path.resolve(workspaceRoot, "artifacts/api-server/uploads/lab-files");
fs.mkdirSync(labUploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, labUploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

function generateOrderCode(): string {
  const num = Math.floor(Math.random() * 90000) + 10000;
  return `LO-${num}`;
}

function formatLab(l: typeof labsTable.$inferSelect) {
  return {
    id: l.id,
    name: l.name,
    contactName: l.contactName ?? null,
    email: l.email ?? null,
    phone: l.phone ?? null,
    address: l.address ?? null,
    specialties: l.specialties ?? [],
    turnaroundDays: l.turnaroundDays,
    notes: l.notes ?? null,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

function formatOrder(o: typeof labOrdersTable.$inferSelect, extras: {
  labName?: string | null;
  patientName?: string | null;
  caseCode?: string | null;
  fileCount?: number;
  messageCount?: number;
} = {}) {
  return {
    id: o.id,
    orderCode: o.orderCode,
    labId: o.labId,
    labName: extras.labName ?? null,
    caseId: o.caseId,
    patientName: extras.patientName ?? null,
    caseCode: extras.caseCode ?? null,
    type: o.type,
    status: o.status,
    priority: o.priority,
    dueDate: o.dueDate ? o.dueDate.toISOString() : null,
    instructions: o.instructions ?? null,
    specs: o.specs ?? null,
    fileCount: extras.fileCount ?? 0,
    messageCount: extras.messageCount ?? 0,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

/* ─── Labs CRUD ─── */

router.get("/labs", async (_req, res) => {
  const labs = await db.select().from(labsTable).orderBy(desc(labsTable.createdAt));
  res.json({ labs: labs.map(formatLab) });
});

router.post("/labs", async (req, res) => {
  const { name, contactName, email, phone, address, specialties, turnaroundDays, notes } = req.body;
  if (!name) { res.status(400).json({ error: "Lab name is required" }); return; }
  const [lab] = await db.insert(labsTable).values({
    name, contactName, email, phone, address,
    specialties: specialties ?? [],
    turnaroundDays: turnaroundDays ?? 7,
    notes,
  }).returning();
  res.status(201).json(formatLab(lab));
});

router.patch("/labs/:labId", async (req, res) => {
  const labId = parseInt(req.params.labId, 10);
  if (isNaN(labId)) { res.status(400).json({ error: "Invalid lab ID" }); return; }
  const { name, contactName, email, phone, address, specialties, turnaroundDays, notes } = req.body;
  const [lab] = await db.update(labsTable)
    .set({ name, contactName, email, phone, address, specialties, turnaroundDays, notes, updatedAt: new Date() })
    .where(eq(labsTable.id, labId))
    .returning();
  if (!lab) { res.status(404).json({ error: "Lab not found" }); return; }
  res.json(formatLab(lab));
});

router.delete("/labs/:labId", async (req, res) => {
  const labId = parseInt(req.params.labId, 10);
  if (isNaN(labId)) { res.status(400).json({ error: "Invalid lab ID" }); return; }
  const [deleted] = await db.delete(labsTable).where(eq(labsTable.id, labId)).returning();
  if (!deleted) { res.status(404).json({ error: "Lab not found" }); return; }
  res.json({ success: true });
});

/* ─── Lab Orders ─── */

router.get("/lab-orders", async (req, res) => {
  const labId = req.query.labId ? parseInt(String(req.query.labId), 10) : undefined;
  const status = req.query.status as string | undefined;
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10)));
  const offset = (page - 1) * limit;

  const conditions: any[] = [];
  if (labId && !isNaN(labId)) conditions.push(eq(labOrdersTable.labId, labId));
  if (status) conditions.push(eq(labOrdersTable.status, status));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ count }]] = await Promise.all([
    db.select({
      order: labOrdersTable,
      labName: labsTable.name,
      patientName: patientsTable.fullName,
      caseCode: casesTable.caseCode,
    })
      .from(labOrdersTable)
      .leftJoin(labsTable, eq(labOrdersTable.labId, labsTable.id))
      .leftJoin(casesTable, eq(labOrdersTable.caseId, casesTable.id))
      .leftJoin(patientsTable, eq(casesTable.patientId, patientsTable.id))
      .where(where)
      .orderBy(desc(labOrdersTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(labOrdersTable).where(where),
  ]);

  const orderIds = rows.map(r => r.order.id);
  let fileCounts: Record<number, number> = {};
  let msgCounts: Record<number, number> = {};

  if (orderIds.length > 0) {
    const fcRows = await db.select({
      orderId: labOrderFilesTable.orderId,
      cnt: sql<number>`count(*)::int`,
    }).from(labOrderFilesTable).where(sql`${labOrderFilesTable.orderId} = ANY(${orderIds})`).groupBy(labOrderFilesTable.orderId);

    const mcRows = await db.select({
      orderId: labMessagesTable.orderId,
      cnt: sql<number>`count(*)::int`,
    }).from(labMessagesTable).where(sql`${labMessagesTable.orderId} = ANY(${orderIds})`).groupBy(labMessagesTable.orderId);

    fcRows.forEach(r => { fileCounts[r.orderId] = r.cnt; });
    mcRows.forEach(r => { msgCounts[r.orderId] = r.cnt; });
  }

  res.json({
    orders: rows.map(({ order, labName, patientName, caseCode }) =>
      formatOrder(order, { labName, patientName, caseCode, fileCount: fileCounts[order.id] ?? 0, messageCount: msgCounts[order.id] ?? 0 })
    ),
    total: count,
    page,
    limit,
  });
});

router.post("/lab-orders", async (req, res) => {
  const { labId, caseId, type, priority, dueDate, instructions, specs } = req.body;
  if (!labId || !caseId) { res.status(400).json({ error: "labId and caseId are required" }); return; }

  const [existingCase] = await db.select().from(casesTable).where(eq(casesTable.id, caseId)).limit(1);
  if (!existingCase) { res.status(404).json({ error: "Case not found" }); return; }

  const [lab] = await db.select().from(labsTable).where(eq(labsTable.id, labId)).limit(1);
  if (!lab) { res.status(404).json({ error: "Lab not found" }); return; }

  const [order] = await db.insert(labOrdersTable).values({
    orderCode: generateOrderCode(),
    labId, caseId,
    type: type ?? "aligner",
    status: "pending",
    priority: priority ?? "normal",
    dueDate: dueDate ? new Date(dueDate) : null,
    instructions,
    specs,
  }).returning();

  const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, existingCase.patientId)).limit(1);

  res.status(201).json(formatOrder(order, {
    labName: lab.name,
    patientName: patient?.fullName ?? null,
    caseCode: existingCase.caseCode,
    fileCount: 0,
    messageCount: 0,
  }));
});

router.get("/lab-orders/:orderId", async (req, res) => {
  const orderId = parseInt(req.params.orderId, 10);
  if (isNaN(orderId)) { res.status(400).json({ error: "Invalid order ID" }); return; }

  const [row] = await db.select({
    order: labOrdersTable,
    labName: labsTable.name,
    patientName: patientsTable.fullName,
    caseCode: casesTable.caseCode,
  })
    .from(labOrdersTable)
    .leftJoin(labsTable, eq(labOrdersTable.labId, labsTable.id))
    .leftJoin(casesTable, eq(labOrdersTable.caseId, casesTable.id))
    .leftJoin(patientsTable, eq(casesTable.patientId, patientsTable.id))
    .where(eq(labOrdersTable.id, orderId))
    .limit(1);

  if (!row) { res.status(404).json({ error: "Order not found" }); return; }

  const [files, messages] = await Promise.all([
    db.select().from(labOrderFilesTable).where(eq(labOrderFilesTable.orderId, orderId)).orderBy(desc(labOrderFilesTable.createdAt)),
    db.select().from(labMessagesTable).where(eq(labMessagesTable.orderId, orderId)).orderBy(labMessagesTable.createdAt),
  ]);

  res.json({
    ...formatOrder(row.order, {
      labName: row.labName, patientName: row.patientName, caseCode: row.caseCode,
      fileCount: files.length, messageCount: messages.length,
    }),
    files: files.map(f => ({
      id: f.id, orderId: f.orderId, direction: f.direction,
      fileName: f.fileName, originalName: f.originalName,
      fileType: f.fileType, fileSize: f.fileSize,
      createdAt: f.createdAt.toISOString(),
    })),
    messages: messages.map(m => ({
      id: m.id, orderId: m.orderId, senderType: m.senderType,
      senderName: m.senderName, content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});

router.patch("/lab-orders/:orderId", async (req, res) => {
  const orderId = parseInt(req.params.orderId, 10);
  if (isNaN(orderId)) { res.status(400).json({ error: "Invalid order ID" }); return; }

  const { status, priority, dueDate, instructions, specs } = req.body;
  const [order] = await db.update(labOrdersTable)
    .set({ status, priority, dueDate: dueDate ? new Date(dueDate) : undefined, instructions, specs, updatedAt: new Date() })
    .where(eq(labOrdersTable.id, orderId))
    .returning();
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  res.json(formatOrder(order));
});

/* ─── Order Files ─── */

router.post("/lab-orders/:orderId/files", upload.single("file"), async (req, res) => {
  const orderId = parseInt(req.params.orderId, 10);
  if (isNaN(orderId)) { res.status(400).json({ error: "Invalid order ID" }); return; }
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }

  const [order] = await db.select().from(labOrdersTable).where(eq(labOrdersTable.id, orderId)).limit(1);
  if (!order) {
    fs.unlinkSync(req.file.path);
    res.status(404).json({ error: "Order not found" }); return;
  }

  const ext = path.extname(req.file.originalname).toLowerCase().slice(1);
  const direction = req.body.direction === "incoming" ? "incoming" : "outgoing";

  const [file] = await db.insert(labOrderFilesTable).values({
    orderId,
    direction,
    fileName: req.file.filename,
    originalName: req.file.originalname,
    fileType: ext,
    fileSize: req.file.size,
    filePath: req.file.path,
  }).returning();

  res.status(201).json({
    id: file.id, orderId: file.orderId, direction: file.direction,
    fileName: file.fileName, originalName: file.originalName,
    fileType: file.fileType, fileSize: file.fileSize,
    createdAt: file.createdAt.toISOString(),
  });
});

router.get("/lab-orders/:orderId/files/:fileId/download", async (req, res) => {
  const fileId = parseInt(req.params.fileId, 10);
  if (isNaN(fileId)) { res.status(400).json({ error: "Invalid file ID" }); return; }

  const [file] = await db.select().from(labOrderFilesTable).where(eq(labOrderFilesTable.id, fileId)).limit(1);
  if (!file) { res.status(404).json({ error: "File not found" }); return; }
  if (!fs.existsSync(file.filePath)) { res.status(404).json({ error: "File not found on disk" }); return; }

  res.setHeader("Content-Disposition", `attachment; filename="${file.originalName}"`);
  res.sendFile(file.filePath);
});

/* ─── Order Messages ─── */

router.post("/lab-orders/:orderId/messages", async (req, res) => {
  const orderId = parseInt(req.params.orderId, 10);
  if (isNaN(orderId)) { res.status(400).json({ error: "Invalid order ID" }); return; }

  const { content, senderType, senderName } = req.body;
  if (!content || !senderName) { res.status(400).json({ error: "content and senderName required" }); return; }

  const [order] = await db.select().from(labOrdersTable).where(eq(labOrdersTable.id, orderId)).limit(1);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }

  const [msg] = await db.insert(labMessagesTable).values({
    orderId, senderType: senderType ?? "clinic", senderName, content,
  }).returning();

  res.status(201).json({
    id: msg.id, orderId: msg.orderId, senderType: msg.senderType,
    senderName: msg.senderName, content: msg.content,
    createdAt: msg.createdAt.toISOString(),
  });
});

export default router;
