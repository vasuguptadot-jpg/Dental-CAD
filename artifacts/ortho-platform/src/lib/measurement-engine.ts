import * as THREE from "three";
import type { ToothSegment } from "./segmentation-engine";
import type { ToothLandmarks, Landmark } from "./landmark-engine";

export interface Measurement {
  type: string;
  label: string;
  value: number;
  unit: string;
  toothFdi?: number | null;
}

export interface MeasurementSet {
  archMeasurements: Measurement[];
  toothWidths: Measurement[];
  summary: {
    totalTeeth: number;
    upperTeeth: number;
    lowerTeeth: number;
  };
}

function dist3(a: ToothSegment, b: ToothSegment): number {
  return Math.sqrt(
    (a.centroidX - b.centroidX) ** 2 +
    (a.centroidY - b.centroidY) ** 2 +
    (a.centroidZ - b.centroidZ) ** 2
  );
}

function distXZ(a: ToothSegment, b: ToothSegment): number {
  return Math.sqrt((a.centroidX - b.centroidX) ** 2 + (a.centroidZ - b.centroidZ) ** 2);
}

function getLandmark(tl: ToothLandmarks, type: string): Landmark | undefined {
  return tl.landmarks.find(l => l.type === type);
}

export function calculateMeasurements(
  segments: ToothSegment[],
  allLandmarks: ToothLandmarks[]
): MeasurementSet {
  const archMeasurements: Measurement[] = [];
  const toothWidths: Measurement[] = [];

  const upperSegs = segments.filter(s => s.fdiNumber >= 11 && s.fdiNumber <= 28);
  const lowerSegs = segments.filter(s => s.fdiNumber >= 31 && s.fdiNumber <= 48);

  const lmMap = new Map<number, ToothLandmarks>();
  for (const tl of allLandmarks) lmMap.set(tl.fdiNumber, tl);

  // ── Tooth widths ──────────────────────────────────────────────────
  for (const seg of segments) {
    if (!seg.geometry) continue;
    const pos = seg.geometry.attributes.position as THREE.BufferAttribute;
    if (!pos || pos.count === 0) continue;

    let minX = Infinity, maxX = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }

    const width = Math.abs(maxX - minX);
    toothWidths.push({
      type: "tooth_width",
      label: `Tooth ${seg.fdiNumber} Width`,
      value: parseFloat(width.toFixed(2)),
      unit: "mm",
      toothFdi: seg.fdiNumber,
    });
  }

  // ── Upper arch measurements ───────────────────────────────────────
  if (upperSegs.length >= 2) {
    // Arch width = distance between leftmost and rightmost upper tooth centroids
    const sorted = [...upperSegs].sort((a, b) => a.centroidX - b.centroidX);
    const archWidth = dist3(sorted[0], sorted[sorted.length - 1]);
    archMeasurements.push({
      type: "arch_width",
      label: "Upper Arch Width",
      value: parseFloat(archWidth.toFixed(2)),
      unit: "mm",
    });

    // Arch length = sum of inter-tooth distances along the arch (centroids)
    let archLen = 0;
    const sortedZ = [...upperSegs].sort((a, b) => a.centroidX - b.centroidX);
    for (let i = 1; i < sortedZ.length; i++) {
      archLen += distXZ(sortedZ[i - 1], sortedZ[i]);
    }
    archMeasurements.push({
      type: "arch_length",
      label: "Upper Arch Length",
      value: parseFloat(archLen.toFixed(2)),
      unit: "mm",
    });

    // Inter-canine width: distance between canines (13 & 23) centers
    const canineRight = upperSegs.find(s => s.fdiNumber === 13);
    const canineLeft = upperSegs.find(s => s.fdiNumber === 23);
    if (canineRight && canineLeft) {
      archMeasurements.push({
        type: "inter_canine_width",
        label: "Upper Inter-Canine Width (13–23)",
        value: parseFloat(dist3(canineRight, canineLeft).toFixed(2)),
        unit: "mm",
      });
    }

    // Inter-molar width: distance between first molars (16 & 26)
    const molarRight = upperSegs.find(s => s.fdiNumber === 16);
    const molarLeft = upperSegs.find(s => s.fdiNumber === 26);
    if (molarRight && molarLeft) {
      archMeasurements.push({
        type: "inter_molar_width",
        label: "Upper Inter-Molar Width (16–26)",
        value: parseFloat(dist3(molarRight, molarLeft).toFixed(2)),
        unit: "mm",
      });
    }
  }

  // ── Lower arch measurements ───────────────────────────────────────
  if (lowerSegs.length >= 2) {
    const sorted = [...lowerSegs].sort((a, b) => a.centroidX - b.centroidX);
    const archWidth = dist3(sorted[0], sorted[sorted.length - 1]);
    archMeasurements.push({
      type: "arch_width",
      label: "Lower Arch Width",
      value: parseFloat(archWidth.toFixed(2)),
      unit: "mm",
    });

    let archLen = 0;
    for (let i = 1; i < sorted.length; i++) {
      archLen += distXZ(sorted[i - 1], sorted[i]);
    }
    archMeasurements.push({
      type: "arch_length",
      label: "Lower Arch Length",
      value: parseFloat(archLen.toFixed(2)),
      unit: "mm",
    });

    const canineRight = lowerSegs.find(s => s.fdiNumber === 43);
    const canineLeft = lowerSegs.find(s => s.fdiNumber === 33);
    if (canineRight && canineLeft) {
      archMeasurements.push({
        type: "inter_canine_width",
        label: "Lower Inter-Canine Width (43–33)",
        value: parseFloat(dist3(canineRight, canineLeft).toFixed(2)),
        unit: "mm",
      });
    }

    const molarRight = lowerSegs.find(s => s.fdiNumber === 46);
    const molarLeft = lowerSegs.find(s => s.fdiNumber === 36);
    if (molarRight && molarLeft) {
      archMeasurements.push({
        type: "inter_molar_width",
        label: "Lower Inter-Molar Width (46–36)",
        value: parseFloat(dist3(molarRight, molarLeft).toFixed(2)),
        unit: "mm",
      });
    }
  }

  // ── Midline deviation ─────────────────────────────────────────────
  const upperCentral = upperSegs.find(s => s.fdiNumber === 11) ?? upperSegs.find(s => s.fdiNumber === 21);
  const lowerCentral = lowerSegs.find(s => s.fdiNumber === 41) ?? lowerSegs.find(s => s.fdiNumber === 31);
  if (upperCentral && lowerCentral) {
    const deviation = Math.abs(upperCentral.centroidX - lowerCentral.centroidX);
    archMeasurements.push({
      type: "midline_deviation",
      label: "Midline Deviation",
      value: parseFloat(deviation.toFixed(2)),
      unit: "mm",
    });
  }

  return {
    archMeasurements,
    toothWidths,
    summary: {
      totalTeeth: segments.length,
      upperTeeth: upperSegs.length,
      lowerTeeth: lowerSegs.length,
    },
  };
}

export function serializeMeasurements(ms: MeasurementSet) {
  return {
    archMeasurements: ms.archMeasurements,
    toothWidths: ms.toothWidths,
    summary: ms.summary,
  };
}
