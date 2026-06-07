import { Router } from "express";
import { db, casesTable, patientsTable, activityTable } from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";
import { CreateCaseBody, UpdateCaseBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.use(requireAuth);

function generateCaseCode(): string {
  const num = Math.floor(Math.random() * 90000) + 10000;
  return `OC-${num}`;
}

const VALID_STATUSES = ["new", "scan_uploaded", "analysis_completed", "treatment_planning", "approved", "manufacturing"];

router.get("/", async (req, res) => {
  const patientId = req.query.patientId ? parseInt(String(req.query.patientId), 10) : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10)));
  const offset = (page - 1) * limit;

  const conditions = [];
  if (patientId && !isNaN(patientId)) conditions.push(eq(casesTable.patientId, patientId));
  if (status && VALID_STATUSES.includes(status)) conditions.push(eq(casesTable.status, status));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [rawCases, [{ count }]] = await Promise.all([
    db.select({
      case: casesTable,
      patientName: patientsTable.fullName,
    })
      .from(casesTable)
      .leftJoin(patientsTable, eq(casesTable.patientId, patientsTable.id))
      .where(whereClause)
      .orderBy(desc(casesTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(casesTable).where(whereClause),
  ]);

  res.json({
    cases: rawCases.map(({ case: c, patientName }) => formatCase(c, patientName ?? null)),
    total: count,
    page,
    limit,
  });
});

router.post("/", async (req, res) => {
  const parsed = CreateCaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, parsed.data.patientId)).limit(1);
  if (!patient) {
    res.status(400).json({ error: "Patient not found" });
    return;
  }

  const caseCode = generateCaseCode();
  const [newCase] = await db
    .insert(casesTable)
    .values({ ...parsed.data, caseCode, status: "new" })
    .returning();

  await db.insert(activityTable).values({
    type: "case_created",
    description: `New case created: ${newCase.title}`,
    patientName: patient.fullName,
    caseCode: newCase.caseCode,
    patientId: patient.id,
    caseId: newCase.id,
  });

  res.status(201).json(formatCase(newCase, patient.fullName));
});

router.get("/:caseId", async (req, res) => {
  const caseId = parseInt(req.params.caseId, 10);
  if (isNaN(caseId)) {
    res.status(400).json({ error: "Invalid case ID" });
    return;
  }

  const [row] = await db
    .select({ case: casesTable, patientName: patientsTable.fullName })
    .from(casesTable)
    .leftJoin(patientsTable, eq(casesTable.patientId, patientsTable.id))
    .where(eq(casesTable.id, caseId))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Case not found" });
    return;
  }

  res.json(formatCase(row.case, row.patientName ?? null));
});

router.patch("/:caseId", async (req, res) => {
  const caseId = parseInt(req.params.caseId, 10);
  if (isNaN(caseId)) {
    res.status(400).json({ error: "Invalid case ID" });
    return;
  }

  const parsed = UpdateCaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const [existing] = await db.select().from(casesTable).where(eq(casesTable.id, caseId)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Case not found" });
    return;
  }

  const [updated] = await db
    .update(casesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(casesTable.id, caseId))
    .returning();

  if (parsed.data.status && parsed.data.status !== existing.status) {
    const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, updated.patientId)).limit(1);
    await db.insert(activityTable).values({
      type: "status_changed",
      description: `Case ${updated.caseCode} status changed to ${parsed.data.status.replace(/_/g, " ")}`,
      patientName: patient?.fullName ?? null,
      caseCode: updated.caseCode,
      patientId: updated.patientId,
      caseId: updated.id,
    });
  }

  const [row] = await db
    .select({ case: casesTable, patientName: patientsTable.fullName })
    .from(casesTable)
    .leftJoin(patientsTable, eq(casesTable.patientId, patientsTable.id))
    .where(eq(casesTable.id, caseId))
    .limit(1);

  res.json(formatCase(row.case, row.patientName ?? null));
});

router.delete("/:caseId", async (req, res) => {
  const caseId = parseInt(req.params.caseId, 10);
  if (isNaN(caseId)) {
    res.status(400).json({ error: "Invalid case ID" });
    return;
  }

  const [deleted] = await db.delete(casesTable).where(eq(casesTable.id, caseId)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Case not found" });
    return;
  }

  res.json({ success: true, message: "Case deleted" });
});

function formatCase(c: typeof casesTable.$inferSelect, patientName: string | null) {
  return {
    id: c.id,
    caseCode: c.caseCode,
    patientId: c.patientId,
    patientName,
    title: c.title,
    status: c.status,
    notes: c.notes ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export default router;
