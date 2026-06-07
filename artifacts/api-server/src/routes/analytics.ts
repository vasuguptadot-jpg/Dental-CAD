import { Router } from "express";
import { db, patientsTable, casesTable, scansTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getRecentAuditEntries } from "../middleware/audit";

const router = Router();
router.use(requireAuth);

// Practice performance metrics
router.get("/metrics", async (_req, res) => {
  const now = new Date();
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const last90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const [
    [{ total }],
    [{ last30d }],
    [{ last90d }],
    scansByType,
    casesByStatus,
  ] = await Promise.all([
    db.select({ total: sql<number>`count(*)::int` }).from(patientsTable),
    db.select({ last30d: sql<number>`count(*)::int` })
      .from(patientsTable).where(sql`created_at >= ${last30.toISOString()}`),
    db.select({ last90d: sql<number>`count(*)::int` })
      .from(patientsTable).where(sql`created_at >= ${last90.toISOString()}`),
    db.select({
      jawType: scansTable.jawType,
      count: sql<number>`count(*)::int`,
    }).from(scansTable).groupBy(scansTable.jawType),
    db.select({
      status: casesTable.status,
      count: sql<number>`count(*)::int`,
    }).from(casesTable).groupBy(casesTable.status),
  ]);

  res.json({
    patients: { total, last30Days: last30d, last90Days: last90d },
    scansByJawType: scansByType,
    casesByStatus,
    systemHealth: {
      aiServices: ["segmentation", "landmark_detection", "ortho_analysis", "treatment_recommendation"],
      status: "operational",
      uptime: process.uptime(),
    },
  });
});

// Audit log endpoint
router.get("/audit-log", (_req, res) => {
  const limit = 100;
  const entries = getRecentAuditEntries(limit);
  res.json({ entries, total: entries.length, limit });
});

export default router;
