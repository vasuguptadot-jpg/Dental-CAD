import * as THREE from "three";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ToothTransform {
  fdiNumber: number;
  // Translations (mm)
  tx: number; ty: number; tz: number;
  // Pure rotations (degrees)
  rx: number; ry: number; rz: number;
  // Orthodontic-specific (additive on top of rotations)
  torque: number;      // labio-lingual torque (adds to rx)
  tip: number;         // mesio-distal tipping (adds to rz)
  angulation: number;  // axial rotation in occlusal plane (adds to ry)
}

export interface MovementConstraints {
  maxTranslationMm: number;
  maxRotationDeg: number;
  maxTorqueDeg: number;
  maxTipDeg: number;
  maxAngulationDeg: number;
}

export interface MovementWarning {
  field: keyof ToothTransform;
  level: "warning" | "danger";
  message: string;
  current: number;
  max: number;
}

export interface HistoryEntry {
  id: string;
  fdiNumber: number;
  label: string;
  before: Readonly<ToothTransform>;
  after: Readonly<ToothTransform>;
  timestamp: Date;
}

export interface ToothMovementRecord {
  fdiNumber: number;
  toothLabel: string;
  initialPosition: THREE.Vector3;
  initialRotation: THREE.Euler;
  currentTransform: ToothTransform;
  matrix: THREE.Matrix4;
}

export interface SavedTreatmentPlan {
  version: "1.0";
  savedAt: string;
  movements: Array<{
    fdiNumber: number;
    toothLabel: string;
    initialPosition: { x: number; y: number; z: number };
    initialRotation: { x: number; y: number; z: number };
    transform: ToothTransform;
    matrix: number[];
  }>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Per-tooth-type safe movement limits
const TOOTH_CONSTRAINTS: Record<string, MovementConstraints> = {
  incisor: { maxTranslationMm: 3, maxRotationDeg: 20, maxTorqueDeg: 15, maxTipDeg: 20, maxAngulationDeg: 20 },
  canine: { maxTranslationMm: 3.5, maxRotationDeg: 25, maxTorqueDeg: 20, maxTipDeg: 25, maxAngulationDeg: 25 },
  premolar: { maxTranslationMm: 3, maxRotationDeg: 20, maxTorqueDeg: 20, maxTipDeg: 20, maxAngulationDeg: 20 },
  molar: { maxTranslationMm: 2.5, maxRotationDeg: 15, maxTorqueDeg: 15, maxTipDeg: 15, maxAngulationDeg: 15 },
};

const FDI_TO_TYPE: Record<number, string> = {
  11: "incisor", 12: "incisor", 21: "incisor", 22: "incisor",
  31: "incisor", 32: "incisor", 41: "incisor", 42: "incisor",
  13: "canine", 23: "canine", 33: "canine", 43: "canine",
  14: "premolar", 15: "premolar", 24: "premolar", 25: "premolar",
  34: "premolar", 35: "premolar", 44: "premolar", 45: "premolar",
  16: "molar", 17: "molar", 18: "molar", 26: "molar", 27: "molar", 28: "molar",
  36: "molar", 37: "molar", 38: "molar", 46: "molar", 47: "molar", 48: "molar",
};

export function getConstraints(fdiNumber: number): MovementConstraints {
  const type = FDI_TO_TYPE[fdiNumber] ?? "premolar";
  return TOOTH_CONSTRAINTS[type];
}

export function makeDefaultTransform(fdiNumber: number): ToothTransform {
  return { fdiNumber, tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, torque: 0, tip: 0, angulation: 0 };
}

// ─── Warning Checker ─────────────────────────────────────────────────────────

export function checkMovementWarnings(
  transform: ToothTransform,
  constraints: MovementConstraints
): MovementWarning[] {
  const warnings: MovementWarning[] = [];

  const translationMag = Math.sqrt(transform.tx ** 2 + transform.ty ** 2 + transform.tz ** 2);
  const warnPct = 0.75;
  const dangerPct = 1.0;

  const check = (field: keyof ToothTransform, value: number, max: number, label: string) => {
    const abs = Math.abs(value);
    if (abs >= max * dangerPct) {
      warnings.push({ field, level: "danger", message: `${label} exceeds safe limit (${abs.toFixed(1)} / ${max} max)`, current: abs, max });
    } else if (abs >= max * warnPct) {
      warnings.push({ field, level: "warning", message: `${label} approaching limit (${abs.toFixed(1)} / ${max} max)`, current: abs, max });
    }
  };

  if (translationMag >= constraints.maxTranslationMm * dangerPct) {
    warnings.push({ field: "tx", level: "danger", message: `Total translation ${translationMag.toFixed(1)} mm exceeds ${constraints.maxTranslationMm} mm safe limit`, current: translationMag, max: constraints.maxTranslationMm });
  } else if (translationMag >= constraints.maxTranslationMm * warnPct) {
    warnings.push({ field: "tx", level: "warning", message: `Total translation ${translationMag.toFixed(1)} mm approaching limit`, current: translationMag, max: constraints.maxTranslationMm });
  }

  check("rx", transform.rx, constraints.maxRotationDeg, "Rotation X");
  check("ry", transform.ry, constraints.maxRotationDeg, "Rotation Y");
  check("rz", transform.rz, constraints.maxRotationDeg, "Rotation Z");
  check("torque", transform.torque, constraints.maxTorqueDeg, "Torque");
  check("tip", transform.tip, constraints.maxTipDeg, "Tip");
  check("angulation", transform.angulation, constraints.maxAngulationDeg, "Angulation");

  return warnings;
}

// ─── Matrix Computation ───────────────────────────────────────────────────────

export function computeMatrix(transform: ToothTransform, initialPos: THREE.Vector3, initialRot: THREE.Euler): THREE.Matrix4 {
  const mat = new THREE.Matrix4();
  const pos = new THREE.Vector3(
    initialPos.x + transform.tx,
    initialPos.y + transform.ty,
    initialPos.z + transform.tz
  );
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(initialRot.x + transform.rx + transform.torque),
    THREE.MathUtils.degToRad(initialRot.y + transform.ry + transform.angulation),
    THREE.MathUtils.degToRad(initialRot.z + transform.rz + transform.tip),
    "XYZ"
  );
  const quat = new THREE.Quaternion().setFromEuler(euler);
  mat.compose(pos, quat, new THREE.Vector3(1, 1, 1));
  return mat;
}

export function applyTransformToGroup(
  group: THREE.Group,
  transform: ToothTransform,
  initialPos: THREE.Vector3,
  initialRot: THREE.Euler
): void {
  group.position.set(
    initialPos.x + transform.tx,
    initialPos.y + transform.ty,
    initialPos.z + transform.tz
  );
  group.rotation.set(
    THREE.MathUtils.degToRad(initialRot.x + transform.rx + transform.torque),
    THREE.MathUtils.degToRad(initialRot.y + transform.ry + transform.angulation),
    THREE.MathUtils.degToRad(initialRot.z + transform.rz + transform.tip),
    "XYZ"
  );
}

// ─── History Manager ─────────────────────────────────────────────────────────

export class MovementHistory {
  private stack: HistoryEntry[] = [];
  private pointer = -1;
  private maxSize = 50;

  push(entry: Omit<HistoryEntry, "id" | "timestamp">): void {
    // Clear redo entries above current pointer
    this.stack = this.stack.slice(0, this.pointer + 1);
    this.stack.push({ ...entry, id: crypto.randomUUID(), timestamp: new Date() });
    if (this.stack.length > this.maxSize) this.stack.shift();
    this.pointer = this.stack.length - 1;
  }

  undo(): HistoryEntry | null {
    if (this.pointer < 0) return null;
    const entry = this.stack[this.pointer];
    this.pointer--;
    return entry;
  }

  redo(): HistoryEntry | null {
    if (this.pointer >= this.stack.length - 1) return null;
    this.pointer++;
    return this.stack[this.pointer];
  }

  canUndo(): boolean { return this.pointer >= 0; }
  canRedo(): boolean { return this.pointer < this.stack.length - 1; }

  getHistory(): HistoryEntry[] {
    return this.stack.slice(0, this.pointer + 1).reverse();
  }

  clear(): void {
    this.stack = [];
    this.pointer = -1;
  }
}

// ─── Movement Label ───────────────────────────────────────────────────────────

export function describeMovement(before: ToothTransform, after: ToothTransform): string {
  const diffs: string[] = [];
  const fields: Array<[keyof ToothTransform, string, string]> = [
    ["tx", "Translate X", "mm"], ["ty", "Translate Y", "mm"], ["tz", "Translate Z", "mm"],
    ["rx", "Rotate X", "°"], ["ry", "Rotate Y", "°"], ["rz", "Rotate Z", "°"],
    ["torque", "Torque", "°"], ["tip", "Tip", "°"], ["angulation", "Angulation", "°"],
  ];
  for (const [field, label, unit] of fields) {
    const delta = (after[field] as number) - (before[field] as number);
    if (Math.abs(delta) > 0.05) {
      diffs.push(`${label} ${delta > 0 ? "+" : ""}${delta.toFixed(1)}${unit}`);
    }
  }
  return diffs.length > 0 ? diffs.join(", ") : "No change";
}

// ─── Treatment Plan Serializer ────────────────────────────────────────────────

export function serializeTreatmentPlan(records: ToothMovementRecord[]): SavedTreatmentPlan {
  return {
    version: "1.0",
    savedAt: new Date().toISOString(),
    movements: records
      .filter(r => {
        const t = r.currentTransform;
        return (
          Math.abs(t.tx) > 0.01 || Math.abs(t.ty) > 0.01 || Math.abs(t.tz) > 0.01 ||
          Math.abs(t.rx) > 0.01 || Math.abs(t.ry) > 0.01 || Math.abs(t.rz) > 0.01 ||
          Math.abs(t.torque) > 0.01 || Math.abs(t.tip) > 0.01 || Math.abs(t.angulation) > 0.01
        );
      })
      .map(r => ({
        fdiNumber: r.fdiNumber,
        toothLabel: r.toothLabel,
        initialPosition: { x: r.initialPosition.x, y: r.initialPosition.y, z: r.initialPosition.z },
        initialRotation: { x: r.initialRotation.x, y: r.initialRotation.y, z: r.initialRotation.z },
        transform: r.currentTransform,
        matrix: r.matrix.elements.slice(),
      })),
  };
}
