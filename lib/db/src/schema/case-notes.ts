import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const caseNotesTable = pgTable("case_notes", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull(),
  authorId: integer("author_id").notNull(),
  authorName: text("author_name").notNull(),
  content: text("content").notNull(),
  noteType: text("note_type").notNull().default("general"),
  isPinned: boolean("is_pinned").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const caseAssignmentsTable = pgTable("case_assignments", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull(),
  assigneeId: integer("assignee_id").notNull(),
  assigneeName: text("assignee_name").notNull(),
  role: text("role").notNull().default("treatment_coordinator"),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCaseNoteSchema = createInsertSchema(caseNotesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCaseNote = z.infer<typeof insertCaseNoteSchema>;
export type CaseNote = typeof caseNotesTable.$inferSelect;

export const insertCaseAssignmentSchema = createInsertSchema(caseAssignmentsTable).omit({ id: true, assignedAt: true });
export type InsertCaseAssignment = z.infer<typeof insertCaseAssignmentSchema>;
export type CaseAssignment = typeof caseAssignmentsTable.$inferSelect;
