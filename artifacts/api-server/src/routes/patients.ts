import { Router, type IRouter } from "express";
import { eq, ilike, or, sql } from "drizzle-orm";
import { db, patientsTable, activityTable } from "@workspace/db";
import {
  ListPatientsQueryParams,
  CreatePatientBody,
  GetPatientParams,
  UpdatePatientParams,
  UpdatePatientBody,
  DeletePatientParams,
} from "@workspace/api-zod";
import { generatePatientCode } from "../lib/auth";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.use(requireAuth);

router.get("/patients", async (req, res): Promise<void> => {
  const parsed = ListPatientsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { search, page = 1, limit = 20 } = parsed.data;
  const offset = (page - 1) * limit;

  let query = db.select().from(patientsTable);

  if (search) {
    query = query.where(
      or(
        ilike(patientsTable.fullName, `%${search}%`),
        ilike(patientsTable.patientCode, `%${search}%`),
        ilike(patientsTable.mobileNumber, `%${search}%`)
      )
    ) as typeof query;
  }

  const [countResult, patients] = await Promise.all([
    db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(patientsTable)
      .where(
        search
          ? or(
              ilike(patientsTable.fullName, `%${search}%`),
              ilike(patientsTable.patientCode, `%${search}%`),
              ilike(patientsTable.mobileNumber, `%${search}%`)
            )
          : undefined
      ),
    query.limit(limit).offset(offset).orderBy(patientsTable.createdAt),
  ]);

  res.json({
    patients,
    total: countResult[0]?.count ?? 0,
    page,
    limit,
  });
});

router.post("/patients", async (req, res): Promise<void> => {
  const parsed = CreatePatientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
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

  res.status(201).json(patient);
});

router.get("/patients/:id", async (req, res): Promise<void> => {
  const params = GetPatientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { casesTable } = await import("@workspace/db");
  const patient = await db.query.patientsTable.findFirst({
    where: eq(patientsTable.id, params.data.id),
  });

  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }

  const cases = await db
    .select()
    .from(casesTable)
    .where(eq(casesTable.patientId, params.data.id))
    .orderBy(casesTable.createdAt);

  res.json({ ...patient, cases });
});

router.patch("/patients/:id", async (req, res): Promise<void> => {
  const params = UpdatePatientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdatePatientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [patient] = await db
    .update(patientsTable)
    .set(parsed.data)
    .where(eq(patientsTable.id, params.data.id))
    .returning();

  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }

  await db.insert(activityTable).values({
    type: "patient_updated",
    description: `Patient record updated: ${patient.fullName}`,
    patientName: patient.fullName,
    patientId: patient.id,
  });

  res.json(patient);
});

router.delete("/patients/:id", async (req, res): Promise<void> => {
  const params = DeletePatientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [patient] = await db
    .delete(patientsTable)
    .where(eq(patientsTable.id, params.data.id))
    .returning();

  if (!patient) {
    res.status(404).json({ error: "Patient not found" });
    return;
  }

  res.json({ success: true, message: "Patient deleted" });
});

export default router;
