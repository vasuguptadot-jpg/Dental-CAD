export interface FDITooth {
  id: number;
  label: string;
  name: string;
  quadrant: 1 | 2 | 3 | 4;
  position: number;
  arch: "upper" | "lower";
}

const UPPER_RIGHT: FDITooth[] = [
  { id: 18, label: "18", name: "Upper Right 3rd Molar", quadrant: 1, position: 8, arch: "upper" },
  { id: 17, label: "17", name: "Upper Right 2nd Molar", quadrant: 1, position: 7, arch: "upper" },
  { id: 16, label: "16", name: "Upper Right 1st Molar", quadrant: 1, position: 6, arch: "upper" },
  { id: 15, label: "15", name: "Upper Right 2nd Premolar", quadrant: 1, position: 5, arch: "upper" },
  { id: 14, label: "14", name: "Upper Right 1st Premolar", quadrant: 1, position: 4, arch: "upper" },
  { id: 13, label: "13", name: "Upper Right Canine", quadrant: 1, position: 3, arch: "upper" },
  { id: 12, label: "12", name: "Upper Right Lateral Incisor", quadrant: 1, position: 2, arch: "upper" },
  { id: 11, label: "11", name: "Upper Right Central Incisor", quadrant: 1, position: 1, arch: "upper" },
];

const UPPER_LEFT: FDITooth[] = [
  { id: 21, label: "21", name: "Upper Left Central Incisor", quadrant: 2, position: 1, arch: "upper" },
  { id: 22, label: "22", name: "Upper Left Lateral Incisor", quadrant: 2, position: 2, arch: "upper" },
  { id: 23, label: "23", name: "Upper Left Canine", quadrant: 2, position: 3, arch: "upper" },
  { id: 24, label: "24", name: "Upper Left 1st Premolar", quadrant: 2, position: 4, arch: "upper" },
  { id: 25, label: "25", name: "Upper Left 2nd Premolar", quadrant: 2, position: 5, arch: "upper" },
  { id: 26, label: "26", name: "Upper Left 1st Molar", quadrant: 2, position: 6, arch: "upper" },
  { id: 27, label: "27", name: "Upper Left 2nd Molar", quadrant: 2, position: 7, arch: "upper" },
  { id: 28, label: "28", name: "Upper Left 3rd Molar", quadrant: 2, position: 8, arch: "upper" },
];

const LOWER_LEFT: FDITooth[] = [
  { id: 31, label: "31", name: "Lower Left Central Incisor", quadrant: 3, position: 1, arch: "lower" },
  { id: 32, label: "32", name: "Lower Left Lateral Incisor", quadrant: 3, position: 2, arch: "lower" },
  { id: 33, label: "33", name: "Lower Left Canine", quadrant: 3, position: 3, arch: "lower" },
  { id: 34, label: "34", name: "Lower Left 1st Premolar", quadrant: 3, position: 4, arch: "lower" },
  { id: 35, label: "35", name: "Lower Left 2nd Premolar", quadrant: 3, position: 5, arch: "lower" },
  { id: 36, label: "36", name: "Lower Left 1st Molar", quadrant: 3, position: 6, arch: "lower" },
  { id: 37, label: "37", name: "Lower Left 2nd Molar", quadrant: 3, position: 7, arch: "lower" },
  { id: 38, label: "38", name: "Lower Left 3rd Molar", quadrant: 3, position: 8, arch: "lower" },
];

const LOWER_RIGHT: FDITooth[] = [
  { id: 48, label: "48", name: "Lower Right 3rd Molar", quadrant: 4, position: 8, arch: "lower" },
  { id: 47, label: "47", name: "Lower Right 2nd Molar", quadrant: 4, position: 7, arch: "lower" },
  { id: 46, label: "46", name: "Lower Right 1st Molar", quadrant: 4, position: 6, arch: "lower" },
  { id: 45, label: "45", name: "Lower Right 2nd Premolar", quadrant: 4, position: 5, arch: "lower" },
  { id: 44, label: "44", name: "Lower Right 1st Premolar", quadrant: 4, position: 4, arch: "lower" },
  { id: 43, label: "43", name: "Lower Right Canine", quadrant: 4, position: 3, arch: "lower" },
  { id: 42, label: "42", name: "Lower Right Lateral Incisor", quadrant: 4, position: 2, arch: "lower" },
  { id: 41, label: "41", name: "Lower Right Central Incisor", quadrant: 4, position: 1, arch: "lower" },
];

export const FDI_UPPER = [...UPPER_RIGHT, ...UPPER_LEFT];
export const FDI_LOWER = [...LOWER_RIGHT, ...LOWER_LEFT];
export const FDI_ALL = [...UPPER_RIGHT, ...UPPER_LEFT, ...LOWER_LEFT, ...LOWER_RIGHT];

export const FDI_MAP = new Map<number, FDITooth>(FDI_ALL.map((t) => [t.id, t]));

export function getFDIName(id: number): string {
  return FDI_MAP.get(id)?.name ?? `Tooth ${id}`;
}

export function getTeethForJaw(jawType: string): FDITooth[] {
  if (jawType === "upper") return FDI_UPPER;
  if (jawType === "lower") return FDI_LOWER;
  return FDI_ALL;
}

export function getToothCount(jawType: string): number {
  if (jawType === "full") return 28;
  return 14;
}

const TOOTH_COLORS = [
  "#e63946", "#457b9d", "#2a9d8f", "#e9c46a", "#f4a261",
  "#264653", "#8338ec", "#fb5607", "#06d6a0", "#118ab2",
  "#ef476f", "#ffd166", "#06d6a0", "#073b4c", "#3a86ff",
  "#ffbe0b", "#fb5607", "#ff006e", "#8338ec", "#3a86ff",
  "#52b788", "#d62828", "#023e8a", "#e07a5f", "#3d405b",
  "#81b29a", "#f2cc8f", "#0077b6", "#c77dff", "#48cae4",
  "#f72585", "#4cc9f0",
];

export function getToothColor(index: number): string {
  return TOOTH_COLORS[index % TOOTH_COLORS.length];
}
