import * as THREE from "three";

export interface ScanQualityReport {
  passed: boolean;
  score: number; // 0-100
  vertexCount: number;
  faceCount: number;
  hasNaNVertices: boolean;
  boundingBoxRatio: number;
  estimatedCoverage: "excellent" | "good" | "partial" | "poor";
  issues: ScanQualityIssue[];
  warnings: ScanQualityIssue[];
}

export interface ScanQualityIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
  recommendation: string;
}

export function checkScanQuality(geometry: THREE.BufferGeometry): ScanQualityReport {
  const issues: ScanQualityIssue[] = [];
  const warnings: ScanQualityIssue[] = [];

  const positions = geometry.attributes.position;
  const vertexCount = positions ? positions.count : 0;
  const faceCount = geometry.index ? geometry.index.count / 3 : vertexCount / 3;

  // 1. Vertex count check
  if (vertexCount < 500) {
    issues.push({
      code: "LOW_VERTEX_COUNT",
      severity: "error",
      message: `Only ${vertexCount} vertices detected (minimum: 500)`,
      recommendation: "Re-scan with higher resolution or check STL export settings.",
    });
  } else if (vertexCount < 5000) {
    warnings.push({
      code: "LOW_VERTEX_COUNT_WARN",
      severity: "warning",
      message: `Low vertex count: ${vertexCount.toLocaleString()} vertices`,
      recommendation: "Consider re-scanning at higher resolution for better segmentation accuracy.",
    });
  }

  // 2. NaN / Infinity check
  let hasNaN = false;
  if (positions) {
    const arr = positions.array as Float32Array;
    for (let i = 0; i < Math.min(arr.length, 3000); i++) {
      if (!isFinite(arr[i])) { hasNaN = true; break; }
    }
  }
  if (hasNaN) {
    issues.push({
      code: "INVALID_VERTICES",
      severity: "error",
      message: "Scan contains NaN or infinite vertex coordinates",
      recommendation: "Re-export STL from scanner software. Corrupted vertices detected.",
    });
  }

  // 3. Bounding box ratio
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox!;
  const dx = bb.max.x - bb.min.x;
  const dy = bb.max.y - bb.min.y;
  const dz = bb.max.z - bb.min.z;
  const maxDim = Math.max(dx, dy, dz);
  const minDim = Math.min(dx, dy, dz);
  const ratio = maxDim / (minDim + 0.001);

  if (ratio > 100) {
    issues.push({
      code: "EXTREME_ASPECT_RATIO",
      severity: "error",
      message: `Extreme bounding box ratio: ${ratio.toFixed(0)}:1`,
      recommendation: "Scan may be incorrectly scaled. Check STL units (mm vs m).",
    });
  } else if (ratio > 30) {
    warnings.push({
      code: "HIGH_ASPECT_RATIO",
      severity: "warning",
      message: `High bounding box aspect ratio: ${ratio.toFixed(0)}:1`,
      recommendation: "Verify scan orientation and check for stray geometry.",
    });
  }

  // 4. Arch width estimation (typical dental arch: 40–80 mm wide)
  let coverage: ScanQualityReport["estimatedCoverage"] = "excellent";
  if (dx < 10 || dy < 10) {
    coverage = "poor";
    issues.push({
      code: "INSUFFICIENT_COVERAGE",
      severity: "error",
      message: `Scan dimensions too small (${dx.toFixed(1)}×${dy.toFixed(1)}×${dz.toFixed(1)} mm)`,
      recommendation: "Scan appears clipped. Re-scan to capture full arch.",
    });
  } else if (dx < 25 || dy < 25) {
    coverage = "partial";
    warnings.push({
      code: "PARTIAL_COVERAGE",
      severity: "warning",
      message: `Partial arch coverage detected (${dx.toFixed(1)}×${dy.toFixed(1)} mm)`,
      recommendation: "Segmentation may be incomplete. Full arch preferred.",
    });
  } else if (dx < 40) {
    coverage = "good";
  }

  // 5. Duplicate / degenerate geometry (sample check)
  if (faceCount > 0 && vertexCount / faceCount > 4) {
    warnings.push({
      code: "HIGH_VERTEX_RATIO",
      severity: "warning",
      message: "High vertex-to-face ratio may indicate overlapping geometry",
      recommendation: "Run mesh cleanup in your scanning software before upload.",
    });
  }

  // Score calculation
  let score = 100;
  score -= issues.length * 30;
  score -= warnings.length * 10;
  if (vertexCount > 50000) score += 5;
  if (coverage === "excellent") score += 5;
  score = Math.max(0, Math.min(100, score));

  return {
    passed: issues.length === 0,
    score,
    vertexCount,
    faceCount: Math.round(faceCount),
    hasNaNVertices: hasNaN,
    boundingBoxRatio: ratio,
    estimatedCoverage: coverage,
    issues,
    warnings,
  };
}

export function qualityBadgeColor(score: number): string {
  if (score >= 80) return "text-green-400 border-green-500/40";
  if (score >= 60) return "text-amber-400 border-amber-500/40";
  return "text-red-400 border-red-500/40";
}

export function qualityLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Acceptable";
  if (score >= 40) return "Poor";
  return "Unusable";
}
