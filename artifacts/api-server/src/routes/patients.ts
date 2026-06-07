import { Router } from "express";
import { db, patientsTable, casesTable, activityTable } from "@workspace/db";
import { eq, ilike, or, sql, desc } from "drizzle-orm";
import { CreatePatientBody, UpdatePatientBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.use(requireAuth);

function generatePatientCode(): string {
  const num = Math.floor(Math.random() * 90000) + 10000;
  return `PT-${num}`;
}

router.get("/", async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10)));
  const offset = (page - 1) * limit;

  let query = db.select().from(patientsTable);
  let countQuery = db.select({ count: sql<number>`count(*)::int` }).from(patientsTable);

  if (search) {
    const cond = or(
      ilike(patientsTable.fullName, `%${search}%`),
      ilike(patientsTable.email, `%${search}%`),
      ilike(patientsTable.mobileNumber, `%${search}%`),
      ilike(patientsTable.patientCode, `%${search}%`)
    );
    query = query.where(cond) as typeof query;
    countQuery = countQuery.where(cond) as typeof countQuery;
  }

  const [patients, [{ count }]] = await Promise.all([
    query.orderBy(desc(patientsTable.createdAt)).limit(limit).offset(offset),
    countQuery,
  ]);

  res.json({ patients: patients.map(formatPatient), total: count, page, limit });
});

router.post("/", async (req, res) => {
  const parsed = CreatePatientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const patientCode = generatePatientCode();
  const [patient] = await db
    .insert(patientsTable)
    .values({ ...parsed.data, patientCode })
    .returning();

  await db.insert(activityTable).values({
    type: "patient_created",
    description: `New patient registered: ${patient.fullName}`,
    patientName: patient.fullName,
    patientId: patient.id,
  });

  res.status(201).json(formatPatient(patient));
});

router.get("/:patientId", async (req, res) => {
  const patientId = parseInt(req.params.patientId, 10);
  if (isNaN(patientId)) {
    res.status(400).json({ error: "Invalid patient ID" });
    return;
  }

  const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, patientId)).limit(1);
  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }

  res.json(formatPatient(patient));
});

router.patch("/:patientId", async (req, res) => {
  const patientId = parseInt(req.params.patientId, 10);
  if (isNaN(patientId)) {
    res.status(400).json({ error: "Invalid patient ID" });
    return;
  }

  const parsed = UpdatePatientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const [patient] = await db
    .update(patientsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(patientsTable.id, patientId))
    .returning();

  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }

  res.json(formatPatient(patient));
});

router.delete("/:patientId", async (req, res) => {
  const patientId = parseInt(req.params.patientId, 10);
  if (isNaN(patientId)) {
    res.status(400).json({ error: "Invalid patient ID" });
    return;
  }

  await db.delete(casesTable).where(eq(casesTable.patientId, patientId));
  const [deleted] = await db.delete(patientsTable).where(eq(patientsTable.id, patientId)).returning();

  if (!deleted) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }

  res.json({ success: true, message: "Patient deleted" });
});

function formatPatient(p: typeof patientsTable.$inferSelect) {
  return {
    id: p.id,
    patientCode: p.patientCode,
    fullName: p.fullName,
    age: p.age,
    gender: p.gender,
    mobileNumber: p.mobileNumber,
    email: p.email,
    address: p.address ?? null,
    notes: p.notes ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export default router;
