import { pgTable, text, serial, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { scansTable } from "./scans";

export const toothLandmarksTable = pgTable("tooth_landmarks", {
  id: serial("id").primaryKey(),
  scanId: integer("scan_id").notNull().references(() => scansTable.id, { onDelete: "cascade" }),
  toothId: integer("tooth_id").notNull(),
  type: text("type").notNull(),
  position: jsonb("position").notNull().$type<{ x: number; y: number; z: number }>(),
  confidence: integer("confidence").notNull().default(100),
  isManual: boolean("is_manual").notNull().default(false),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type ToothLandmarkRow = typeof toothLandmarksTable.$inferSelect;
