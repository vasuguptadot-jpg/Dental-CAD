import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const photosTable = pgTable("photos", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull(),
  type: text("type").notNull(),
  fileName: text("file_name").notNull(),
  originalName: text("original_name").notNull(),
  filePath: text("file_path").notNull(),
  fileSize: integer("file_size").notNull(),
  notes: text("notes"),
  scanDate: text("scan_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Photo = typeof photosTable.$inferSelect;
