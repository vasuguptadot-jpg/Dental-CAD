import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { scansTable } from "./scans";

export const toothSegmentsTable = pgTable("tooth_segments", {
  id: serial("id").primaryKey(),
  scanId: integer("scan_id").notNull().references(() => scansTable.id, { onDelete: "cascade" }),
  toothId: integer("tooth_id").notNull(),
  label: text("label").notNull(),
  color: text("color").notNull(),
  faceIndices: jsonb("face_indices").notNull().$type<number[]>(),
  centroid: jsonb("centroid").$type<{ x: number; y: number; z: number } | null>(),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertToothSegmentSchema = createInsertSchema(toothSegmentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertToothSegment = z.infer<typeof insertToothSegmentSchema>;
export type ToothSegment = typeof toothSegmentsTable.$inferSelect;
