export type LandmarkType =
  | "incisal_edge"
  | "cusp"
  | "contact_mesial"
  | "contact_distal"
  | "gingival_margin"
  | "center";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface ToothLandmark {
  id: string;
  toothId: number;
  type: LandmarkType;
  position: Vec3;
  confidence: number;
  isManual: boolean;
}

export interface SavedLandmark {
  id: number;
  scanId: number;
  toothId: number;
  type: string;
  position: Vec3;
  confidence: number;
  isManual: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export type MeasurementType =
  | "arch_width"
  | "arch_length"
  | "tooth_width"
  | "inter_canine"
  | "inter_molar"
  | "midline_deviation";

export interface DentalMeasurement {
  id: string;
  name: string;
  value: number;
  unit: string;
  type: MeasurementType;
  teeth: number[];
  normalRange?: [number, number];
  description: string;
  status: "normal" | "warning" | "alert" | "info";
}

export const LANDMARK_COLORS: Record<LandmarkType, string> = {
  incisal_edge: "#00d4ff",
  cusp: "#ffd60a",
  contact_mesial: "#06d6a0",
  contact_distal: "#06d6a0",
  gingival_margin: "#ff6b6b",
  center: "#ffffff",
};

export const LANDMARK_LABELS: Record<LandmarkType, string> = {
  incisal_edge: "Incisal Edge",
  cusp: "Cusp",
  contact_mesial: "Mesial Contact",
  contact_distal: "Distal Contact",
  gingival_margin: "Gingival Margin",
  center: "Tooth Center",
};

export const LANDMARK_SIZE: Record<LandmarkType, number> = {
  incisal_edge: 0.8,
  cusp: 1.0,
  contact_mesial: 0.7,
  contact_distal: 0.7,
  gingival_margin: 0.8,
  center: 0.5,
};
