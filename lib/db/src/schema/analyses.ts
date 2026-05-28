import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { scansTable } from "./scans";

export interface OrthoFindingRow {
  id: string;
  type: string;
  name: string;
  severity: number;
  severityLabel: string;
  affectedTeeth: number[];
  explanation: string;
  clinicalSignificance: string;
  value?: number;
  unit?: string;
  normalRange?: [number, number];
  dataStatus: "computed" | "insufficient_data" | "normal";
}

export const scanAnalysesTable = pgTable("scan_analyses", {
  id: serial("id").primaryKey(),
  scanId: integer("scan_id")
    .notNull()
    .unique()
    .references(() => scansTable.id, { onDelete: "cascade" }),
  findings: jsonb("findings").notNull().$type<OrthoFindingRow[]>(),
  complexityScore: integer("complexity_score").notNull().default(0),
  complexityLabel: text("complexity_label").notNull().default("low"),
  summary: text("summary").notNull().default(""),
  analyzedAt: timestamp("analyzed_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type ScanAnalysisRow = typeof scanAnalysesTable.$inferSelect;
