import * as THREE from "three";
import type { ToothSegment } from "./segmentation-engine";

export type LandmarkType = "incisal_edge" | "cusp" | "contact_point" | "gingival_margin" | "center";

export interface Landmark {
  id: string;
  fdiNumber: number;
  type: LandmarkType;
  x: number;
  y: number;
  z: number;
  isManual: boolean;
}

export interface ToothLandmarks {
  fdiNumber: number;
  landmarks: Landmark[];
}

let _idCounter = 0;
function newId() { return `lm_${++_idCounter}_${Math.random().toString(36).slice(2, 7)}`; }

/**
 * Detects landmarks for all tooth segments using geometric analysis.
 */
export function detectLandmarks(segments: ToothSegment[]): ToothLandmarks[] {
  return segments
    .filter(s => s.geometry && s.geometry.attributes.position)
    .map(seg => detectToothLandmarks(seg));
}

function detectToothLandmarks(seg: ToothSegment): ToothLandmarks {
  const geo = seg.geometry!;
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const count = pos.count;

  if (count === 0) {
    return { fdiNumber: seg.fdiNumber, landmarks: [] };
  }

  // Collect all vertex positions
  const verts: THREE.Vector3[] = [];
  for (let i = 0; i < count; i++) {
    verts.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
  }

  const landmarks: Landmark[] = [];
  const fdi = seg.fdiNumber;
  const isUpper = fdi >= 11 && fdi <= 28;

  // ── Center ──────────────────────────────────────────────────────────
  const center = new THREE.Vector3(seg.centroidX, seg.centroidY, seg.centroidZ);
  landmarks.push({ id: newId(), fdiNumber: fdi, type: "center", x: center.x, y: center.y, z: center.z, isManual: false });

  // ── Y extremes (top/bottom of crown depending on jaw) ────────────────
  // For upper jaw: gingival is high Y, incisal/occlusal is low Y
  // For lower jaw: gingival is low Y, incisal/occlusal is high Y
  let minY = Infinity, maxY = -Infinity;
  let minYVert = verts[0], maxYVert = verts[0];
  let minZ = Infinity, maxZ = -Infinity;
  let minZVert = verts[0], maxZVert = verts[0];

  for (const v of verts) {
    if (v.y < minY) { minY = v.y; minYVert = v; }
    if (v.y > maxY) { maxY = v.y; maxYVert = v; }
    if (v.z < minZ) { minZ = v.z; minZVert = v; }
    if (v.z > maxZ) { maxZ = v.z; maxZVert = v; }
  }

  // Incisal edge: the edge toward the center of the mouth
  // For front teeth (1x, 2x anterior): it's along Z direction
  // For posterior (molars/premolars): it's along Y (occlusal surface)
  const toothNum = fdi % 10;
  const isAnterior = toothNum <= 3;

  const incisalVert = isUpper ? minYVert : maxYVert;
  landmarks.push({
    id: newId(), fdiNumber: fdi, type: "incisal_edge",
    x: incisalVert.x, y: incisalVert.y, z: incisalVert.z, isManual: false
  });

  // Gingival margin: opposite extreme
  const gingivalVert = isUpper ? maxYVert : minYVert;
  landmarks.push({
    id: newId(), fdiNumber: fdi, type: "gingival_margin",
    x: gingivalVert.x, y: gingivalVert.y, z: gingivalVert.z, isManual: false
  });

  // ── Cusps: local Y maxima across X slices ──────────────────────────
  const cusps = detectCusps(verts, isUpper, toothNum);
  for (const c of cusps) {
    landmarks.push({ id: newId(), fdiNumber: fdi, type: "cusp", x: c.x, y: c.y, z: c.z, isManual: false });
  }

  // ── Contact points: leftmost and rightmost X extremes ──────────────
  let minX = Infinity, maxX = -Infinity;
  let minXVert = verts[0], maxXVert = verts[0];
  for (const v of verts) {
    if (v.x < minX) { minX = v.x; minXVert = v; }
    if (v.x > maxX) { maxX = v.x; maxXVert = v; }
  }

  landmarks.push({
    id: newId(), fdiNumber: fdi, type: "contact_point",
    x: minXVert.x, y: minXVert.y, z: minXVert.z, isManual: false
  });
  landmarks.push({
    id: newId(), fdiNumber: fdi, type: "contact_point",
    x: maxXVert.x, y: maxXVert.y, z: maxXVert.z, isManual: false
  });

  return { fdiNumber: fdi, landmarks };
}

function detectCusps(verts: THREE.Vector3[], isUpper: boolean, toothNum: number): THREE.Vector3[] {
  const numCusps = toothNum <= 2 ? 1 : toothNum === 3 ? 1 : toothNum <= 5 ? 2 : 3;

  if (verts.length < 10) return [];

  // Divide vertices into X slices and find Y extreme in each
  const xVals = verts.map(v => v.x);
  const xMin = Math.min(...xVals), xMax = Math.max(...xVals);
  const xRange = xMax - xMin;
  if (xRange < 0.1) return [verts[0]];

  const slices: THREE.Vector3[][] = Array.from({ length: numCusps }, () => []);
  for (const v of verts) {
    const sliceIdx = Math.floor(((v.x - xMin) / xRange) * (numCusps - 0.001));
    slices[Math.max(0, Math.min(numCusps - 1, sliceIdx))].push(v);
  }

  const cusps: THREE.Vector3[] = [];
  for (const slice of slices) {
    if (slice.length === 0) continue;
    let best = slice[0];
    for (const v of slice) {
      if (isUpper ? v.y < best.y : v.y > best.y) best = v;
    }
    cusps.push(best);
  }
  return cusps;
}

export function serializeLandmarks(toothLandmarks: ToothLandmarks[]) {
  return {
    teeth: toothLandmarks.map(t => ({
      fdiNumber: t.fdiNumber,
      landmarks: t.landmarks.map(l => ({ ...l })),
    })),
  };
}
