import { pgTable, text, serial, integer, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const scanMetadataTable = pgTable("scan_metadata", {
  id: serial("id").primaryKey(),
  scanId: integer("scan_id").notNull().unique(),
  deviceName: text("device_name"),
  deviceModel: text("device_model"),
  scanDate: timestamp("scan_date", { withTimezone: true }),
  qualityScore: real("quality_score"),
  qualityLabel: text("quality_label"),
  pointCount: integer("point_count"),
  pairedScanId: integer("paired_scan_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertScanMetadataSchema = createInsertSchema(scanMetadataTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertScanMetadata = z.infer<typeof insertScanMetadataSchema>;
export type ScanMetadata = typeof scanMetadataTable.$inferSelect;
