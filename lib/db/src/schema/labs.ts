import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const labsTable = pgTable("labs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  specialties: text("specialties").array(),
  turnaroundDays: integer("turnaround_days").notNull().default(7),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const labOrdersTable = pgTable("lab_orders", {
  id: serial("id").primaryKey(),
  orderCode: text("order_code").notNull().unique(),
  labId: integer("lab_id").notNull(),
  caseId: integer("case_id").notNull(),
  type: text("type").notNull().default("aligner"),
  status: text("status").notNull().default("draft"),
  priority: text("priority").notNull().default("normal"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  instructions: text("instructions"),
  specs: jsonb("specs"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const labOrderFilesTable = pgTable("lab_order_files", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  direction: text("direction").notNull().default("outgoing"),
  fileName: text("file_name").notNull(),
  originalName: text("original_name").notNull(),
  fileType: text("file_type").notNull(),
  fileSize: integer("file_size").notNull(),
  filePath: text("file_path").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const labMessagesTable = pgTable("lab_messages", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  senderType: text("sender_type").notNull().default("clinic"),
  senderName: text("sender_name").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLabSchema = createInsertSchema(labsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLab = z.infer<typeof insertLabSchema>;
export type Lab = typeof labsTable.$inferSelect;

export const insertLabOrderSchema = createInsertSchema(labOrdersTable).omit({ id: true, orderCode: true, createdAt: true, updatedAt: true });
export type InsertLabOrder = z.infer<typeof insertLabOrderSchema>;
export type LabOrder = typeof labOrdersTable.$inferSelect;
