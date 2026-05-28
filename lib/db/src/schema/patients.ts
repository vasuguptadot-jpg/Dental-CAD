import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const patientsTable = pgTable("patients", {
  id: serial("id").primaryKey(),
  patientCode: text("patient_code").notNull().unique(),
  fullName: text("full_name").notNull(),
  age: integer("age").notNull(),
  gender: text("gender").notNull(),
  mobileNumber: text("mobile_number").notNull(),
  email: text("email"),
  address: text("address"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPatientSchema = createInsertSchema(patientsTable).omit({ id: true, patientCode: true, createdAt: true, updatedAt: true });
export type InsertPatient = z.infer<typeof insertPatientSchema>;
export type Patient = typeof patientsTable.$inferSelect;
