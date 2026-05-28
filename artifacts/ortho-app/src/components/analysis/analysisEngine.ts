import type { ToothLandmark } from "../landmarks/types";
import type { ToothSegmentData } from "../segmentation/types";
import type {
  OrthoFinding,
  OrthoAnalysis,
  OrthoAnalysisType,
  SeverityLabel,
  ComplexityLabel,
  ToothHealthEntry,
} from "./types";
import { getFDIName, FDI_MAP } from "../segmentation/fdiMapping";

// ── helpers ──────────────────────────────────────────────────────────────────

type Vec2 = { x: number; z: number };
type Vec3 = { x: number; y: number; z: number };

function dist2(a: Vec2, b: Vec2) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);
}
function normalize2(v: Vec2): Vec2 {
  const len = Math.sqrt(v.x * v.x + v.z * v.z) || 1;
  return { x: v.x / len, z: v.z / len };
}
function dot2(a: Vec2, b: Vec2) {
  return a.x * b.x + a.z * b.z;
}

function severityLabel(score: number): SeverityLabel {
  if (score < 0.5) return "none";
  if (score < 3.5) return "mild";
  if (score < 6) return "moderate";
  if (score < 8) return "severe";
  return "critical";
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function scaleSeverity(value: number, thresholds: [number, number, number, number]): number {
  // thresholds = [mild, moderate, severe, critical] boundary values
  if (value <= 0) return 0;
  if (value < thresholds[0]) return (value / thresholds[0]) * 2.5;
  if (value < thresholds[1]) return 2.5 + ((value - thresholds[0]) / (thresholds[1] - thresholds[0])) * 2.5;
  if (value < thresholds[2]) return 5 + ((value - thresholds[1]) / (thresholds[2] - thresholds[1])) * 2;
  if (value < thresholds[3]) return 7 + ((value - thresholds[2]) / (thresholds[3] - thresholds[2]));
  return clamp(9 + (value - thresholds[3]) / thresholds[3], 9, 10);
}

// ── index builders ─────────────────────────────────────────────────────────

type LmIndex = Map<number, Map<string, Vec3>>;

function buildLmIndex(landmarks: ToothLandmark[]): LmIndex {
  const idx: LmIndex = new Map();
  for (const lm of landmarks) {
    if (!idx.has(lm.toothId)) idx.set(lm.toothId, new Map());
    idx.get(lm.toothId)!.set(lm.type, lm.position);
  }
  return idx;
}

function getPos(idx: LmIndex, toothId: number, type: string): Vec3 | undefined {
  return idx.get(toothId)?.get(type);
}

// ── individual finding generators ─────────────────────────────────────────

function analyzeCrowdingSpacing(
  segments: ToothSegmentData[],
  lmIndex: LmIndex,
): OrthoFinding[] {
  const findings: OrthoFinding[] = [];
  const presentIds = new Set(segments.map((s) => s.toothId));

  // Sum tooth widths from contact points
  let totalWidth = 0;
  let widthCount = 0;
  for (const seg of segments) {
    const cm = getPos(lmIndex, seg.toothId, "contact_mesial");
    const cd = getPos(lmIndex, seg.toothId, "contact_distal");
    if (cm && cd) {
      const w = Math.sqrt((cm.x - cd.x) ** 2 + (cm.y - cd.y) ** 2 + (cm.z - cd.z) ** 2);
      totalWidth += w;
      widthCount++;
    }
  }
  if (widthCount === 0) return [];

  // Estimate available arch length from centroids of ordered teeth
  const sorted = [...segments].sort((a, b) => a.centroid.x - b.centroid.x);
  let archLength = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i].centroid;
    const b = sorted[i + 1].centroid;
    archLength += Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);
  }
  archLength *= 1.15; // arc factor

  if (archLength < 1) return [];
  const discrepancy = totalWidth - archLength;

  if (discrepancy > 0.5) {
    // Crowding
    const severity = scaleSeverity(discrepancy, [2, 4, 6, 9]);
    const affectedTeeth = sorted.map((s) => s.toothId);
    findings.push({
      id: "crowding",
      type: "crowding",
      name: "Dental Crowding",
      severity: +severity.toFixed(1),
      severityLabel: severityLabel(severity),
      affectedTeeth,
      value: +discrepancy.toFixed(1),
      unit: "mm",
      normalRange: [0, 2],
      explanation:
        `The required space for all teeth (${totalWidth.toFixed(1)} mm) exceeds ` +
        `the available arch length (${archLength.toFixed(1)} mm) by ${discrepancy.toFixed(1)} mm, ` +
        `resulting in ${severityLabel(severity)} crowding.`,
      clinicalSignificance:
        severity < 3.5
          ? "Minor crowding may self-correct or require simple expansion."
          : severity < 6
          ? "Moderate crowding typically requires orthodontic treatment. Consider arch expansion or selective extraction."
          : "Severe crowding almost always requires comprehensive orthodontic treatment, possibly with extraction of premolars.",
      dataStatus: "computed",
    });
  } else if (discrepancy < -1) {
    // Spacing
    const spacing = Math.abs(discrepancy);
    const severity = scaleSeverity(spacing, [1.5, 3, 5, 8]);
    findings.push({
      id: "spacing",
      type: "spacing",
      name: "Dental Spacing",
      severity: +severity.toFixed(1),
      severityLabel: severityLabel(severity),
      affectedTeeth: sorted.map((s) => s.toothId),
      value: +spacing.toFixed(1),
      unit: "mm",
      normalRange: [0, 1],
      explanation:
        `The available arch length (${archLength.toFixed(1)} mm) exceeds the required tooth width ` +
        `(${totalWidth.toFixed(1)} mm) by ${spacing.toFixed(1)} mm, indicating excess spacing.`,
      clinicalSignificance:
        severity < 3.5
          ? "Minor spacing is often cosmetic only and may be managed with composite bonding."
          : "Significant spacing may indicate missing teeth, microdontia, or habit-related causes. Full orthodontic evaluation recommended.",
      dataStatus: "computed",
    });
  } else {
    findings.push({
      id: "crowding",
      type: "crowding",
      name: "Crowding",
      severity: 0,
      severityLabel: "none",
      affectedTeeth: [],
      explanation: "No significant crowding or spacing discrepancy detected. Arch length and tooth sum are well balanced.",
      clinicalSignificance: "Arch length appears adequate for the present dentition.",
      dataStatus: "normal",
    });
  }

  return findings;
}

function analyzeMidlineDeviation(lmIndex: LmIndex, jawType: string): OrthoFinding {
  const isUpper = jawType !== "lower";

  const c1 = isUpper ? getPos(lmIndex, 11, "center") : getPos(lmIndex, 41, "center");
  const c2 = isUpper ? getPos(lmIndex, 21, "center") : getPos(lmIndex, 31, "center");

  if (!c1 || !c2) {
    return {
      id: "midline_deviation",
      type: "midline_deviation",
      name: "Midline Deviation",
      severity: 0,
      severityLabel: "none",
      affectedTeeth: [],
      explanation: "Central incisor landmarks not detected; midline analysis unavailable.",
      clinicalSignificance: "Ensure central incisor landmarks are detected for midline analysis.",
      dataStatus: "insufficient_data",
    };
  }

  const midX = (c1.x + c2.x) / 2;
  const deviation = Math.abs(midX);
  const severity = scaleSeverity(deviation, [1, 2, 3.5, 5]);
  const dir = midX > 0 ? "right" : "left";

  const teeth = isUpper ? [11, 21] : [31, 41];

  return {
    id: "midline_deviation",
    type: "midline_deviation",
    name: "Midline Deviation",
    severity: +severity.toFixed(1),
    severityLabel: severityLabel(severity),
    affectedTeeth: deviation > 1 ? teeth : [],
    value: +deviation.toFixed(2),
    unit: "mm",
    normalRange: [0, 2],
    explanation:
      deviation < 1
        ? "Dental midline is well-centered within normal limits."
        : `The ${isUpper ? "upper" : "lower"} dental midline deviates ${deviation.toFixed(1)} mm to the ${dir} of the arch center.`,
    clinicalSignificance:
      severity < 1
        ? "Midline within normal clinical tolerance."
        : severity < 4
        ? "Mild midline deviation; assess facial symmetry. May require minor tooth movement."
        : "Significant midline deviation affecting aesthetics. Orthodontic correction recommended with possible skeletal evaluation.",
    dataStatus: "computed",
  };
}

function analyzeRotations(segments: ToothSegmentData[], lmIndex: LmIndex): OrthoFinding[] {
  if (segments.length < 3) return [];

  // Estimate arch center from all centroids
  const allCentroids = segments.map((s) => s.centroid);
  const archCenterX = allCentroids.reduce((s, c) => s + c.x, 0) / allCentroids.length;
  const archCenterZ = Math.min(...allCentroids.map((c) => c.z)) - 15;

  const rotatedTeeth: { toothId: number; angle: number }[] = [];

  for (const seg of segments) {
    const cm = getPos(lmIndex, seg.toothId, "contact_mesial");
    const cd = getPos(lmIndex, seg.toothId, "contact_distal");
    if (!cm || !cd) continue;

    const actualAxis = normalize2({ x: cd.x - cm.x, z: cd.z - cm.z });
    const radial = normalize2({
      x: seg.centroid.x - archCenterX,
      z: seg.centroid.z - archCenterZ,
    });
    // Expected tangent is perpendicular to radial
    const expectedTangent = normalize2({ x: -radial.z, z: radial.x });

    const cosAngle = clamp(Math.abs(dot2(actualAxis, expectedTangent)), 0, 1);
    const angleDeg = (Math.acos(cosAngle) * 180) / Math.PI;

    if (angleDeg > 8) {
      rotatedTeeth.push({ toothId: seg.toothId, angle: angleDeg });
    }
  }

  if (rotatedTeeth.length === 0) {
    return [
      {
        id: "rotation",
        type: "rotation",
        name: "Tooth Rotation",
        severity: 0,
        severityLabel: "none",
        affectedTeeth: [],
        explanation: "No significant tooth rotations detected. All teeth are aligned with the arch tangent.",
        clinicalSignificance: "Normal rotational alignment observed.",
        dataStatus: "normal",
      },
    ];
  }

  // Group into one finding, with most severe tooth driving severity
  const maxAngle = Math.max(...rotatedTeeth.map((t) => t.angle));
  const severity = scaleSeverity(maxAngle, [10, 20, 30, 45]);
  const affectedTeeth = rotatedTeeth.map((t) => t.toothId);

  const toothDescriptions = rotatedTeeth
    .slice(0, 5)
    .map((t) => `${getFDIName(t.toothId)} (${t.angle.toFixed(0)}°)`)
    .join(", ");

  return [
    {
      id: "rotation",
      type: "rotation",
      name: "Tooth Rotation",
      severity: +severity.toFixed(1),
      severityLabel: severityLabel(severity),
      affectedTeeth,
      value: +maxAngle.toFixed(1),
      unit: "°",
      normalRange: [0, 8],
      explanation: `${rotatedTeeth.length} tooth${rotatedTeeth.length > 1 ? "s" : ""} show significant rotation from the expected arch tangent: ${toothDescriptions}.`,
      clinicalSignificance:
        severity < 4
          ? "Minor rotations; often correctable with aligners or light wire mechanics."
          : severity < 7
          ? "Moderate rotations requiring active orthodontic derotation. Over-correction planning recommended."
          : "Severe rotations. Significant treatment time expected; biological retention critical post-treatment.",
      dataStatus: "computed",
    },
  ];
}

function analyzeInterArchFindings(
  lmIndex: LmIndex,
  jawType: string,
  segments: ToothSegmentData[]
): OrthoFinding[] {
  const findings: OrthoFinding[] = [];
  const isFull = jawType === "full";

  const insufficientNote = "Requires both upper and lower arches. Run analysis on a full-arch scan for inter-arch measurements.";

  // ── overjet ───────────────────────────────────────────────────────────────
  const u11 = getPos(lmIndex, 11, "incisal_edge");
  const u21 = getPos(lmIndex, 21, "incisal_edge");
  const l31 = getPos(lmIndex, 31, "incisal_edge");
  const l41 = getPos(lmIndex, 41, "incisal_edge");

  if (isFull && u11 && u21 && l31 && l41) {
    const upperZ = (u11.z + u21.z) / 2;
    const lowerZ = (l31.z + l41.z) / 2;
    const overjet = Math.abs(upperZ - lowerZ);
    const severity = scaleSeverity(Math.max(overjet - 3, 0), [1, 3, 5, 8]);
    findings.push({
      id: "overjet",
      type: "overjet",
      name: "Overjet",
      severity: overjet < 1 || overjet > 3 ? +severity.toFixed(1) : 0,
      severityLabel: overjet >= 1 && overjet <= 3 ? "none" : severityLabel(severity),
      affectedTeeth: [11, 21, 31, 41],
      value: +overjet.toFixed(2),
      unit: "mm",
      normalRange: [1, 3],
      explanation:
        overjet >= 1 && overjet <= 3
          ? `Overjet measures ${overjet.toFixed(1)} mm — within the normal range of 1–3 mm.`
          : `Overjet measures ${overjet.toFixed(1)} mm, which is ${overjet > 3 ? "increased" : "reduced"} (normal: 1–3 mm).`,
      clinicalSignificance:
        overjet < 1 || overjet > 3
          ? overjet > 5
            ? "Significant overjet. High risk of incisor trauma; functional Class II correction likely needed."
            : "Mild-moderate overjet. Upper incisor retraction or lower incisor proclination may be required."
          : "Overjet is within normal limits. No clinical intervention required for overjet alone.",
      dataStatus: "computed",
    });
  } else {
    findings.push({
      id: "overjet", type: "overjet", name: "Overjet",
      severity: 0, severityLabel: "none", affectedTeeth: [],
      explanation: insufficientNote, clinicalSignificance: "Single-arch scan. Full-arch scan required.",
      dataStatus: "insufficient_data",
    });
  }

  // ── overbite / deep bite / open bite ──────────────────────────────────────
  const uIncisal11 = getPos(lmIndex, 11, "incisal_edge");
  const lIncisal41 = getPos(lmIndex, 41, "incisal_edge");

  if (isFull && uIncisal11 && lIncisal41) {
    const overbite = uIncisal11.y - lIncisal41.y;

    // Overbite finding
    const overbiteVal = overbite;
    const overbiteAbnormal = overbiteVal < 0.5 || overbiteVal > 4;
    const overbiteSev = overbiteVal < 0.5
      ? scaleSeverity(Math.abs(overbiteVal), [0.5, 1.5, 3, 5])
      : scaleSeverity(Math.max(overbiteVal - 4, 0), [1, 2, 3.5, 5]);

    findings.push({
      id: "overbite", type: "overbite", name: "Overbite",
      severity: overbiteAbnormal ? +overbiteSev.toFixed(1) : 0,
      severityLabel: overbiteAbnormal ? severityLabel(overbiteSev) : "none",
      affectedTeeth: overbiteAbnormal ? [11, 21, 31, 41] : [],
      value: +overbiteVal.toFixed(2), unit: "mm", normalRange: [1, 3],
      explanation:
        !overbiteAbnormal
          ? `Overbite measures ${overbiteVal.toFixed(1)} mm — within the normal range of 1–3 mm.`
          : `Overbite is ${overbiteVal.toFixed(1)} mm, which is ${overbiteVal < 0.5 ? "reduced" : "excessive"} (normal: 1–3 mm).`,
      clinicalSignificance:
        !overbiteAbnormal
          ? "Vertical incisor relationship is within normal limits."
          : overbiteVal > 4
          ? "Deep bite present. May cause palatal trauma, TMJ stress, and enamel wear."
          : "Reduced overbite. Check for open bite tendencies and tongue habit.",
      dataStatus: "computed",
    });

    // Deep bite
    if (overbite > 4) {
      const dbSev = scaleSeverity(overbite - 4, [1, 2, 3, 5]);
      findings.push({
        id: "deep_bite", type: "deep_bite", name: "Deep Bite",
        severity: +dbSev.toFixed(1), severityLabel: severityLabel(dbSev),
        affectedTeeth: [11, 21, 31, 41],
        value: +overbite.toFixed(2), unit: "mm", normalRange: [1, 4],
        explanation: `Deep bite detected: upper incisors overlap lower incisors by ${overbite.toFixed(1)} mm vertically (normal ≤ 4 mm).`,
        clinicalSignificance:
          "Deep bite can cause palatal gingival trauma, TMD symptoms, and enamel wear. Intrusion of anterior teeth or extrusion of posterior teeth may be required.",
        dataStatus: "computed",
      });
    } else {
      findings.push({
        id: "deep_bite", type: "deep_bite", name: "Deep Bite",
        severity: 0, severityLabel: "none", affectedTeeth: [],
        explanation: "No deep bite detected. Vertical overbite is within acceptable limits.",
        clinicalSignificance: "No deep bite intervention required.",
        dataStatus: "normal",
      });
    }

    // Open bite
    if (overbite < 0) {
      const obSev = scaleSeverity(Math.abs(overbite), [1, 2, 3, 5]);
      findings.push({
        id: "open_bite", type: "open_bite", name: "Open Bite",
        severity: +obSev.toFixed(1), severityLabel: severityLabel(obSev),
        affectedTeeth: [11, 12, 21, 22, 31, 32, 41, 42],
        value: +Math.abs(overbite).toFixed(2), unit: "mm",
        explanation: `Anterior open bite of ${Math.abs(overbite).toFixed(1)} mm: upper and lower anterior teeth do not make vertical contact.`,
        clinicalSignificance:
          "Open bite may result from digit habits, tongue thrust, or skeletal discrepancy. Habit elimination and functional appliances or orthognathic surgery may be required.",
        dataStatus: "computed",
      });
    } else {
      findings.push({
        id: "open_bite", type: "open_bite", name: "Open Bite",
        severity: 0, severityLabel: "none", affectedTeeth: [],
        explanation: "No anterior open bite detected. Adequate vertical overlap is present.",
        clinicalSignificance: "No open bite intervention required.",
        dataStatus: "normal",
      });
    }
  } else {
    for (const type of ["overbite", "deep_bite", "open_bite"] as const) {
      findings.push({
        id: type, type, name: type.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        severity: 0, severityLabel: "none", affectedTeeth: [],
        explanation: insufficientNote,
        clinicalSignificance: "Single-arch scan. Full-arch scan required.",
        dataStatus: "insufficient_data",
      });
    }
  }

  // ── crossbite ──────────────────────────────────────────────────────────────
  const upperIds = segments.filter((s) => s.toothId < 30).map((s) => s.toothId);
  const lowerIds = segments.filter((s) => s.toothId >= 30).map((s) => s.toothId);

  if (isFull && upperIds.length > 0 && lowerIds.length > 0) {
    const crossbiteTeeth: number[] = [];
    // Check each upper posterior tooth vs its lower counterpart
    const pairs: [number, number][] = [[14, 44], [15, 45], [16, 46], [24, 34], [25, 35], [26, 36]];
    for (const [upper, lower] of pairs) {
      const uc = getPos(lmIndex, upper, "center");
      const lc = getPos(lmIndex, lower, "center");
      if (!uc || !lc) continue;
      // In upper arch, buccal cusp should be at larger X absolute value than lower
      // Crossbite = upper tooth is more lingual (smaller |X|) than lower
      if (Math.abs(uc.x) < Math.abs(lc.x) - 1) {
        crossbiteTeeth.push(upper, lower);
      }
    }

    if (crossbiteTeeth.length > 0) {
      const severity = scaleSeverity(crossbiteTeeth.length / 2, [1, 2, 3, 5]);
      findings.push({
        id: "crossbite", type: "crossbite", name: "Crossbite",
        severity: +severity.toFixed(1), severityLabel: severityLabel(severity),
        affectedTeeth: [...new Set(crossbiteTeeth)],
        value: crossbiteTeeth.length / 2,
        unit: "teeth affected",
        explanation: `Posterior crossbite detected on ${crossbiteTeeth.length / 2} tooth pair(s): upper posterior teeth are positioned lingual to lower counterparts.`,
        clinicalSignificance:
          "Crossbite can cause mandibular shifts, asymmetric jaw growth, and TMJ problems. Expansion appliances or crossbite correction springs are typically indicated.",
        dataStatus: "computed",
      });
    } else {
      findings.push({
        id: "crossbite", type: "crossbite", name: "Crossbite",
        severity: 0, severityLabel: "none", affectedTeeth: [],
        explanation: "No posterior crossbite detected. Upper teeth are positioned buccal to lower teeth as expected.",
        clinicalSignificance: "No crossbite correction required.",
        dataStatus: "normal",
      });
    }
  } else {
    findings.push({
      id: "crossbite", type: "crossbite", name: "Crossbite",
      severity: 0, severityLabel: "none", affectedTeeth: [],
      explanation: insufficientNote,
      clinicalSignificance: "Single-arch scan. Full-arch scan required.",
      dataStatus: "insufficient_data",
    });
  }

  return findings;
}

// ── health map ─────────────────────────────────────────────────────────────

function buildToothHealthMap(
  findings: OrthoFinding[],
  segments: ToothSegmentData[]
): Record<number, ToothHealthEntry> {
  const map: Record<number, ToothHealthEntry> = {};

  for (const seg of segments) {
    map[seg.toothId] = { severity: 0, severityLabel: "none", issues: [] };
  }

  for (const finding of findings) {
    if (finding.severity < 0.5 || finding.dataStatus !== "computed") continue;
    for (const toothId of finding.affectedTeeth) {
      if (!map[toothId]) map[toothId] = { severity: 0, severityLabel: "none", issues: [] };
      const entry = map[toothId];
      if (finding.severity > entry.severity) {
        entry.severity = finding.severity;
        entry.severityLabel = finding.severityLabel;
      }
      entry.issues.push(finding.name);
    }
  }

  return map;
}

// ── complexity ──────────────────────────────────────────────────────────────

function computeComplexity(findings: OrthoFinding[]): {
  score: number;
  label: ComplexityLabel;
} {
  const active = findings.filter(
    (f) => f.dataStatus === "computed" && f.severity > 0
  );
  if (active.length === 0) return { score: 0, label: "low" };

  const weightedSum = active.reduce((s, f) => {
    // Crown types carry more weight
    const weight = ["rotation", "crowding", "deep_bite", "crossbite"].includes(f.type) ? 1.3 : 1.0;
    return s + f.severity * weight;
  }, 0);
  const score = clamp(weightedSum / active.length, 0, 10);

  const label: ComplexityLabel =
    score < 3 ? "low" : score < 5.5 ? "moderate" : score < 7.5 ? "high" : "severe";
  return { score: +score.toFixed(1), label };
}

function buildSummary(
  findings: OrthoFinding[],
  complexity: ComplexityLabel,
  affectedCount: number
): string {
  const active = findings.filter(
    (f) => f.dataStatus === "computed" && f.severity >= 3.5
  );
  if (active.length === 0)
    return "No significant orthodontic concerns detected. Arch and tooth relationships appear within normal limits.";

  const names = active.slice(0, 3).map((f) => f.name).join(", ");
  return `${affectedCount} tooth${affectedCount !== 1 ? "teeth" : ""} affected. Primary concerns: ${names}. Overall treatment complexity: ${complexity}.`;
}

// ── main entry point ────────────────────────────────────────────────────────

export function runOrthoAnalysis(
  landmarks: ToothLandmark[],
  segments: ToothSegmentData[],
  jawType: string
): OrthoAnalysis {
  const lmIndex = buildLmIndex(landmarks);

  const findings: OrthoFinding[] = [
    ...analyzeCrowdingSpacing(segments, lmIndex),
    analyzeMidlineDeviation(lmIndex, jawType),
    ...analyzeRotations(segments, lmIndex),
    ...analyzeInterArchFindings(lmIndex, jawType, segments),
  ];

  const healthMap = buildToothHealthMap(findings, segments);
  const affectedTeeth = new Set(findings.flatMap((f) => f.affectedTeeth));
  const { score: complexityScore, label: complexityLabel } = computeComplexity(findings);
  const summary = buildSummary(findings, complexityLabel, affectedTeeth.size);

  return {
    findings,
    complexityScore,
    complexityLabel,
    toothHealthMap: healthMap,
    summary,
    affectedToothCount: affectedTeeth.size,
    analyzedAt: new Date().toISOString(),
  };
}
