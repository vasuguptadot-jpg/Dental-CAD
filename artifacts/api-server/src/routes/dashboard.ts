import { Router, type IRouter } from "express";
import { sql, gte } from "drizzle-orm";
import { db, patientsTable, casesTable, activityTable } from "@workspace/db";
import { GetRecentActivityQueryParams } from "@workspace/api-zod";
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

router.get("/dashboard/stats", async (_req, res): Promise<void> => {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [
    totalPatientsResult,
    activeCasesResult,
    newCasesThisMonthResult,
    approvedCasesResult,
    manufacturingCasesResult,
    totalCasesResult,
  ] = await Promise.all([
    db.select({ count: sql<number>`cast(count(*) as int)` }).from(patientsTable),
    db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(casesTable)
      .where(
        sql`status NOT IN ('approved', 'manufacturing')`
      ),
    db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(casesTable)
      .where(gte(casesTable.createdAt, startOfMonth)),
    db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(casesTable)
      .where(sql`status = 'approved'`),
    db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(casesTable)
      .where(sql`status = 'manufacturing'`),
    db.select({ count: sql<number>`cast(count(*) as int)` }).from(casesTable),
  ]);

  const totalCases = totalCasesResult[0]?.count ?? 0;
  const approved = approvedCasesResult[0]?.count ?? 0;
  const manufacturing = manufacturingCasesResult[0]?.count ?? 0;
  const completionRate =
    totalCases > 0
      ? Math.round(((approved + manufacturing) / totalCases) * 100)
      : 0;

  res.json({
    totalPatients: totalPatientsResult[0]?.count ?? 0,
    activeCases: activeCasesResult[0]?.count ?? 0,
    newCasesThisMonth: newCasesThisMonthResult[0]?.count ?? 0,
    approvedCases: approved,
    manufacturingCases: manufacturing,
    completionRate,
  });
});

router.get("/dashboard/activity", async (req, res): Promise<void> => {
  const parsed = GetRecentActivityQueryParams.safeParse(req.query);
  const limit = parsed.success ? (parsed.data.limit ?? 10) : 10;

  const activities = await db
    .select()
    .from(activityTable)
    .orderBy(sql`${activityTable.createdAt} DESC`)
    .limit(limit);

  res.json(activities);
});

router.get("/dashboard/case-distribution", async (_req, res): Promise<void> => {
  const results = await db
    .select({
      status: casesTable.status,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(casesTable)
    .groupBy(casesTable.status);

  const distribution = Object.keys(STATUS_LABELS).map((status) => {
    const found = results.find((r) => r.status === status);
    return {
      status,
      count: found?.count ?? 0,
      label: STATUS_LABELS[status] ?? status,
    };
  });

  res.json(distribution);
});

export default router;
