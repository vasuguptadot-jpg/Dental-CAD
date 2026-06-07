import * as THREE from "three";

export interface ToothSegment {
  fdiNumber: number;
  label: string;
  color: string;
  centroidX: number;
  centroidY: number;
  centroidZ: number;
  vertexCount: number;
  isVisible: boolean;
  quadrant: number;
  toothIndex: number;
  geometry?: THREE.BufferGeometry;
  indices: number[];
}

// 32 distinct colors optimized for dental visualization
const TOOTH_COLORS: string[] = [
  "#e8f4fd", "#d4edfc", "#b8e2f9", "#9dd6f7", "#7ecbf5",
  "#5ec0f2", "#3db5f0", "#4dc9c9", "#5ed4b8", "#6edfa6",
  "#7eea94", "#8ef582", "#a2ef70", "#b6e85e", "#cae14c",
  "#deda3a", "#f2d428", "#f5c018", "#f8ac08", "#fb9800",
  "#f98420", "#f77040", "#f55c60", "#f34880", "#e63496",
  "#d420ac", "#c20cc2", "#8a18d4", "#5224e6", "#3040f8",
  "#1860e8", "#0080d8",
];

// FDI numbering: quadrant 1 = upper right (11–18), quadrant 2 = upper left (21–28)
//                quadrant 3 = lower left (31–38), quadrant 4 = lower right (41–48)
function buildFdiLayout(jawType: "upper" | "lower" | "both"): number[] {
  const upper = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
  const lower = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

  if (jawType === "upper") return upper;
  if (jawType === "lower") return lower;
  return [...upper, ...lower];
}

// Estimate number of teeth from bounding box
function estimateToothCount(bbox: THREE.Box3, jawType: "upper" | "lower" | "both"): number {
  const width = bbox.max.x - bbox.min.x;
  const base = jawType === "both" ? 28 : 14;
  if (width < 40) return Math.min(8, base);
  if (width < 60) return Math.min(12, base);
  return base;
}

export async function runSegmentation(
  geometry: THREE.BufferGeometry,
  jawType: "upper" | "lower" | "both" = "both",
  onProgress?: (pct: number) => void
): Promise<ToothSegment[]> {
  // Small delay to yield to the event loop between heavy operations
  const yield_ = () => new Promise<void>(r => setTimeout(r, 0));

  await yield_();
  onProgress?.(5);

  geometry.computeBoundingBox();
  geometry.computeVertexNormals();

  const bbox = geometry.boundingBox!;
  const positions = geometry.attributes.position as THREE.BufferAttribute;
  const totalVerts = positions.count;

  await yield_();
  onProgress?.(10);

  // ─── Step 1: project vertices onto XZ plane (arch view from above) ───
  const xs: Float32Array = new Float32Array(totalVerts);
  const ys: Float32Array = new Float32Array(totalVerts);
  const zs: Float32Array = new Float32Array(totalVerts);
  for (let i = 0; i < totalVerts; i++) {
    xs[i] = positions.getX(i);
    ys[i] = positions.getY(i);
    zs[i] = positions.getZ(i);
  }

  const xMin = bbox.min.x, xMax = bbox.max.x;
  const zMin = bbox.min.z, zMax = bbox.max.z;
  const xRange = xMax - xMin;

  onProgress?.(20);

  // ─── Step 2: fit parabolic arch curve ───
  // Dental arch approximated as: z = a*(x - cx)^2 + zFront
  const cx = (xMin + xMax) / 2;
  // Arch depth ratio (front-to-back distance vs width)
  const archDepth = (zMax - zMin) * 0.6;
  const a = archDepth / ((xRange / 2) * (xRange / 2));

  // Arc-length parameter for each vertex along the arch
  // Map x → arc distance from center
  const arcDist = new Float32Array(totalVerts);
  for (let i = 0; i < totalVerts; i++) {
    const dx = xs[i] - cx;
    // Simple arc parametrization: signed distance from center
    arcDist[i] = dx;
  }

  onProgress?.(30);
  await yield_();

  // ─── Step 3: detect jaw separation if "both" ───
  // Find y midpoint to separate upper/lower
  let yMid = (bbox.min.y + bbox.max.y) / 2;
  if (jawType === "both") {
    // Find the y value with fewest vertices (the gap between jaws)
    const yBuckets = 40;
    const counts = new Int32Array(yBuckets);
    const yRange = bbox.max.y - bbox.min.y;
    for (let i = 0; i < totalVerts; i++) {
      const b = Math.floor(((ys[i] - bbox.min.y) / yRange) * (yBuckets - 1));
      counts[Math.max(0, Math.min(yBuckets - 1, b))]++;
    }
    let minCount = Infinity, minBucket = Math.floor(yBuckets / 2);
    for (let b = Math.floor(yBuckets * 0.35); b < Math.floor(yBuckets * 0.65); b++) {
      if (counts[b] < minCount) { minCount = counts[b]; minBucket = b; }
    }
    yMid = bbox.min.y + (minBucket / yBuckets) * yRange;
  }

  onProgress?.(40);
  await yield_();

  // ─── Step 4: bucket vertices into tooth columns ───
  const fdiLayout = buildFdiLayout(jawType);
  const numTeeth = estimateToothCount(bbox, jawType);
  const actualTeeth = Math.min(numTeeth, fdiLayout.length);

  // Assign each vertex a column bucket along the arch
  const halfTeeth = Math.floor(actualTeeth / (jawType === "both" ? 4 : 2));
  const colWidth = xRange / actualTeeth;

  const toothBuckets: Map<string, number[]> = new Map();

  for (let i = 0; i < totalVerts; i++) {
    const col = Math.floor((xs[i] - xMin) / colWidth);
    const clampedCol = Math.max(0, Math.min(actualTeeth - 1, col));

    // For "both" jaws, also separate by y
    let key: string;
    if (jawType === "both") {
      const isUpper = ys[i] > yMid;
      key = `${isUpper ? "u" : "l"}_${clampedCol}`;
    } else {
      key = `${jawType[0]}_${clampedCol}`;
    }

    if (!toothBuckets.has(key)) toothBuckets.set(key, []);
    toothBuckets.get(key)!.push(i);
  }

  onProgress?.(60);
  await yield_();

  // ─── Step 5: map buckets → FDI numbers ───
  // Upper: right-to-left is quadrant 1 then 2 (18..11, 21..28)
  // Lower: right-to-left is quadrant 4 then 3 (48..41, 31..38)

  const teethPerJaw = jawType === "both" ? actualTeeth / 2 : actualTeeth;
  const segments: ToothSegment[] = [];
  let colorIdx = 0;

  // Build sorted key list
  const upperKeys: string[] = [];
  const lowerKeys: string[] = [];

  for (const key of toothBuckets.keys()) {
    if (key.startsWith("u_")) upperKeys.push(key);
    else lowerKeys.push(key);
  }
  upperKeys.sort((a, b) => parseInt(a.split("_")[1]) - parseInt(b.split("_")[1]));
  lowerKeys.sort((a, b) => parseInt(a.split("_")[1]) - parseInt(b.split("_")[1]));

  const fdiUpper = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
  const fdiLower = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

  const processKeys = (keys: string[], fdiList: number[], jawLabel: "upper" | "lower") => {
    keys.forEach((key, idx) => {
      const indices = toothBuckets.get(key) ?? [];
      if (indices.length < 10) return; // skip tiny fragments

      const fdiIdx = Math.round((idx / Math.max(1, keys.length - 1)) * (fdiList.length - 1));
      const fdiNumber = fdiList[Math.min(fdiIdx, fdiList.length - 1)];
      const quadrant = Math.floor(fdiNumber / 10);

      // Compute centroid
      let cx2 = 0, cy2 = 0, cz2 = 0;
      for (const vi of indices) { cx2 += xs[vi]; cy2 += ys[vi]; cz2 += zs[vi]; }
      cx2 /= indices.length; cy2 /= indices.length; cz2 /= indices.length;

      // Build sub-geometry
      const geo = buildSubGeometry(geometry, indices, positions);

      const color = TOOTH_COLORS[colorIdx % TOOTH_COLORS.length];
      colorIdx++;

      segments.push({
        fdiNumber,
        label: `${fdiNumber}`,
        color,
        centroidX: cx2,
        centroidY: cy2,
        centroidZ: cz2,
        vertexCount: indices.length,
        isVisible: true,
        quadrant,
        toothIndex: idx,
        geometry: geo,
        indices,
      });
    });
  };

  if (jawType === "both" || jawType === "upper") processKeys(upperKeys, fdiUpper, "upper");
  if (jawType === "both" || jawType === "lower") processKeys(lowerKeys, fdiLower, "lower");
  if (jawType === "upper") processKeys(upperKeys.length ? [] : Array.from(toothBuckets.keys()).filter(k => k.startsWith("u_")), fdiUpper, "upper");
  if (jawType === "lower") {
    const lks = Array.from(toothBuckets.keys()).filter(k => k.startsWith("l_"));
    lks.sort((a, b) => parseInt(a.split("_")[1]) - parseInt(b.split("_")[1]));
    if (lowerKeys.length === 0) processKeys(lks, fdiLower, "lower");
  }

  // If no jaw separation worked (single jaw scan), use all keys
  if (segments.length === 0) {
    const allKeys = Array.from(toothBuckets.keys()).sort((a, b) => {
      return parseInt(a.split("_")[1]) - parseInt(b.split("_")[1]);
    });
    processKeys(allKeys, jawType === "lower" ? fdiLower : fdiUpper, jawType === "lower" ? "lower" : "upper");
  }

  onProgress?.(85);
  await yield_();

  // Sort by FDI number
  segments.sort((a, b) => a.fdiNumber - b.fdiNumber);

  onProgress?.(100);
  return segments;
}

function buildSubGeometry(
  source: THREE.BufferGeometry,
  vertexIndices: number[],
  positions: THREE.BufferAttribute
): THREE.BufferGeometry {
  // Build a sub-geometry from vertex indices
  // We need to handle both indexed and non-indexed geometry

  const indexSet = new Set(vertexIndices);
  const geo = new THREE.BufferGeometry();

  if (source.index) {
    // Indexed geometry: filter triangles where all 3 verts are in set
    const srcIndex = source.index.array;
    const newIndices: number[] = [];
    const vertMap = new Map<number, number>();
    const newPositions: number[] = [];
    const normals = source.attributes.normal as THREE.BufferAttribute | undefined;
    const newNormals: number[] = [];

    for (let i = 0; i < srcIndex.length; i += 3) {
      const a = srcIndex[i], b = srcIndex[i + 1], c = srcIndex[i + 2];
      if (indexSet.has(a) && indexSet.has(b) && indexSet.has(c)) {
        [a, b, c].forEach(vi => {
          if (!vertMap.has(vi)) {
            const ni = newPositions.length / 3;
            vertMap.set(vi, ni);
            newPositions.push(positions.getX(vi), positions.getY(vi), positions.getZ(vi));
            if (normals) newNormals.push(normals.getX(vi), normals.getY(vi), normals.getZ(vi));
          }
        });
        newIndices.push(vertMap.get(a)!, vertMap.get(b)!, vertMap.get(c)!);
      }
    }

    if (newPositions.length === 0) return new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(newPositions, 3));
    if (newNormals.length) geo.setAttribute("normal", new THREE.Float32BufferAttribute(newNormals, 3));
    geo.setIndex(newIndices);
  } else {
    // Non-indexed: each triplet is a triangle; include triangles with vertices in set
    const newPositions: number[] = [];
    const normals = source.attributes.normal as THREE.BufferAttribute | undefined;
    const newNormals: number[] = [];

    for (let i = 0; i < positions.count; i += 3) {
      if (indexSet.has(i) || indexSet.has(i + 1) || indexSet.has(i + 2)) {
        for (let j = 0; j < 3; j++) {
          const vi = i + j;
          newPositions.push(positions.getX(vi), positions.getY(vi), positions.getZ(vi));
          if (normals) newNormals.push(normals.getX(vi), normals.getY(vi), normals.getZ(vi));
        }
      }
    }

    if (newPositions.length === 0) return new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(newPositions, 3));
    if (newNormals.length) geo.setAttribute("normal", new THREE.Float32BufferAttribute(newNormals, 3));
  }

  geo.computeVertexNormals();
  return geo;
}

export function serializeSegments(segments: ToothSegment[]) {
  return segments.map(s => ({
    fdiNumber: s.fdiNumber,
    label: s.label,
    color: s.color,
    centroidX: s.centroidX,
    centroidY: s.centroidY,
    centroidZ: s.centroidZ,
    vertexCount: s.vertexCount,
    isVisible: s.isVisible,
    quadrant: s.quadrant,
    toothIndex: s.toothIndex,
  }));
}
