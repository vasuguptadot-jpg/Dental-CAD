import type { ToothSegment } from "./segmentation-engine";
import type { MeasurementSet } from "./measurement-engine";

export type Severity = "none" | "mild" | "moderate" | "severe";

export interface OrthoCondition {
  id: string;
  name: string;
  severity: Severity;
  score: number; // 0–10
  explanation: string;
  clinicalSignificance: string;
  affectedTeeth: number[];
  color: string; // hex for 3D overlay
}

export interface OrthoAnalysisResult {
  conditions: OrthoCondition[];
  overallSeverity: Severity;
  treatmentComplexity: "simple" | "moderate" | "complex" | "very_complex";
  complexityScore: number;
  summary: string;
  generatedAt: string;
}

function severityFromScore(score: number): Severity {
  if (score < 1.5) return "none";
  if (score < 4) return "mild";
  if (score < 7) return "moderate";
  return "severe";
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function dist2D(a: ToothSegment, b: ToothSegment) {
  return Math.sqrt((a.centroidX - b.centroidX) ** 2 + (a.centroidZ - b.centroidZ) ** 2);
}

function dist3D(a: ToothSegment, b: ToothSegment) {
  return Math.sqrt(
    (a.centroidX - b.centroidX) ** 2 +
    (a.centroidY - b.centroidY) ** 2 +
    (a.centroidZ - b.centroidZ) ** 2
  );
}

// ─── 1. Crowding ─────────────────────────────────────────────────────────────
function analyzeCrowding(segments: ToothSegment[], measurements: MeasurementSet): OrthoCondition {
  const upper = segments.filter(s => s.fdiNumber >= 11 && s.fdiNumber <= 28);
  const lower = segments.filter(s => s.fdiNumber >= 31 && s.fdiNumber <= 48);

  const archLenUpper = measurements.archMeasurements.find(m => m.label === "Upper Arch Length")?.value ?? 0;
  const archLenLower = measurements.archMeasurements.find(m => m.label === "Lower Arch Length")?.value ?? 0;

  const toothSumUpper = measurements.toothWidths
    .filter(w => upper.some(u => u.fdiNumber === w.toothFdi))
    .reduce((s, w) => s + w.value, 0);

  const toothSumLower = measurements.toothWidths
    .filter(w => lower.some(u => u.fdiNumber === w.toothFdi))
    .reduce((s, w) => s + w.value, 0);

  const discrepancyUpper = archLenUpper > 0 ? toothSumUpper - archLenUpper : 0;
  const discrepancyLower = archLenLower > 0 ? toothSumLower - archLenLower : 0;
  const maxDisc = Math.max(discrepancyUpper, discrepancyLower);

  let score = 0;
  let explanation = "Dental arch space is adequate for all teeth.";
  let clinicalSignificance = "No clinical intervention required for crowding.";
  const affected: number[] = [];

  if (maxDisc > 0) {
    score = clamp((maxDisc / 12) * 10, 0, 10);
    if (maxDisc < 4) {
      explanation = `Mild crowding detected. Arch-tooth length discrepancy of ${maxDisc.toFixed(1)} mm.`;
      clinicalSignificance = "Mild crowding may be managed with interproximal reduction (IPR) or minor expansion.";
    } else if (maxDisc < 8) {
      explanation = `Moderate crowding with ${maxDisc.toFixed(1)} mm arch length discrepancy. Teeth appear compressed along the arch.`;
      clinicalSignificance = "Moderate crowding typically requires arch expansion, extraction therapy, or a combination approach.";
    } else {
      explanation = `Severe crowding (${maxDisc.toFixed(1)} mm discrepancy). Significant lack of space causing tooth displacement.`;
      clinicalSignificance = "Severe crowding often requires strategic extractions (commonly premolars) or significant arch expansion. High relapse risk without retention.";
    }
    const affectedArch = discrepancyUpper > discrepancyLower ? upper : lower;
    affectedArch.forEach(t => affected.push(t.fdiNumber));
  }

  return {
    id: "crowding",
    name: "Crowding",
    severity: severityFromScore(score),
    score: parseFloat(score.toFixed(1)),
    explanation,
    clinicalSignificance,
    affectedTeeth: affected,
    color: "#ef4444",
  };
}

// ─── 2. Spacing ───────────────────────────────────────────────────────────────
function analyzeSpacing(segments: ToothSegment[], measurements: MeasurementSet): OrthoCondition {
  const upper = segments.filter(s => s.fdiNumber >= 11 && s.fdiNumber <= 28).sort((a, b) => a.centroidX - b.centroidX);
  const lower = segments.filter(s => s.fdiNumber >= 31 && s.fdiNumber <= 48).sort((a, b) => a.centroidX - b.centroidX);

  let maxGap = 0;
  const affected: number[] = [];

  const findGaps = (sorted: ToothSegment[]) => {
    for (let i = 0; i < sorted.length - 1; i++) {
      const d = dist2D(sorted[i], sorted[i + 1]);
      const combined = (measurements.toothWidths.find(w => w.toothFdi === sorted[i].fdiNumber)?.value ?? 8) / 2 +
        (measurements.toothWidths.find(w => w.toothFdi === sorted[i + 1].fdiNumber)?.value ?? 8) / 2;
      const gap = d - combined;
      if (gap > 0.5) {
        if (gap > maxGap) maxGap = gap;
        affected.push(sorted[i].fdiNumber, sorted[i + 1].fdiNumber);
      }
    }
  };

  findGaps(upper);
  findGaps(lower);

  const score = clamp((maxGap / 6) * 10, 0, 10);
  let explanation = "No clinically significant spacing detected.";
  let clinicalSignificance = "Arch space is well-distributed among all teeth.";

  if (maxGap > 0.5) {
    if (maxGap < 2) {
      explanation = `Minor spacing of ${maxGap.toFixed(1)} mm detected between teeth.`;
      clinicalSignificance = "Minor spaces may close spontaneously or with aligner therapy.";
    } else if (maxGap < 4) {
      explanation = `Moderate diastema/spacing of ${maxGap.toFixed(1)} mm detected. May indicate missing teeth or arch-tooth size discrepancy.`;
      clinicalSignificance = "Moderate spacing should be evaluated for frenulum attachment, missing teeth (hypodontia), or peg laterals.";
    } else {
      explanation = `Significant spacing of ${maxGap.toFixed(1)} mm. Multiple diastemas or a single large space suggesting missing/peg teeth.`;
      clinicalSignificance = "Significant spacing requires comprehensive evaluation for prosthetic replacement, surgical closure, or space redistribution.";
    }
  }

  return {
    id: "spacing",
    name: "Spacing",
    severity: severityFromScore(score),
    score: parseFloat(score.toFixed(1)),
    explanation,
    clinicalSignificance,
    affectedTeeth: [...new Set(affected)],
    color: "#3b82f6",
  };
}

// ─── 3. Overjet ───────────────────────────────────────────────────────────────
function analyzeOverjet(segments: ToothSegment[]): OrthoCondition {
  const upperCentral11 = segments.find(s => s.fdiNumber === 11);
  const upperCentral21 = segments.find(s => s.fdiNumber === 21);
  const lowerCentral41 = segments.find(s => s.fdiNumber === 41);
  const lowerCentral31 = segments.find(s => s.fdiNumber === 31);

  const upperRef = upperCentral11 ?? upperCentral21;
  const lowerRef = lowerCentral41 ?? lowerCentral31;

  let score = 0;
  let explanation = "Overjet within normal range (2–4 mm).";
  let clinicalSignificance = "Normal incisal relationship. No overjet correction indicated.";
  const affected: number[] = [];

  if (upperRef && lowerRef) {
    const overjet = upperRef.centroidZ - lowerRef.centroidZ;

    if (overjet < -1) {
      const absOj = Math.abs(overjet);
      score = clamp((absOj / 5) * 10, 0, 10);
      explanation = `Negative overjet (reverse overjet / edge-to-edge bite) of ${absOj.toFixed(1)} mm. Lower incisors protrude beyond upper.`;
      clinicalSignificance = "Reverse overjet indicates skeletal Class III tendency or dental compensation. May require orthopedic treatment, camouflage, or surgical correction.";
      affected.push(11, 21, 41, 31);
    } else if (overjet > 6) {
      score = clamp(((overjet - 4) / 8) * 10, 0, 10);
      explanation = `Increased overjet of ${overjet.toFixed(1)} mm. Upper incisors significantly protrude beyond lower.`;
      clinicalSignificance = "Increased overjet is associated with trauma risk to incisors, lip incompetence, and Class II skeletal pattern. Treatment may include retraction of upper incisors, mandibular advancement, or functional appliance therapy.";
      affected.push(11, 21, 41, 31);
    } else if (overjet > 4) {
      score = clamp(((overjet - 4) / 4) * 5, 0, 5);
      explanation = `Mild overjet of ${overjet.toFixed(1)} mm (normal: 2–4 mm).`;
      clinicalSignificance = "Slightly increased overjet. Monitor and consider correction during comprehensive treatment.";
      affected.push(11, 21);
    }
  }

  return {
    id: "overjet",
    name: "Overjet",
    severity: severityFromScore(score),
    score: parseFloat(score.toFixed(1)),
    explanation,
    clinicalSignificance,
    affectedTeeth: affected,
    color: "#f59e0b",
  };
}

// ─── 4. Overbite ──────────────────────────────────────────────────────────────
function analyzeOverbite(segments: ToothSegment[]): OrthoCondition {
  const upper = segments.find(s => s.fdiNumber === 11) ?? segments.find(s => s.fdiNumber === 21);
  const lower = segments.find(s => s.fdiNumber === 41) ?? segments.find(s => s.fdiNumber === 31);

  let score = 0;
  let explanation = "Overbite within normal range (20–30%).";
  let clinicalSignificance = "Normal vertical incisal overlap.";
  const affected: number[] = [];

  if (upper && lower) {
    const vertOverlap = upper.centroidY - lower.centroidY;
    const normOverbite = vertOverlap;

    if (normOverbite < -1) {
      score = clamp((Math.abs(normOverbite) / 5) * 10, 0, 10);
      explanation = `Open bite tendency detected. Upper and lower incisors do not contact vertically (gap: ${Math.abs(normOverbite).toFixed(1)} mm).`;
      clinicalSignificance = "Anterior open bite may be caused by digit habits, tongue thrusting, or skeletal divergence. Often associated with speech issues and requires habit elimination and bite-closing mechanics.";
      affected.push(11, 21, 41, 31);
    } else if (normOverbite > 5) {
      score = clamp(((normOverbite - 3) / 6) * 10, 0, 10);
      explanation = `Deep bite detected. Excessive vertical overlap of ${normOverbite.toFixed(1)} mm.`;
      clinicalSignificance = "Deep overbite can cause palatal/gingival trauma, wear of lower incisors, and TMJ loading. Treatment includes bite-opening mechanics (intrusion of anterior teeth or extrusion of posterior teeth).";
      affected.push(11, 21, 41, 31);
    }
  }

  return {
    id: "overbite",
    name: "Overbite",
    severity: severityFromScore(score),
    score: parseFloat(score.toFixed(1)),
    explanation,
    clinicalSignificance,
    affectedTeeth: affected,
    color: "#8b5cf6",
  };
}

// ─── 5. Midline Deviation ─────────────────────────────────────────────────────
function analyzeMidlineDeviation(segments: ToothSegment[], measurements: MeasurementSet): OrthoCondition {
  const deviationMeasure = measurements.archMeasurements.find(m => m.type === "midline_deviation");
  const deviation = deviationMeasure?.value ?? 0;

  const score = clamp((deviation / 6) * 10, 0, 10);

  let explanation = "Dental midlines are coincident.";
  let clinicalSignificance = "No midline correction required.";
  const affected: number[] = [11, 21, 41, 31];

  if (deviation >= 1) {
    if (deviation < 2) {
      explanation = `Minor midline shift of ${deviation.toFixed(1)} mm. May be clinically acceptable.`;
      clinicalSignificance = "Minor midline deviation (<2 mm) is generally acceptable and may not require dedicated correction.";
    } else if (deviation < 4) {
      explanation = `Moderate midline deviation of ${deviation.toFixed(1)} mm. Upper and lower dental midlines are misaligned.`;
      clinicalSignificance = "Moderate midline discrepancy is esthetically noticeable and should be addressed. Evaluate for skeletal asymmetry vs dental compensation.";
    } else {
      explanation = `Significant midline deviation of ${deviation.toFixed(1)} mm. Pronounced asymmetry between upper and lower dental arches.`;
      clinicalSignificance = "Significant midline deviation requires CBCT evaluation for skeletal asymmetry. Surgical correction may be indicated in severe cases.";
    }
  }

  return {
    id: "midline_deviation",
    name: "Midline Deviation",
    severity: severityFromScore(deviation < 1 ? 0 : score),
    score: deviation < 1 ? 0 : parseFloat(score.toFixed(1)),
    explanation,
    clinicalSignificance,
    affectedTeeth: affected,
    color: "#ec4899",
  };
}

// ─── 6. Rotation ──────────────────────────────────────────────────────────────
function analyzeRotation(segments: ToothSegment[]): OrthoCondition {
  const upper = segments.filter(s => s.fdiNumber >= 11 && s.fdiNumber <= 28).sort((a, b) => a.centroidX - b.centroidX);

  let maxRotScore = 0;
  const affected: number[] = [];

  for (let i = 1; i < upper.length - 1; i++) {
    const prev = upper[i - 1];
    const curr = upper[i];
    const next = upper[i + 1];

    const v1x = curr.centroidX - prev.centroidX;
    const v1z = curr.centroidZ - prev.centroidZ;
    const v2x = next.centroidX - curr.centroidX;
    const v2z = next.centroidZ - curr.centroidZ;

    const dot = v1x * v2x + v1z * v2z;
    const mag1 = Math.sqrt(v1x ** 2 + v1z ** 2);
    const mag2 = Math.sqrt(v2x ** 2 + v2z ** 2);

    if (mag1 > 0 && mag2 > 0) {
      const cosAngle = clamp(dot / (mag1 * mag2), -1, 1);
      const angleRad = Math.acos(cosAngle);
      const angleDeg = (angleRad * 180) / Math.PI;
      const deviation = Math.abs(180 - angleDeg);

      if (deviation > 15) {
        const rotScore = clamp((deviation / 45) * 10, 0, 10);
        if (rotScore > maxRotScore) maxRotScore = rotScore;
        affected.push(curr.fdiNumber);
      }
    }
  }

  let explanation = "No significant tooth rotation detected.";
  let clinicalSignificance = "All teeth appear to be within acceptable axial orientation.";

  if (affected.length > 0) {
    if (maxRotScore < 4) {
      explanation = `Mild rotation detected in teeth: ${affected.join(", ")}. Slight mesial or distal tipping from ideal arch form.`;
      clinicalSignificance = "Minor rotations are typically correctable with aligners or fixed appliances. Overcorrection (super-rotation) is recommended to prevent relapse.";
    } else if (maxRotScore < 7) {
      explanation = `Moderate rotation in teeth: ${affected.join(", ")}. Notable deviation from ideal tooth position along the arch curve.`;
      clinicalSignificance = "Moderate rotations require derotation mechanics and may need fiberotomy to prevent relapse due to stretched periodontal fibers.";
    } else {
      explanation = `Severe rotation in teeth: ${affected.join(", ")}. Teeth significantly displaced from their normal arch position.`;
      clinicalSignificance = "Severe rotations are among the most relapse-prone movements. Pericision/fiberotomy and extended retention are strongly recommended.";
    }
  }

  return {
    id: "rotation",
    name: "Rotation",
    severity: severityFromScore(maxRotScore),
    score: parseFloat(maxRotScore.toFixed(1)),
    explanation,
    clinicalSignificance,
    affectedTeeth: affected,
    color: "#10b981",
  };
}

// ─── 7. Crossbite ─────────────────────────────────────────────────────────────
function analyzeCrossbite(segments: ToothSegment[]): OrthoCondition {
  const upperSegs = segments.filter(s => s.fdiNumber >= 11 && s.fdiNumber <= 28);
  const lowerSegs = segments.filter(s => s.fdiNumber >= 31 && s.fdiNumber <= 48);

  const affected: number[] = [];
  let maxXbiteDev = 0;

  const pairMap: Record<number, number> = { 16: 46, 15: 45, 14: 44, 13: 43, 26: 36, 25: 35, 24: 34, 23: 33 };

  for (const [upperFdi, lowerFdi] of Object.entries(pairMap)) {
    const upper = upperSegs.find(s => s.fdiNumber === parseInt(upperFdi));
    const lower = lowerSegs.find(s => s.fdiNumber === lowerFdi);

    if (upper && lower) {
      const buccalDiff = upper.centroidX - lower.centroidX;
      if (Math.abs(buccalDiff) > 3) {
        maxXbiteDev = Math.max(maxXbiteDev, Math.abs(buccalDiff));
        affected.push(upper.fdiNumber, lower.fdiNumber);
      }
    }
  }

  const score = clamp((maxXbiteDev / 8) * 10, 0, 10);

  let explanation = "No crossbite detected. Upper teeth appropriately overlap lower teeth buccally.";
  let clinicalSignificance = "Normal buccal overjet present on all posterior teeth.";

  if (affected.length > 0) {
    if (maxXbiteDev < 4) {
      explanation = `Mild crossbite tendency. Minor transverse discrepancy of ${maxXbiteDev.toFixed(1)} mm in teeth: ${[...new Set(affected)].join(", ")}.`;
      clinicalSignificance = "Mild crossbite may be treated with expansion appliances or aligner-based arch expansion.";
    } else if (maxXbiteDev < 7) {
      explanation = `Moderate unilateral/bilateral crossbite of ${maxXbiteDev.toFixed(1)} mm affecting: ${[...new Set(affected)].join(", ")}.`;
      clinicalSignificance = "Crossbite causes mandibular shift, asymmetric jaw loading, and functional impairment. Rapid palatal expansion (RPE) or MARPE may be indicated.";
    } else {
      explanation = `Severe crossbite of ${maxXbiteDev.toFixed(1)} mm. Significant transverse skeletal/dental discrepancy affecting teeth: ${[...new Set(affected)].join(", ")}.`;
      clinicalSignificance = "Severe crossbite may require surgically-assisted rapid palatal expansion (SARPE) or orthognathic surgery for correction.";
    }
  }

  return {
    id: "crossbite",
    name: "Crossbite",
    severity: severityFromScore(score),
    score: parseFloat(score.toFixed(1)),
    explanation,
    clinicalSignificance,
    affectedTeeth: [...new Set(affected)],
    color: "#f97316",
  };
}

// ─── 8. Open Bite ─────────────────────────────────────────────────────────────
function analyzeOpenBite(segments: ToothSegment[]): OrthoCondition {
  const upperAnterior = segments.filter(s => s.fdiNumber >= 11 && s.fdiNumber <= 13);
  const lowerAnterior = segments.filter(s => s.fdiNumber >= 41 && s.fdiNumber <= 43);

  let maxOpenBite = 0;
  const affected: number[] = [];

  for (const u of upperAnterior) {
    const pairFdi = u.fdiNumber === 11 ? 41 : u.fdiNumber === 12 ? 42 : 43;
    const lower = lowerAnterior.find(l => l.fdiNumber === pairFdi);
    if (lower) {
      const vertGap = lower.centroidY - u.centroidY;
      if (vertGap > 1) {
        if (vertGap > maxOpenBite) maxOpenBite = vertGap;
        affected.push(u.fdiNumber, lower.fdiNumber);
      }
    }
  }

  const score = clamp((maxOpenBite / 6) * 10, 0, 10);

  let explanation = "Anterior teeth are in contact. No open bite detected.";
  let clinicalSignificance = "Normal vertical relationship in the anterior region.";

  if (maxOpenBite > 1) {
    if (maxOpenBite < 3) {
      explanation = `Mild anterior open bite of ${maxOpenBite.toFixed(1)} mm. Upper and lower anterior teeth do not make contact.`;
      clinicalSignificance = "Mild open bite may respond to habit elimination, bite-closing aligners, or anterior intrusion/extrusion mechanics.";
    } else if (maxOpenBite < 5) {
      explanation = `Moderate anterior open bite of ${maxOpenBite.toFixed(1)} mm. Significant vertical gap between upper and lower incisors.`;
      clinicalSignificance = "Moderate open bite is often multifactorial. Treatment includes tongue habit intervention, molar intrusion (mini-screws), or anterior extrusion.";
    } else {
      explanation = `Severe anterior open bite of ${maxOpenBite.toFixed(1)} mm. Extensive vertical discrepancy suggesting skeletal open bite.`;
      clinicalSignificance = "Severe skeletal open bite typically requires orthognathic surgery (Le Fort I impaction) for stable correction. High relapse risk with orthodontics alone.";
    }
  }

  return {
    id: "open_bite",
    name: "Open Bite",
    severity: severityFromScore(score),
    score: parseFloat(score.toFixed(1)),
    explanation,
    clinicalSignificance,
    affectedTeeth: [...new Set(affected)],
    color: "#06b6d4",
  };
}

// ─── 9. Deep Bite ─────────────────────────────────────────────────────────────
function analyzeDeepBite(segments: ToothSegment[]): OrthoCondition {
  const upper11 = segments.find(s => s.fdiNumber === 11);
  const upper21 = segments.find(s => s.fdiNumber === 21);
  const lower41 = segments.find(s => s.fdiNumber === 41);
  const lower31 = segments.find(s => s.fdiNumber === 31);

  const upperRef = upper11 ?? upper21;
  const lowerRef = lower41 ?? lower31;

  let score = 0;
  let explanation = "Vertical overlap within normal range.";
  let clinicalSignificance = "Normal overbite. No deep bite correction required.";
  const affected: number[] = [];

  if (upperRef && lowerRef) {
    const overlap = upperRef.centroidY - lowerRef.centroidY;
    if (overlap > 4) {
      score = clamp(((overlap - 4) / 6) * 10, 0, 10);

      if (overlap < 6) {
        explanation = `Mild deep bite. Vertical incisal overlap of ${overlap.toFixed(1)} mm (normal: 2–4 mm).`;
        clinicalSignificance = "Mild deep bite can be managed with anterior intrusion using TADs or posterior extrusion mechanics.";
      } else if (overlap < 8) {
        explanation = `Moderate deep bite with ${overlap.toFixed(1)} mm of vertical incisal overlap. Lower incisors contact upper palatal gingiva.`;
        clinicalSignificance = "Moderate deep bite causes palatal tissue trauma and lower incisor wear. Active bite-opening mechanics are required.";
      } else {
        explanation = `Severe deep bite. Vertical overlap of ${overlap.toFixed(1)} mm — lower incisors likely completely hidden by uppers.`;
        clinicalSignificance = "Severe deep bite causes significant periodontal damage and condylar loading. May require orthognathic surgery in conjunction with orthodontics.";
      }

      affected.push(11, 21, 41, 31);
    }
  }

  return {
    id: "deep_bite",
    name: "Deep Bite",
    severity: severityFromScore(score),
    score: parseFloat(score.toFixed(1)),
    explanation,
    clinicalSignificance,
    affectedTeeth: affected,
    color: "#a855f7",
  };
}

// ─── Main Engine ─────────────────────────────────────────────────────────────
export function runOrthoAnalysis(
  segments: ToothSegment[],
  measurements: MeasurementSet
): OrthoAnalysisResult {
  const conditions: OrthoCondition[] = [
    analyzeCrowding(segments, measurements),
    analyzeSpacing(segments, measurements),
    analyzeOverjet(segments),
    analyzeOverbite(segments),
    analyzeMidlineDeviation(segments, measurements),
    analyzeRotation(segments),
    analyzeCrossbite(segments),
    analyzeOpenBite(segments),
    analyzeDeepBite(segments),
  ];

  const activeConditions = conditions.filter(c => c.severity !== "none");
  const avgScore = conditions.reduce((s, c) => s + c.score, 0) / conditions.length;
  const severeCnt = conditions.filter(c => c.severity === "severe").length;
  const moderateCnt = conditions.filter(c => c.severity === "moderate").length;

  const complexityScore = clamp(avgScore * 1.2 + severeCnt * 1.5 + moderateCnt * 0.5, 0, 10);

  let treatmentComplexity: OrthoAnalysisResult["treatmentComplexity"] = "simple";
  if (complexityScore > 7) treatmentComplexity = "very_complex";
  else if (complexityScore > 5) treatmentComplexity = "complex";
  else if (complexityScore > 2.5) treatmentComplexity = "moderate";

  const overallSeverity: Severity = severeCnt > 1 ? "severe" : severeCnt === 1 ? "moderate" : moderateCnt > 1 ? "moderate" : activeConditions.length > 0 ? "mild" : "none";

  let summary = "";
  if (activeConditions.length === 0) {
    summary = "Excellent occlusion. No significant orthodontic issues detected. Routine monitoring recommended.";
  } else {
    const names = activeConditions.map(c => c.name).join(", ");
    summary = `${activeConditions.length} condition${activeConditions.length > 1 ? "s" : ""} identified: ${names}. Treatment complexity is ${treatmentComplexity.replace("_", " ")}. ${severeCnt > 0 ? `${severeCnt} severe condition${severeCnt > 1 ? "s" : ""} requiring priority attention.` : ""}`;
  }

  return {
    conditions,
    overallSeverity,
    treatmentComplexity,
    complexityScore: parseFloat(complexityScore.toFixed(1)),
    summary,
    generatedAt: new Date().toISOString(),
  };
}

export function getSeverityColor(severity: Severity): string {
  switch (severity) {
    case "none": return "#22c55e";
    case "mild": return "#eab308";
    case "moderate": return "#f97316";
    case "severe": return "#ef4444";
  }
}

export function getSeverityBadgeClass(severity: Severity): string {
  switch (severity) {
    case "none": return "bg-green-500/20 text-green-400 border-green-500/30";
    case "mild": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    case "moderate": return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    case "severe": return "bg-red-500/20 text-red-400 border-red-500/30";
  }
}
