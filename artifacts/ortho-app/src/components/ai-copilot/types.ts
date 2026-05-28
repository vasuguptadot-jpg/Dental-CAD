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
}

export interface AiTreatmentPlan {
  id: number;
  caseId: number;
  scanId: number | null;
  planData: AIPlanData;
  confidenceScore: number;
  doctorApproved: "pending" | "approved" | "rejected";
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiChatMessage {
  id: number;
  caseId: number;
  role: "user" | "assistant";
  content: string;
  contextData?: {
    scanId?: number;
    toothIds?: number[];
    analysisFindings?: string[];
  };
  createdAt: string;
}

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  expansion: "Expansion",
  intrusion: "Intrusion",
  extrusion: "Extrusion",
  rotation: "Rotation",
  distalization: "Distalization",
  mesialization: "Mesialization",
  torque: "Torque",
  tipping: "Tipping",
};

export const MOVEMENT_COLORS: Record<MovementType, string> = {
  expansion: "#06b6d4",
  intrusion: "#8b5cf6",
  extrusion: "#f59e0b",
  rotation: "#10b981",
  distalization: "#ef4444",
  mesialization: "#3b82f6",
  torque: "#f97316",
  tipping: "#ec4899",
};

export const PRIORITY_COLORS = {
  high: "text-red-400 bg-red-500/10 border-red-500/30",
  medium: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  low: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
};
