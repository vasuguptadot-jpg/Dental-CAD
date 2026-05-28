export interface ToothSegmentData {
  toothId: number;
  label: string;
  color: string;
  faceIndices: number[];
  centroid: { x: number; y: number; z: number };
}

export interface SavedToothSegment extends ToothSegmentData {
  id: number;
  scanId: number;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface SegmentationState {
  segments: ToothSegmentData[];
  selectedToothId: number | null;
  hoveredToothId: number | null;
  isSegmenting: boolean;
  isSaving: boolean;
  hasSavedResults: boolean;
}

export type CorrectionTool = "none" | "merge" | "split" | "rename";

export interface MergeCandidate {
  first: number | null;
  second: number | null;
}
