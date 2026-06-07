import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const scanAnalysisTable = pgTable("scan_analysis", {
  id: serial("id").primaryKey(),
  scanId: integer("scan_id").notNull().unique(),
  status: text("status").notNull().default("pending"),
  segmentationData: jsonb("segmentation_data"),
  landmarksData: jsonb("landmarks_data"),
  measurementsData: jsonb("measurements_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertScanAnalysisSchema = createInsertSchema(scanAnalysisTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertScanAnalysis = z.infer<typeof insertScanAnalysisSchema>;
export type ScanAnalysis = typeof scanAnalysisTable.$inferSelect;
