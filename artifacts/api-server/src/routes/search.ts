import { Router } from "express";
import { db, patientsTable, casesTable } from "@workspace/db";
import { ilike, or } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();
router.use(requireAuth);

router.get("/search", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q || q.length < 2) {
    res.json({ patients: [], cases: [] });
    return;
  }

  const [patients, cases] = await Promise.all([
    db
      .select({
        id: patientsTable.id,
        patientCode: patientsTable.patientCode,
        fullName: patientsTable.fullName,
        email: patientsTable.email,
      })
      .from(patientsTable)
      .where(
        or(
          ilike(patientsTable.fullName, `%${q}%`),
          ilike(patientsTable.email, `%${q}%`),
          ilike(patientsTable.patientCode, `%${q}%`),
          ilike(patientsTable.mobileNumber, `%${q}%`)
        )
      )
      .limit(5),
    db
      .select({
        id: casesTable.id,
        caseCode: casesTable.caseCode,
        title: casesTable.title,
        status: casesTable.status,
        patientId: casesTable.patientId,
      })
      .from(casesTable)
      .where(
        or(
          ilike(casesTable.title, `%${q}%`),
          ilike(casesTable.caseCode, `%${q}%`),
          ilike(casesTable.notes, `%${q}%`)
        )
      )
      .limit(5),
  ]);

  res.json({ patients, cases });
});

export default router;
