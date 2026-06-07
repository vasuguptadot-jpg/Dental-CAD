// Web Worker for segmentation clustering computation
// Receives raw vertex data, returns tooth segment assignments
// (Pure math only — no THREE.js, no DOM)

export type WorkerRequest = {
  type: "segment";
  positions: Float32Array;
  jawType: "upper" | "lower" | "both";
};

export type WorkerResponse = {
  type: "progress";
  percent: number;
} | {
  type: "result";
  segments: SegmentResult[];
} | {
  type: "error";
  message: string;
};

export interface SegmentResult {
  fdiNumber: number;
  centroidX: number;
  centroidY: number;
  centroidZ: number;
  vertexCount: number;
  indices: number[];
  quadrant: number;
  toothIndex: number;
}

function yield_() { return new Promise<void>(r => setTimeout(r, 0)); }

function buildFdiLayout(jawType: "upper" | "lower" | "both"): number[] {
  const upper = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
  const lower = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];
  if (jawType === "upper") return upper;
  if (jawType === "lower") return lower;
  return [...upper, ...lower];
}

async function runWorkerSegmentation(
  positions: Float32Array,
  jawType: "upper" | "lower" | "both",
  onProgress: (p: number) => void
): Promise<SegmentResult[]> {
  const vertexCount = positions.length / 3;

  onProgress(5);

  // Compute bounding box
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i+1], z = positions[i+2];
    if (!isFinite(x) || !isFinite(y) || !isFinite(z)) continue;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }

  const width = maxX - minX;
  const depth = maxZ - minZ;

  onProgress(15);

  const fdiLayout = buildFdiLayout(jawType);
  const targetCount = fdiLayout.length;

  // Divide arch into tooth columns along X axis
  // Each column gets an equal slice of the arch width
  const columnWidth = width / targetCount;

  onProgress(30);

  // Assign each vertex to a tooth column based on X position
  const toothVertices: Map<number, number[]> = new Map();
  fdiLayout.forEach(fdi => toothVertices.set(fdi, []));

  for (let i = 0; i < vertexCount; i++) {
    const x = positions[i * 3];
    if (!isFinite(x)) continue;

    // Normalize x to 0..1 range within arch
    const t = (x - minX) / (width + 0.001);
    const colIdx = Math.min(targetCount - 1, Math.floor(t * targetCount));
    const fdi = fdiLayout[colIdx];
    if (fdi !== undefined) {
      toothVertices.get(fdi)!.push(i);
    }
  }

  onProgress(60);

  // Compute centroids for each tooth
  const results: SegmentResult[] = [];
  let processed = 0;

  for (const [fdi, indices] of toothVertices) {
    if (indices.length === 0) continue;

    let cx = 0, cy = 0, cz = 0;
    for (const idx of indices) {
      cx += positions[idx * 3];
      cy += positions[idx * 3 + 1];
      cz += positions[idx * 3 + 2];
    }
    cx /= indices.length;
    cy /= indices.length;
    cz /= indices.length;

    const quadrant = Math.floor(fdi / 10);
    const toothIndex = fdi % 10;

    results.push({
      fdiNumber: fdi,
      centroidX: cx,
      centroidY: cy,
      centroidZ: cz,
      vertexCount: indices.length,
      indices,
      quadrant,
      toothIndex,
    });

    processed++;
    onProgress(60 + Math.floor(processed / targetCount * 35));
  }

  onProgress(98);
  return results.sort((a, b) => a.fdiNumber - b.fdiNumber);
}

// Worker message handler
self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type !== "segment") return;

  try {
    const results = await runWorkerSegmentation(
      event.data.positions,
      event.data.jawType,
      (percent) => {
        const msg: WorkerResponse = { type: "progress", percent };
        self.postMessage(msg);
      }
    );

    const msg: WorkerResponse = { type: "result", segments: results };
    self.postMessage(msg);
  } catch (err) {
    const msg: WorkerResponse = { type: "error", message: String(err) };
    self.postMessage(msg);
  }
};
