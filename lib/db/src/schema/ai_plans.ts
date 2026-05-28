import { pgTable, text, serial, integer, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { casesTable } from "./cases";
import { scansTable } from "./scans";

export type MovementType =
  | "expansion"
  | "intrusion"
  | "extrusion"
  | "rotation"
  | "distalization"
  | "mesialization"
  | "torque"
  | "tipping";

export interface ToothMovement {
  toothId: number;
  toothLabel: string;
  movementType: MovementType;
  magnitude: number;
  unit: string;
  direction?: string;
  currentPosition?: { x: number; y: number; z: number };
  targetPosition?: { x: number; y: number; z: number };
  rationale: string;
  risks: string[];
  alternatives: string[];
  priority: "high" | "medium" | "low";
  sequence: number;
}

export interface TreatmentPhase {
  phase: number;
  name: string;
  duration: string;
  movements: ToothMovement[];
  goals: string[];
}

export interface AIPlanData {
  summary: string;
  diagnosis: string;
  treatmentGoals: string[];
  phases: TreatmentPhase[];
  totalDuration: string;
  applianceRecommendations: string[];
  retentionPlan: string;
  risks: string[];
  alternatives: string[];
  confidenceScore: number;
  evidenceBase: string[];
  model: string;
  generatedAt: string;
  doctorApproved: boolean;
  approvedAt?: string;
}

export const aiTreatmentPlansTable = pgTable("ai_treatment_plans", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull().references(() => casesTable.id, { onDelete: "cascade" }),
  scanId: integer("scan_id").references(() => scansTable.id, { onDelete: "set null" }),
  planData: jsonb("plan_data").notNull().$type<AIPlanData>(),
  confidenceScore: real("confidence_score").notNull().default(0),
  doctorApproved: text("doctor_approved").notNull().default("pending"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type AiTreatmentPlan = typeof aiTreatmentPlansTable.$inferSelect;
