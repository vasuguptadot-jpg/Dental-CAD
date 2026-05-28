import * as THREE from "three";
import { getTeethForJaw, getToothColor } from "./fdiMapping";
import type { ToothSegmentData } from "./types";

interface FaceCentroid {
  x: number;
  z: number;
  faceIndex: number;
}

function kmeans(
  points: FaceCentroid[],
  k: number,
  maxIter = 40
): { assignments: Int32Array; centers: { x: number; z: number }[] } {
  const n = points.length;
  if (n === 0 || k === 0) return { assignments: new Int32Array(0), centers: [] };

  const kActual = Math.min(k, n);
  const centers: { x: number; z: number }[] = [];

  const firstIdx = Math.floor(Math.random() * n);
  centers.push({ x: points[firstIdx].x, z: points[firstIdx].z });

  while (centers.length < kActual) {
    let sumD = 0;
    const dists: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      let minD = Infinity;
      for (const c of centers) {
        const dx = points[i].x - c.x;
        const dz = points[i].z - c.z;
        const d = dx * dx + dz * dz;
        if (d < minD) minD = d;
      }
      dists[i] = minD;
      sumD += minD;
    }
    let r = Math.random() * sumD;
    for (let i = 0; i < n; i++) {
      r -= dists[i];
      if (r <= 0) {
        centers.push({ x: points[i].x, z: points[i].z });
        break;
      }
    }
    if (centers.length < kActual && r > 0) {
      centers.push({ x: points[n - 1].x, z: points[n - 1].z });
    }
  }

  const assignments = new Int32Array(n).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let minD = Infinity;
      let best = 0;
      for (let j = 0; j < kActual; j++) {
        const dx = points[i].x - centers[j].x;
        const dz = points[i].z - centers[j].z;
        const d = dx * dx + dz * dz;
        if (d < minD) { minD = d; best = j; }
      }
      if (assignments[i] !== best) { assignments[i] = best; changed = true; }
    }
    if (!changed) break;

    const sums = centers.map(() => ({ x: 0, z: 0, count: 0 }));
    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      sums[c].x += points[i].x;
      sums[c].z += points[i].z;
      sums[c].count++;
    }
    for (let j = 0; j < kActual; j++) {
      if (sums[j].count > 0) {
        centers[j].x = sums[j].x / sums[j].count;
        centers[j].z = sums[j].z / sums[j].count;
      }
    }
  }

  return { assignments, centers };
}

function assignAllFacesToClusters(
  allCentroids: FaceCentroid[],
  sampleCentroids: FaceCentroid[],
  sampleAssignments: Int32Array,
  centers: { x: number; z: number }[]
): Int32Array {
  const allAssignments = new Int32Array(allCentroids.length);
  const k = centers.length;

  for (let i = 0; i < allCentroids.length; i++) {
    let minD = Infinity;
    let best = 0;
    for (let j = 0; j < k; j++) {
      const dx = allCentroids[i].x - centers[j].x;
      const dz = allCentroids[i].z - centers[j].z;
      const d = dx * dx + dz * dz;
      if (d < minD) { minD = d; best = j; }
    }
    allAssignments[i] = best;
  }

  return allAssignments;
}

function computeFaceCentroids(geometry: THREE.BufferGeometry): FaceCentroid[] {
  const positions = geometry.attributes.position;
  const index = geometry.index;
  const centroids: FaceCentroid[] = [];

  if (index) {
    const faceCount = index.count / 3;
    for (let i = 0; i < faceCount; i++) {
      const a = index.getX(i * 3);
      const b = index.getX(i * 3 + 1);
      const c = index.getX(i * 3 + 2);
      centroids.push({
        x: (positions.getX(a) + positions.getX(b) + positions.getX(c)) / 3,
        z: (positions.getZ(a) + positions.getZ(b) + positions.getZ(c)) / 3,
        faceIndex: i,
      });
    }
  } else {
    const faceCount = positions.count / 3;
    for (let i = 0; i < faceCount; i++) {
      const base = i * 3;
      centroids.push({
        x: (positions.getX(base) + positions.getX(base + 1) + positions.getX(base + 2)) / 3,
        z: (positions.getZ(base) + positions.getZ(base + 1) + positions.getZ(base + 2)) / 3,
        faceIndex: i,
      });
    }
  }

  return centroids;
}

function subsample(points: FaceCentroid[], maxCount: number): FaceCentroid[] {
  if (points.length <= maxCount) return points;
  const step = Math.ceil(points.length / maxCount);
  return points.filter((_, i) => i % step === 0);
}

function assignFDILabels(
  centers: { x: number; z: number }[],
  jawType: string
): number[] {
  const teeth = getTeethForJaw(jawType);
  const n = Math.min(centers.length, teeth.length);

  const indexed = centers.map((c, i) => ({ ...c, clusterIdx: i }));

  indexed.sort((a, b) => {
    const sideA = a.x < 0 ? 0 : 1;
    const sideB = b.x < 0 ? 0 : 1;
    if (sideA !== sideB) return sideA - sideB;
    if (sideA === 0) return b.z - a.z;
    return a.z - b.z;
  });

  const fdiAssignment = new Array<number>(centers.length).fill(0);
  for (let i = 0; i < n; i++) {
    fdiAssignment[indexed[i].clusterIdx] = teeth[i]?.id ?? i + 11;
  }

  return fdiAssignment;
}

export function segmentDentalMesh(
  geometry: THREE.BufferGeometry,
  jawType: string,
  onProgress?: (pct: number) => void
): ToothSegmentData[] {
  onProgress?.(5);

  const allCentroids = computeFaceCentroids(geometry);
  onProgress?.(15);

  const teeth = getTeethForJaw(jawType);
  const k = Math.min(teeth.length, allCentroids.length);

  if (k === 0) return [];

  const sample = subsample(allCentroids, 8000);
  onProgress?.(25);

  const { assignments: sampleAssignments, centers } = kmeans(sample, k);
  onProgress?.(65);

  const allAssignments = assignAllFacesToClusters(allCentroids, sample, sampleAssignments, centers);
  onProgress?.(80);

  const fdiIds = assignFDILabels(centers, jawType);
  onProgress?.(88);

  const grouped = new Map<number, number[]>();
  for (let i = 0; i < k; i++) grouped.set(i, []);
  for (let i = 0; i < allCentroids.length; i++) {
    grouped.get(allAssignments[i])?.push(allCentroids[i].faceIndex);
  }

  const positions = geometry.attributes.position;

  const results: ToothSegmentData[] = [];
  let colorIndex = 0;
  for (let ci = 0; ci < k; ci++) {
    const faceIndices = grouped.get(ci) ?? [];
    if (faceIndices.length === 0) continue;

    const centroid = {
      x: centers[ci].x,
      y: 0,
      z: centers[ci].z,
    };

    const toothId = fdiIds[ci];
    results.push({
      toothId,
      label: String(toothId),
      color: getToothColor(colorIndex++),
      faceIndices,
      centroid,
    });
  }

  results.sort((a, b) => a.toothId - b.toothId);
  onProgress?.(100);

  return results;
}

export function buildToothGeometry(
  baseGeometry: THREE.BufferGeometry,
  faceIndices: number[]
): THREE.BufferGeometry {
  const positions = baseGeometry.attributes.position;
  const normals = baseGeometry.attributes.normal;
  const index = baseGeometry.index;

  const newPositions: number[] = [];
  const newNormals: number[] = [];

  for (const fi of faceIndices) {
    const getVerts = (faceIdx: number) => {
      if (index) {
        return [
          index.getX(faceIdx * 3),
          index.getX(faceIdx * 3 + 1),
          index.getX(faceIdx * 3 + 2),
        ];
      }
      return [faceIdx * 3, faceIdx * 3 + 1, faceIdx * 3 + 2];
    };

    const [a, b, c] = getVerts(fi);
    for (const vi of [a, b, c]) {
      newPositions.push(positions.getX(vi), positions.getY(vi), positions.getZ(vi));
      if (normals) {
        newNormals.push(normals.getX(vi), normals.getY(vi), normals.getZ(vi));
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(newPositions, 3));
  if (newNormals.length > 0) {
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(newNormals, 3));
  } else {
    geo.computeVertexNormals();
  }

  return geo;
}
