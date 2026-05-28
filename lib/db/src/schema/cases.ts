import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { patientsTable } from "./patients";

export const casesTable = pgTable("cases", {
  id: serial("id").primaryKey(),
  caseCode: text("case_code").notNull().unique(),
  patientId: integer("patient_id").notNull().references(() => patientsTable.id, { onDelete: "cascade" }),
  title: text("title"),
  description: text("description"),
  status: text("status").notNull().default("new"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCaseSchema = createInsertSchema(casesTable).omit({ id: true, caseCode: true, createdAt: true, updatedAt: true });
export type InsertCase = z.infer<typeof insertCaseSchema>;
export type OrthoCase = typeof casesTable.$inferSelect;
