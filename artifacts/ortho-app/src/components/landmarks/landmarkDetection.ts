import * as THREE from "three";
import type { ToothLandmark, LandmarkType, Vec3 } from "./types";

function extractVerticesSampled(geometry: THREE.BufferGeometry, maxSamples = 6000): THREE.Vector3[] {
  const pos = geometry.attributes.position;
  const total = pos.count;
  const step = Math.max(1, Math.floor(total / maxSamples));
  const verts: THREE.Vector3[] = [];
  for (let i = 0; i < total; i += step) {
    verts.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
  }
  return verts;
}

function vecCentroid(verts: THREE.Vector3[]): THREE.Vector3 {
  const c = new THREE.Vector3();
  for (const v of verts) c.add(v);
  return c.divideScalar(verts.length || 1);
}

function toVec3(v: THREE.Vector3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

function kmeansVec3(points: THREE.Vector3[], k: number, maxIter = 25): THREE.Vector3[] {
  if (points.length <= k) return points.map((p) => p.clone());
  const centers = points.slice(0, k).map((p) => p.clone());
  const assignments = new Int32Array(points.length);

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    for (let i = 0; i < points.length; i++) {
      let minD = Infinity;
      let best = 0;
      for (let j = 0; j < k; j++) {
        const d = points[i].distanceToSquared(centers[j]);
        if (d < minD) { minD = d; best = j; }
      }
      if (assignments[i] !== best) { assignments[i] = best; changed = true; }
    }
    if (!changed) break;
    const sums = Array.from({ length: k }, () => new THREE.Vector3());
    const counts = new Int32Array(k);
    for (let i = 0; i < points.length; i++) {
      sums[assignments[i]].add(points[i]);
      counts[assignments[i]]++;
    }
    for (let j = 0; j < k; j++) {
      if (counts[j] > 0) centers[j].copy(sums[j].divideScalar(counts[j]));
    }
  }
  return centers;
}

export function detectToothLandmarks(
  toothGeometry: THREE.BufferGeometry,
  toothId: number,
  precomputedCentroid?: Vec3
): ToothLandmark[] {
  const verts = extractVerticesSampled(toothGeometry);
  if (verts.length < 4) return [];

  const center3 = precomputedCentroid
    ? new THREE.Vector3(precomputedCentroid.x, precomputedCentroid.y, precomputedCentroid.z)
    : vecCentroid(verts);

  const sortedByY = [...verts].sort((a, b) => b.y - a.y);
  const maxY = sortedByY[0].y;
  const minY = sortedByY[sortedByY.length - 1].y;
  const heightRange = maxY - minY || 1;

  const topN = Math.max(4, Math.floor(verts.length * 0.04));
  const bottomN = Math.max(4, Math.floor(verts.length * 0.04));

  const topVerts = sortedByY.slice(0, topN);
  const bottomVerts = sortedByY.slice(-bottomN);

  const incisalCenter = vecCentroid(topVerts);
  const gingivalCenter = vecCentroid(bottomVerts);

  const position = toothId % 10;
  const isMolar = position >= 6 && position <= 8;
  const isPremolar = position >= 4 && position <= 5;

  const cuspN = Math.max(topN, Math.floor(verts.length * 0.12));
  const cuspCandidates = sortedByY.slice(0, cuspN);
  const numCusps = isMolar ? 4 : isPremolar ? 2 : 1;
  const cuspCenters = numCusps > 1 ? kmeansVec3(cuspCandidates, numCusps) : [vecCentroid(cuspCandidates)];

  const sortedByX = [...verts].sort((a, b) => a.x - b.x);
  const contactN = Math.max(3, Math.floor(verts.length * 0.03));
  const contactMesialCenter = vecCentroid(sortedByX.slice(0, contactN));
  const contactDistalCenter = vecCentroid(sortedByX.slice(-contactN));

  const landmarks: ToothLandmark[] = [
    {
      id: `${toothId}_center`,
      toothId,
      type: "center",
      position: toVec3(center3),
      confidence: 100,
      isManual: false,
    },
    {
      id: `${toothId}_incisal_edge`,
      toothId,
      type: "incisal_edge",
      position: toVec3(incisalCenter),
      confidence: 85,
      isManual: false,
    },
    {
      id: `${toothId}_gingival_margin`,
      toothId,
      type: "gingival_margin",
      position: toVec3(gingivalCenter),
      confidence: 80,
      isManual: false,
    },
    {
      id: `${toothId}_contact_mesial`,
      toothId,
      type: "contact_mesial",
      position: toVec3(contactMesialCenter),
      confidence: 75,
      isManual: false,
    },
    {
      id: `${toothId}_contact_distal`,
      toothId,
      type: "contact_distal",
      position: toVec3(contactDistalCenter),
      confidence: 75,
      isManual: false,
    },
  ];

  cuspCenters.forEach((cc, i) => {
    landmarks.push({
      id: `${toothId}_cusp_${i}`,
      toothId,
      type: "cusp",
      position: toVec3(cc),
      confidence: 82,
      isManual: false,
    });
  });

  return landmarks;
}

export function detectAllLandmarks(
  toothMeshes: { geometry: THREE.BufferGeometry; toothId: number; centroid: Vec3 }[]
): ToothLandmark[] {
  const all: ToothLandmark[] = [];
  for (const tm of toothMeshes) {
    all.push(...detectToothLandmarks(tm.geometry, tm.toothId, tm.centroid));
  }
  return all;
}
