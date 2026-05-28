import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, casesTable, patientsTable, activityTable } from "@workspace/db";
import {
  ListCasesQueryParams,
  CreateCaseBody,
  GetCaseParams,
  UpdateCaseParams,
  UpdateCaseBody,
  DeleteCaseParams,
  UpdateCaseStatusParams,
  UpdateCaseStatusBody,
} from "@workspace/api-zod";
import { generateCaseCode } from "../lib/auth";
import { requireAuth } from "../middlewares/requireAuth";

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  scan_uploaded: "Scan Uploaded",
  analysis_completed: "Analysis Completed",
  treatment_planning: "Treatment Planning",
  approved: "Approved",
  manufacturing: "Manufacturing",
};

const router: IRouter = Router();

router.use(requireAuth);

router.get("/cases", async (req, res): Promise<void> => {
  const parsed = ListCasesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { patientId, status, page = 1, limit = 20 } = parsed.data;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (patientId) conditions.push(eq(casesTable.patientId, patientId));
  if (status) conditions.push(eq(casesTable.status, status));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult, rows] = await Promise.all([
    db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(casesTable)
      .where(whereClause),
    db
      .select({
        id: casesTable.id,
        caseCode: casesTable.caseCode,
        patientId: casesTable.patientId,
        patientName: patientsTable.fullName,
        title: casesTable.title,
        description: casesTable.description,
        status: casesTable.status,
        notes: casesTable.notes,
        createdAt: casesTable.createdAt,
        updatedAt: casesTable.updatedAt,
      })
      .from(casesTable)
      .leftJoin(patientsTable, eq(casesTable.patientId, patientsTable.id))
      .where(whereClause)
      .limit(limit)
      .offset(offset)
      .orderBy(casesTable.createdAt),
  ]);

  res.json({
    cases: rows,
    total: countResult[0]?.count ?? 0,
    page,
    limit,
  });
});

router.post("/cases", async (req, res): Promise<void> => {
  const parsed = CreateCaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [patient] = await db
    .select()
    .from(patientsTable)
    .where(eq(patientsTable.id, parsed.data.patientId));

  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }

  const caseCode = generateCaseCode();

  const [newCase] = await db
    .insert(casesTable)
    .values({ ...parsed.data, caseCode, status: "new" })
    .returning();

  await db.insert(activityTable).values({
    type: "case_created",
    description: `New case created for ${patient.fullName}: ${newCase.title ?? caseCode}`,
    patientName: patient.fullName,
    caseCode: newCase.caseCode,
    patientId: patient.id,
    caseId: newCase.id,
  });

  res.status(201).json({ ...newCase, patientName: patient.fullName });
});

router.get("/cases/:id", async (req, res): Promise<void> => {
  const params = GetCaseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [row] = await db
    .select({
      id: casesTable.id,
      caseCode: casesTable.caseCode,
      patientId: casesTable.patientId,
      patientName: patientsTable.fullName,
      title: casesTable.title,
      description: casesTable.description,
      status: casesTable.status,
      notes: casesTable.notes,
      createdAt: casesTable.createdAt,
      updatedAt: casesTable.updatedAt,
    })
    .from(casesTable)
    .leftJoin(patientsTable, eq(casesTable.patientId, patientsTable.id))
    .where(eq(casesTable.id, params.data.id));

  if (!row) {
    res.status(404).json({ error: "Case not found" });
    return;
  }

  res.json(row);
});

router.patch("/cases/:id", async (req, res): Promise<void> => {
  const params = UpdateCaseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateCaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [updated] = await db
    .update(casesTable)
    .set(parsed.data)
    .where(eq(casesTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Case not found" });
    return;
  }

  const [patient] = await db
    .select()
    .from(patientsTable)
    .where(eq(patientsTable.id, updated.patientId));

  res.json({ ...updated, patientName: patient?.fullName ?? null });
});

router.delete("/cases/:id", async (req, res): Promise<void> => {
  const params = DeleteCaseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(casesTable)
    .where(eq(casesTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Case not found" });
    return;
  }

  res.json({ success: true, message: "Case deleted" });
});

router.patch("/cases/:id/status", async (req, res): Promise<void> => {
  const params = UpdateCaseStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateCaseStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [updated] = await db
    .update(casesTable)
    .set({ status: parsed.data.status })
    .where(eq(casesTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Case not found" });
    return;
  }

  const [patient] = await db
    .select()
    .from(patientsTable)
    .where(eq(patientsTable.id, updated.patientId));

  await db.insert(activityTable).values({
    type: "status_changed",
    description: `Case ${updated.caseCode} status changed to ${STATUS_LABELS[parsed.data.status] ?? parsed.data.status}`,
    patientName: patient?.fullName ?? null,
    caseCode: updated.caseCode,
    patientId: patient?.id,
    caseId: updated.id,
  });

  res.json({ ...updated, patientName: patient?.fullName ?? null });
});

export default router;
