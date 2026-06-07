import * as THREE from "three";
import type { ToothSegment } from "./segmentation-engine";
import type { ToothTransform } from "./tooth-movement-engine";
import { computeMatrix } from "./tooth-movement-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export type QualityGrade = "excellent" | "good" | "acceptable" | "poor";

export interface ValidationResult {
  isValid: boolean;
  qualityScore: number;      // 0–100
  qualityGrade: QualityGrade;
  vertexCount: number;
  faceCount: number;
  edgeCount: number;
  boundaryEdges: number;     // holes
  nonManifoldEdges: number;
  hasNormals: boolean;
  isClosed: boolean;
  issues: string[];
  warnings: string[];
}

export type ProductionStatus = "planned" | "queued" | "printing" | "formed" | "delivered";

export interface StageManufacturingRecord {
  stageNumber: number;
  productionStatus: ProductionStatus;
  validationResult?: ValidationResult;
  exportedAt?: string;
  queuedAt?: string;
  printedAt?: string;
  formedAt?: string;
  deliveredAt?: string;
  notes?: string;
}

// ─── Geometry Merge (no external dependency) ─────────────────────────────────

export function mergeBufferGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const allPositions: number[] = [];
  const allNormals: number[] = [];
  const allIndices: number[] = [];
  let indexOffset = 0;

  for (const geo of geos) {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const norm = geo.attributes.normal as THREE.BufferAttribute | undefined;
    const idx = geo.index;

    for (let i = 0; i < pos.count; i++) {
      allPositions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      if (norm) allNormals.push(norm.getX(i), norm.getY(i), norm.getZ(i));
    }

    if (idx) {
      for (let i = 0; i < idx.count; i++) allIndices.push(idx.getX(i) + indexOffset);
    } else {
      for (let i = 0; i < pos.count; i++) allIndices.push(i + indexOffset);
    }
    indexOffset += pos.count;
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute("position", new THREE.BufferAttribute(new Float32Array(allPositions), 3));
  if (allNormals.length === allPositions.length) {
    result.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(allNormals), 3));
  }
  if (allIndices.length > 0) result.setIndex(allIndices);
  if (allNormals.length === 0) result.computeVertexNormals();
  return result;
}

// ─── Stage Geometry Builder ───────────────────────────────────────────────────

export function buildStageGeometry(
  segments: ToothSegment[],
  stageTransforms: ToothTransform[]
): THREE.BufferGeometry | null {
  const geos: THREE.BufferGeometry[] = [];

  for (const seg of segments) {
    if (!seg.geometry) continue;
    const transform = stageTransforms.find(t => t.fdiNumber === seg.fdiNumber);
    if (!transform) continue;

    const matrix = computeMatrix(
      transform,
      new THREE.Vector3(0, 0, 0),
      new THREE.Euler(0, 0, 0)
    );

    const cloned = seg.geometry.clone();
    cloned.applyMatrix4(matrix);
    geos.push(cloned);
  }

  if (geos.length === 0) return null;
  return mergeBufferGeometries(geos);
}

// ─── Mesh Validation ──────────────────────────────────────────────────────────

export function validateGeometry(geo: THREE.BufferGeometry): ValidationResult {
  const pos = geo.attributes.position as THREE.BufferAttribute | undefined;

  if (!pos || pos.count === 0) {
    return {
      isValid: false, qualityScore: 0, qualityGrade: "poor",
      vertexCount: 0, faceCount: 0, edgeCount: 0,
      boundaryEdges: 0, nonManifoldEdges: 0,
      hasNormals: false, isClosed: false,
      issues: ["Empty geometry — no vertices found"],
      warnings: [],
    };
  }

  const index = geo.index;
  const faceCount = index ? index.count / 3 : pos.count / 3;
  const hasNormals = !!geo.attributes.normal;

  // Edge topology check — use a Map for boundary/non-manifold detection
  const edgeCounts = new Map<string, number>();

  for (let i = 0; i < faceCount; i++) {
    const getIdx = (tri: number, vert: number) =>
      index ? index.getX(tri * 3 + vert) : tri * 3 + vert;

    const a = getIdx(i, 0), b = getIdx(i, 1), c = getIdx(i, 2);

    for (const [v1, v2] of [[a, b], [b, c], [c, a]]) {
      const key = v1 < v2 ? `${v1}_${v2}` : `${v2}_${v1}`;
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    }
  }

  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  for (const count of edgeCounts.values()) {
    if (count === 1) boundaryEdges++;
    else if (count > 2) nonManifoldEdges++;
  }

  const issues: string[] = [];
  const warnings: string[] = [];

  if (nonManifoldEdges > 0) issues.push(`${nonManifoldEdges} non-manifold edge${nonManifoldEdges > 1 ? "s" : ""} — may cause print failures`);
  if (boundaryEdges > 50) issues.push(`${boundaryEdges} open boundary edges — mesh has significant holes`);
  else if (boundaryEdges > 0 && boundaryEdges <= 50) warnings.push(`${boundaryEdges} boundary edge${boundaryEdges > 1 ? "s" : ""} — minor surface gaps`);
  if (faceCount < 500) warnings.push(`Low polygon count (${faceCount} faces) — model may lack detail`);
  if (!hasNormals) warnings.push("No vertex normals — will be computed for export");

  // Quality score
  let score = 100;
  score -= Math.min(40, nonManifoldEdges * 5);
  score -= Math.min(30, Math.floor(boundaryEdges / 5) * 3);
  if (faceCount < 500) score -= 15;
  if (faceCount < 100) score -= 15;

  const qualityScore = Math.max(0, Math.min(100, Math.round(score)));
  const qualityGrade: QualityGrade =
    qualityScore >= 90 ? "excellent" :
    qualityScore >= 70 ? "good" :
    qualityScore >= 50 ? "acceptable" : "poor";

  return {
    isValid: issues.length === 0,
    qualityScore,
    qualityGrade,
    vertexCount: pos.count,
    faceCount: Math.round(faceCount),
    edgeCount: edgeCounts.size,
    boundaryEdges,
    nonManifoldEdges,
    hasNormals,
    isClosed: boundaryEdges === 0,
    issues,
    warnings,
  };
}

// ─── STL Export (Binary) ──────────────────────────────────────────────────────

export function geometryToSTLBuffer(geo: THREE.BufferGeometry): ArrayBuffer {
  // Ensure normals exist
  if (!geo.attributes.normal) geo.computeVertexNormals();

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const norm = geo.attributes.normal as THREE.BufferAttribute;
  const index = geo.index;
  const faceCount = index ? index.count / 3 : pos.count / 3;

  const buffer = new ArrayBuffer(80 + 4 + Math.round(faceCount) * 50);
  const view = new DataView(buffer);

  // Header (80 bytes) — ASCII
  const headerText = "OrthoVision Manufacturing Export — Binary STL";
  for (let i = 0; i < Math.min(headerText.length, 80); i++) {
    view.setUint8(i, headerText.charCodeAt(i));
  }

  // Number of triangles
  view.setUint32(80, Math.round(faceCount), true);

  let offset = 84;

  const getI = (triIdx: number, vertIdx: number) =>
    index ? index.getX(triIdx * 3 + vertIdx) : triIdx * 3 + vertIdx;

  for (let t = 0; t < Math.round(faceCount); t++) {
    const ai = getI(t, 0), bi = getI(t, 1), ci = getI(t, 2);

    // Average face normal
    const nx = (norm.getX(ai) + norm.getX(bi) + norm.getX(ci)) / 3;
    const ny = (norm.getY(ai) + norm.getY(bi) + norm.getY(ci)) / 3;
    const nz = (norm.getZ(ai) + norm.getZ(bi) + norm.getZ(ci)) / 3;
    const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;

    view.setFloat32(offset, nx / nLen, true); offset += 4;
    view.setFloat32(offset, ny / nLen, true); offset += 4;
    view.setFloat32(offset, nz / nLen, true); offset += 4;

    for (const vi of [ai, bi, ci]) {
      view.setFloat32(offset, pos.getX(vi), true); offset += 4;
      view.setFloat32(offset, pos.getY(vi), true); offset += 4;
      view.setFloat32(offset, pos.getZ(vi), true); offset += 4;
    }

    view.setUint16(offset, 0, true); offset += 2;
  }

  return buffer;
}

// ─── OBJ Export (Text) ───────────────────────────────────────────────────────

export function geometryToOBJString(geo: THREE.BufferGeometry, name: string): string {
  if (!geo.attributes.normal) geo.computeVertexNormals();

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const norm = geo.attributes.normal as THREE.BufferAttribute | undefined;
  const index = geo.index;
  const faceCount = index ? index.count / 3 : pos.count / 3;

  const lines: string[] = [
    `# OrthoVision Manufacturing Export`,
    `# Object: ${name}`,
    `# Generated: ${new Date().toISOString()}`,
    `# Vertices: ${pos.count}  Faces: ${Math.round(faceCount)}`,
    "",
    `o ${name}`,
  ];

  for (let i = 0; i < pos.count; i++) {
    lines.push(`v ${pos.getX(i).toFixed(6)} ${pos.getY(i).toFixed(6)} ${pos.getZ(i).toFixed(6)}`);
  }
  if (norm) {
    for (let i = 0; i < norm.count; i++) {
      lines.push(`vn ${norm.getX(i).toFixed(6)} ${norm.getY(i).toFixed(6)} ${norm.getZ(i).toFixed(6)}`);
    }
  }
  lines.push("");

  const getI = (triIdx: number, vertIdx: number) =>
    (index ? index.getX(triIdx * 3 + vertIdx) : triIdx * 3 + vertIdx) + 1; // 1-indexed

  for (let t = 0; t < Math.round(faceCount); t++) {
    const a = getI(t, 0), b = getI(t, 1), c = getI(t, 2);
    if (norm) {
      lines.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`);
    } else {
      lines.push(`f ${a} ${b} ${c}`);
    }
  }

  return lines.join("\n");
}

// ─── Download Helpers ─────────────────────────────────────────────────────────

export function downloadBlob(data: ArrayBuffer | string, filename: string, mimeType: string): void {
  const blob = typeof data === "string"
    ? new Blob([data], { type: mimeType })
    : new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Production Tracking Persistence ─────────────────────────────────────────

const PROD_KEY = (scanId: number) => `ortho_production_${scanId}`;

export function loadProductionRecords(scanId: number): Map<number, StageManufacturingRecord> {
  try {
    const raw = localStorage.getItem(PROD_KEY(scanId));
    if (!raw) return new Map();
    const arr = JSON.parse(raw) as StageManufacturingRecord[];
    return new Map(arr.map(r => [r.stageNumber, r]));
  } catch { return new Map(); }
}

export function saveProductionRecords(scanId: number, records: Map<number, StageManufacturingRecord>): void {
  localStorage.setItem(PROD_KEY(scanId), JSON.stringify(Array.from(records.values())));
}
