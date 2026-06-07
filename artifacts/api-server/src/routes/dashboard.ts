import { Router } from "express";
import { db, patientsTable, casesTable, scansTable, activityTable } from "@workspace/db";
import { sql, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.use(requireAuth);

router.get("/stats", async (_req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [[{ totalPatients }], [{ totalCases }], [{ activeCases }], [{ newCasesThisMonth }], [{ scansUploaded }]] =
    await Promise.all([
      db.select({ totalPatients: sql<number>`count(*)::int` }).from(patientsTable),
      db.select({ totalCases: sql<number>`count(*)::int` }).from(casesTable),
      db.select({ activeCases: sql<number>`count(*)::int` })
        .from(casesTable)
        .where(sql`status NOT IN ('approved', 'manufacturing')`),
      db.select({ newCasesThisMonth: sql<number>`count(*)::int` })
        .from(casesTable)
        .where(sql`created_at >= ${startOfMonth.toISOString()}`),
      db.select({ scansUploaded: sql<number>`count(*)::int` }).from(scansTable),
    ]);

  res.json({ totalPatients, activeCases, totalCases, newCasesThisMonth, scansUploaded });
});

router.get("/activity", async (req, res) => {
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "10"), 10)));

  const items = await db
    .select()
    .from(activityTable)
    .orderBy(desc(activityTable.createdAt))
    .limit(limit);

  res.json(
    items.map((item) => ({
      id: item.id,
      type: item.type,
      description: item.description,
      patientName: item.patientName ?? null,
      caseCode: item.caseCode ?? null,
      createdAt: item.createdAt.toISOString(),
    }))
  );
});

router.get("/case-status-breakdown", async (_req, res) => {
  const rows = await db
    .select({
      status: casesTable.status,
      count: sql<number>`count(*)::int`,
    })
    .from(casesTable)
    .groupBy(casesTable.status);

  res.json(rows.map((r) => ({ status: r.status, count: r.count })));
});

export default router;
