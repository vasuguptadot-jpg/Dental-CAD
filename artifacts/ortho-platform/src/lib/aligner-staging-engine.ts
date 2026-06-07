import type { ToothTransform } from "./tooth-movement-engine";

// ─── Per-Stage Limits (Clear Aligner Standard) ────────────────────────────────

export const STAGE_LIMITS = {
  translationMm: 0.25,   // max mm per stage per axis
  rotationDeg: 2.0,       // max degrees per stage (rx, ry, rz)
  torqueDeg: 1.5,         // max torque degrees per stage
  tipDeg: 2.0,            // max tip degrees per stage
  angulationDeg: 2.0,     // max angulation degrees per stage
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AlignerStage {
  stageNumber: number;       // 1-based
  progress: number;          // 0–1
  transforms: ToothTransform[];
  activeTeeth: number[];     // FDI numbers moving in this stage
  notes: string[];
}

export interface ToothMovementSummary {
  fdiNumber: number;
  toothLabel: string;
  totalTranslationMm: number;
  maxRotationDeg: number;
  stagesActive: number;
  firstActiveStage: number;
  lastActiveStage: number;
  complexity: "minimal" | "mild" | "moderate" | "complex";
  complexityScore: number; // 0–10
  difficultFactors: string[];
}

export interface TreatmentPrediction {
  totalStages: number;
  estimatedWeeks: number;
  estimatedMonths: number;
  successProbability: number;      // 0–100
  refinementLikelihood: number;    // 0–100 — chance of needing refinements
  overallComplexity: "minimal" | "mild" | "moderate" | "complex";
  movementSummaries: ToothMovementSummary[];
  difficultMovementsCount: number;
  totalTeethMoved: number;
  averageMovementPerStage: number; // mm
  phases: TreatmentPhase[];
}

export interface TreatmentPhase {
  label: string;
  description: string;
  startStage: number;
  endStage: number;
  focusTeeth: number[];
  primaryMovement: string;
}

export interface AlignerReport {
  generatedAt: string;
  totalAligners: number;
  estimatedDurationWeeks: number;
  estimatedDurationMonths: number;
  successProbability: number;
  refinementLikelihood: number;
  complexity: string;
  teethMoved: number;
  phases: TreatmentPhase[];
  perToothSummary: ToothMovementSummary[];
  clinicalNotes: string[];
}

// ─── FDI Names ────────────────────────────────────────────────────────────────

const FDI_NAMES: Record<number, string> = {
  11:"UR Central",12:"UR Lateral",13:"UR Canine",14:"UR 1st PM",15:"UR 2nd PM",16:"UR 1st Molar",17:"UR 2nd Molar",
  21:"UL Central",22:"UL Lateral",23:"UL Canine",24:"UL 1st PM",25:"UL 2nd PM",26:"UL 1st Molar",27:"UL 2nd Molar",
  31:"LL Central",32:"LL Lateral",33:"LL Canine",34:"LL 1st PM",35:"LL 2nd PM",36:"LL 1st Molar",37:"LL 2nd Molar",
  41:"LR Central",42:"LR Lateral",43:"LR Canine",44:"LR 1st PM",45:"LR 2nd PM",46:"LR 1st Molar",47:"LR 2nd Molar",
};

// ─── Interpolation ────────────────────────────────────────────────────────────

export function lerpTransform(
  finalTransform: ToothTransform,
  progress: number
): ToothTransform {
  const t = Math.max(0, Math.min(1, progress));
  const lerp = (to: number) => to * t;
  return {
    fdiNumber: finalTransform.fdiNumber,
    tx: lerp(finalTransform.tx),
    ty: lerp(finalTransform.ty),
    tz: lerp(finalTransform.tz),
    rx: lerp(finalTransform.rx),
    ry: lerp(finalTransform.ry),
    rz: lerp(finalTransform.rz),
    torque: lerp(finalTransform.torque),
    tip: lerp(finalTransform.tip),
    angulation: lerp(finalTransform.angulation),
  };
}

// ─── Stages Needed For One Tooth ─────────────────────────────────────────────

function stagesNeededForTooth(t: ToothTransform): number {
  const maxTrans = Math.max(Math.abs(t.tx), Math.abs(t.ty), Math.abs(t.tz));
  const maxRot = Math.max(Math.abs(t.rx), Math.abs(t.ry), Math.abs(t.rz));

  const s1 = maxTrans > 0.001 ? Math.ceil(maxTrans / STAGE_LIMITS.translationMm) : 0;
  const s2 = maxRot > 0.05 ? Math.ceil(maxRot / STAGE_LIMITS.rotationDeg) : 0;
  const s3 = Math.abs(t.torque) > 0.05 ? Math.ceil(Math.abs(t.torque) / STAGE_LIMITS.torqueDeg) : 0;
  const s4 = Math.abs(t.tip) > 0.05 ? Math.ceil(Math.abs(t.tip) / STAGE_LIMITS.tipDeg) : 0;
  const s5 = Math.abs(t.angulation) > 0.05 ? Math.ceil(Math.abs(t.angulation) / STAGE_LIMITS.angulationDeg) : 0;

  return Math.max(s1, s2, s3, s4, s5);
}

function isToothMoved(t: ToothTransform): boolean {
  return Object.entries(t).some(([k, v]) => k !== "fdiNumber" && Math.abs(v as number) > 0.05);
}

// ─── Stage Generator ──────────────────────────────────────────────────────────

export function generateStages(transforms: ToothTransform[]): AlignerStage[] {
  const movedTeeth = transforms.filter(isToothMoved);
  if (movedTeeth.length === 0) return [];

  // Total stages = max stages needed across all moved teeth
  const totalStages = Math.max(...movedTeeth.map(stagesNeededForTooth));

  const stages: AlignerStage[] = [];

  for (let s = 0; s <= totalStages; s++) {
    const progress = s === 0 ? 0 : s / totalStages;
    const prevProgress = s === 0 ? 0 : (s - 1) / totalStages;

    const stageTransforms = transforms.map(t => lerpTransform(t, progress));

    // Which teeth are actively moving in this stage?
    const activeTeeth = movedTeeth
      .filter(t => {
        // Tooth is active if it still has movement to do at this stage
        const toothStages = stagesNeededForTooth(t);
        const toothProgress = s / totalStages;
        return toothStages > 0 && s > 0 && toothProgress <= 1;
      })
      .map(t => t.fdiNumber);

    // Generate stage notes
    const notes: string[] = [];
    if (s === 0) notes.push("Initial position — treatment start");
    if (s === totalStages) notes.push("Final position achieved");
    if (s > 0 && s <= Math.ceil(totalStages * 0.33)) notes.push("Phase 1: Major arch alignment");
    else if (s > Math.ceil(totalStages * 0.33) && s <= Math.ceil(totalStages * 0.66)) notes.push("Phase 2: Detailed positioning");
    else if (s > Math.ceil(totalStages * 0.66) && s < totalStages) notes.push("Phase 3: Finishing & refinement");

    stages.push({ stageNumber: s, progress, transforms: stageTransforms, activeTeeth, notes });
  }

  return stages;
}

// ─── Tooth Movement Analysis ─────────────────────────────────────────────────

function analyzeToothMovement(t: ToothTransform, totalStages: number): ToothMovementSummary {
  const totalTranslation = Math.sqrt(t.tx ** 2 + t.ty ** 2 + t.tz ** 2);
  const maxRotation = Math.max(Math.abs(t.rx), Math.abs(t.ry), Math.abs(t.rz), Math.abs(t.torque), Math.abs(t.tip), Math.abs(t.angulation));
  const stagesForTooth = stagesNeededForTooth(t);
  const firstActive = 1;
  const lastActive = stagesForTooth;

  const difficultFactors: string[] = [];
  let complexityScore = 0;

  if (totalTranslation > 3) { difficultFactors.push(`Large bodily movement (${totalTranslation.toFixed(1)}mm)`); complexityScore += 3; }
  else if (totalTranslation > 1.5) { difficultFactors.push(`Moderate translation (${totalTranslation.toFixed(1)}mm)`); complexityScore += 1.5; }

  if (maxRotation > 20) { difficultFactors.push(`Severe rotation (${maxRotation.toFixed(1)}°)`); complexityScore += 3; }
  else if (maxRotation > 10) { difficultFactors.push(`Significant rotation (${maxRotation.toFixed(1)}°)`); complexityScore += 1.5; }

  if (Math.abs(t.torque) > 15) { difficultFactors.push(`High torque (${t.torque.toFixed(1)}°)`); complexityScore += 2; }
  if (Math.abs(t.ty) > 2) { difficultFactors.push(`Vertical movement (${t.ty.toFixed(1)}mm) — intrusion/extrusion risk`); complexityScore += 2; }

  const complexity: ToothMovementSummary["complexity"] =
    complexityScore >= 6 ? "complex" :
    complexityScore >= 3 ? "moderate" :
    complexityScore >= 1 ? "mild" :
    "minimal";

  return {
    fdiNumber: t.fdiNumber,
    toothLabel: FDI_NAMES[t.fdiNumber] ?? `Tooth ${t.fdiNumber}`,
    totalTranslationMm: parseFloat(totalTranslation.toFixed(2)),
    maxRotationDeg: parseFloat(maxRotation.toFixed(1)),
    stagesActive: stagesForTooth,
    firstActiveStage: firstActive,
    lastActiveStage: Math.min(lastActive, totalStages),
    complexity,
    complexityScore: parseFloat(complexityScore.toFixed(1)),
    difficultFactors,
  };
}

// ─── Treatment Prediction ─────────────────────────────────────────────────────

export function computeTreatmentPrediction(transforms: ToothTransform[]): TreatmentPrediction {
  const movedTeeth = transforms.filter(isToothMoved);
  if (movedTeeth.length === 0) {
    return {
      totalStages: 0, estimatedWeeks: 0, estimatedMonths: 0,
      successProbability: 100, refinementLikelihood: 0,
      overallComplexity: "minimal", movementSummaries: [],
      difficultMovementsCount: 0, totalTeethMoved: 0,
      averageMovementPerStage: 0, phases: [],
    };
  }

  const totalStages = Math.max(...movedTeeth.map(stagesNeededForTooth));
  const summaries = movedTeeth.map(t => analyzeToothMovement(t, totalStages));

  const difficultCount = summaries.filter(s => s.complexity === "complex" || s.complexity === "moderate").length;
  const complexCount = summaries.filter(s => s.complexity === "complex").length;

  // Success probability
  let successProb = 95;
  successProb -= complexCount * 4;
  successProb -= difficultCount * 2;
  successProb -= (totalStages > 40 ? 5 : 0);
  successProb = Math.max(60, Math.min(99, successProb));

  // Refinement likelihood
  let refinementLikelihood = 10;
  refinementLikelihood += complexCount * 10;
  refinementLikelihood += difficultCount * 5;
  refinementLikelihood += (totalStages > 30 ? 10 : 0);
  refinementLikelihood = Math.max(5, Math.min(75, refinementLikelihood));

  const totalComplexityScore = summaries.reduce((sum, s) => sum + s.complexityScore, 0);
  const avgComplexity = summaries.length > 0 ? totalComplexityScore / summaries.length : 0;
  const overallComplexity: TreatmentPrediction["overallComplexity"] =
    avgComplexity >= 5 ? "complex" : avgComplexity >= 3 ? "moderate" : avgComplexity >= 1 ? "mild" : "minimal";

  // Estimate duration (2 weeks per stage)
  const estimatedWeeks = totalStages * 2;
  const estimatedMonths = parseFloat((estimatedWeeks / 4.33).toFixed(1));

  // Average movement per stage
  const totalMovement = movedTeeth.reduce((sum, t) => sum + Math.sqrt(t.tx**2 + t.ty**2 + t.tz**2), 0);
  const averageMovementPerStage = totalStages > 0 ? parseFloat((totalMovement / totalStages).toFixed(3)) : 0;

  // Generate phases
  const phases = generatePhases(summaries, totalStages);

  return {
    totalStages, estimatedWeeks, estimatedMonths,
    successProbability: Math.round(successProb),
    refinementLikelihood: Math.round(refinementLikelihood),
    overallComplexity,
    movementSummaries: summaries.sort((a, b) => b.complexityScore - a.complexityScore),
    difficultMovementsCount: difficultCount,
    totalTeethMoved: movedTeeth.length,
    averageMovementPerStage,
    phases,
  };
}

// ─── Phase Generator ──────────────────────────────────────────────────────────

function generatePhases(summaries: ToothMovementSummary[], totalStages: number): TreatmentPhase[] {
  if (totalStages === 0) return [];
  const p1End = Math.ceil(totalStages * 0.33);
  const p2End = Math.ceil(totalStages * 0.66);
  const p3End = totalStages;

  // Identify which teeth are most active in each phase
  const phase1Teeth = summaries.filter(s => s.totalTranslationMm > 0.5).map(s => s.fdiNumber).slice(0, 6);
  const phase2Teeth = summaries.filter(s => s.maxRotationDeg > 5).map(s => s.fdiNumber).slice(0, 6);
  const phase3Teeth = summaries.filter(s => s.difficulty === "complex" || Math.abs(s.totalTranslationMm - 0) < 0.5).map(s => s.fdiNumber).slice(0, 4);

  return [
    {
      label: "Phase 1 — Leveling & Alignment",
      description: "Correct major crowding and spacing. Primary translations and initial rotations.",
      startStage: 1,
      endStage: p1End,
      focusTeeth: phase1Teeth,
      primaryMovement: "Bodily translation",
    },
    {
      label: "Phase 2 — Working Phase",
      description: "Detailed rotation correction, torque, tipping. Establish correct axial inclinations.",
      startStage: p1End + 1,
      endStage: p2End,
      focusTeeth: phase2Teeth,
      primaryMovement: "Rotation & torque",
    },
    {
      label: "Phase 3 — Finishing",
      description: "Fine-tuning of all positions. Finishing details, root parallelism, occlusal contacts.",
      startStage: p2End + 1,
      endStage: p3End,
      focusTeeth: phase3Teeth.length > 0 ? phase3Teeth : summaries.map(s => s.fdiNumber).slice(0, 4),
      primaryMovement: "Fine detailing",
    },
  ];
}

// ─── Report Generator ─────────────────────────────────────────────────────────

export function generateAlignerReport(
  transforms: ToothTransform[],
  prediction: TreatmentPrediction
): AlignerReport {
  const clinicalNotes: string[] = [];

  if (prediction.refinementLikelihood > 40) {
    clinicalNotes.push("High refinement likelihood — plan for 1–2 refinement rounds with additional aligners.");
  }
  if (prediction.overallComplexity === "complex") {
    clinicalNotes.push("Complex case — consider TAD (Temporary Anchorage Device) support for difficult tooth movements.");
  }
  prediction.movementSummaries
    .filter(s => s.difficultFactors.length > 0)
    .slice(0, 4)
    .forEach(s => {
      clinicalNotes.push(`Tooth ${s.fdiNumber} (${s.toothLabel}): ${s.difficultFactors.join("; ")}.`);
    });

  if (prediction.totalStages > 30) {
    clinicalNotes.push("Long treatment duration — consider mid-course corrections and interproximal reduction (IPR) where appropriate.");
  }
  if (prediction.totalTeethMoved > 12) {
    clinicalNotes.push("Full-arch movement — ensure adequate anchorage and monitor periodontal response throughout treatment.");
  }

  clinicalNotes.push("All movements are advisory. Clinical examination and professional judgment required before proceeding.");

  return {
    generatedAt: new Date().toISOString(),
    totalAligners: prediction.totalStages,
    estimatedDurationWeeks: prediction.estimatedWeeks,
    estimatedDurationMonths: prediction.estimatedMonths,
    successProbability: prediction.successProbability,
    refinementLikelihood: prediction.refinementLikelihood,
    complexity: prediction.overallComplexity,
    teethMoved: prediction.totalTeethMoved,
    phases: prediction.phases,
    perToothSummary: prediction.movementSummaries,
    clinicalNotes,
  };
}

// ─── localStorage Persistence ─────────────────────────────────────────────────

const LS_KEY = (scanId: number) => `ortho_treatment_plan_${scanId}`;

export interface StoredTreatmentPlan {
  scanId: number;
  savedAt: string;
  transforms: ToothTransform[];
}

export function saveTreatmentPlanToStorage(scanId: number, transforms: ToothTransform[]): void {
  const plan: StoredTreatmentPlan = { scanId, savedAt: new Date().toISOString(), transforms };
  localStorage.setItem(LS_KEY(scanId), JSON.stringify(plan));
}

export function loadTreatmentPlanFromStorage(scanId: number): StoredTreatmentPlan | null {
  try {
    const raw = localStorage.getItem(LS_KEY(scanId));
    if (!raw) return null;
    return JSON.parse(raw) as StoredTreatmentPlan;
  } catch {
    return null;
  }
}

export function clearTreatmentPlanFromStorage(scanId: number): void {
  localStorage.removeItem(LS_KEY(scanId));
}

// ─── Demo Data (for empty state / testing) ───────────────────────────────────

export function generateDemoTransforms(): ToothTransform[] {
  const demo: Array<Partial<ToothTransform> & { fdiNumber: number }> = [
    { fdiNumber: 11, tx: 1.5, ry: 8, torque: -5 },
    { fdiNumber: 12, tx: -0.75, rz: -6, tip: 4 },
    { fdiNumber: 13, tx: -2.0, tz: 0.5, angulation: 12 },
    { fdiNumber: 21, tx: -1.0, ry: -6, torque: 4 },
    { fdiNumber: 22, tx: 0.5, rz: 5 },
    { fdiNumber: 23, tx: 2.25, tz: -0.5, angulation: -10 },
    { fdiNumber: 31, ty: -1.0, rx: 3 },
    { fdiNumber: 32, tx: 0.75, rz: -4 },
    { fdiNumber: 41, ty: 1.0, rx: -3 },
    { fdiNumber: 42, tx: -0.5, rz: 5, tip: -3 },
  ];
  return demo.map(d => ({
    fdiNumber: d.fdiNumber,
    tx: d.tx ?? 0, ty: d.ty ?? 0, tz: d.tz ?? 0,
    rx: d.rx ?? 0, ry: d.ry ?? 0, rz: d.rz ?? 0,
    torque: d.torque ?? 0, tip: d.tip ?? 0, angulation: d.angulation ?? 0,
  }));
}
