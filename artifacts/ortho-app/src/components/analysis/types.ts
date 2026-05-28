export type OrthoAnalysisType =
  | "crowding"
  | "spacing"
  | "overjet"
  | "overbite"
  | "midline_deviation"
  | "rotation"
  | "crossbite"
  | "open_bite"
  | "deep_bite";

export type SeverityLabel = "none" | "mild" | "moderate" | "severe" | "critical";
export type DataStatus = "computed" | "insufficient_data" | "normal";
export type ComplexityLabel = "low" | "moderate" | "high" | "severe";

export interface OrthoFinding {
  id: string;
  type: OrthoAnalysisType;
  name: string;
  severity: number;
  severityLabel: SeverityLabel;
  affectedTeeth: number[];
  explanation: string;
  clinicalSignificance: string;
  value?: number;
  unit?: string;
  normalRange?: [number, number];
  dataStatus: DataStatus;
}

export interface ToothHealthEntry {
  severity: number;
  severityLabel: SeverityLabel;
  issues: string[];
}

export interface OrthoAnalysis {
  findings: OrthoFinding[];
  complexityScore: number;
  complexityLabel: ComplexityLabel;
  toothHealthMap: Record<number, ToothHealthEntry>;
  summary: string;
  affectedToothCount: number;
  analyzedAt: string;
}

export const ANALYSIS_META: Record<
  OrthoAnalysisType,
  { name: string; icon: string; description: string }
> = {
  crowding: {
    name: "Crowding",
    icon: "compress",
    description: "Insufficient arch space causing teeth to overlap or be displaced",
  },
  spacing: {
    name: "Spacing",
    icon: "expand",
    description: "Excess arch space creating gaps between teeth",
  },
  overjet: {
    name: "Overjet",
    icon: "arrow-right",
    description: "Horizontal distance between upper and lower incisors",
  },
  overbite: {
    name: "Overbite",
    icon: "arrow-down",
    description: "Vertical overlap of upper over lower incisors",
  },
  midline_deviation: {
    name: "Midline Deviation",
    icon: "align-center",
    description: "Misalignment of the upper dental midline from the arch center",
  },
  rotation: {
    name: "Tooth Rotation",
    icon: "rotate-cw",
    description: "Individual teeth rotated about their long axis",
  },
  crossbite: {
    name: "Crossbite",
    icon: "arrow-left-right",
    description: "Upper teeth positioned inside (lingual to) lower teeth",
  },
  open_bite: {
    name: "Open Bite",
    icon: "minus",
    description: "Lack of vertical contact between opposing teeth",
  },
  deep_bite: {
    name: "Deep Bite",
    icon: "chevrons-down",
    description: "Excessive vertical overlap of upper incisors over lower incisors",
  },
};

export const SEVERITY_COLORS: Record<SeverityLabel, string> = {
  none: "#10b981",
  mild: "#f59e0b",
  moderate: "#f97316",
  severe: "#ef4444",
  critical: "#dc2626",
};

export const SEVERITY_HEX: Record<SeverityLabel, number> = {
  none: 0x10b981,
  mild: 0xf59e0b,
  moderate: 0xf97316,
  severe: 0xef4444,
  critical: 0xdc2626,
};

export const COMPLEXITY_COLORS: Record<ComplexityLabel, string> = {
  low: "#10b981",
  moderate: "#f59e0b",
  high: "#f97316",
  severe: "#ef4444",
};
