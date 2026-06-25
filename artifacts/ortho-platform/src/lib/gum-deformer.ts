import * as THREE from "three";
import type { ToothSegment } from "./segmentation-engine";

interface InfluenceZone {
  indices: Uint32Array;
  weights: Float32Array;
  cx: number;
  cy: number;
  cz: number;
  radius: number;
}

export class GumDeformer {
  public geometry: THREE.BufferGeometry;
  private originalPositions: Float32Array;
  private influenceMap: Map<number, InfluenceZone> = new Map();
  private ready = false;

  constructor(sourceGeometry: THREE.BufferGeometry) {
    this.geometry = sourceGeometry.clone();
    const pos = this.geometry.attributes.position as THREE.BufferAttribute;
    this.originalPositions = new Float32Array(pos.array.length);
    this.originalPositions.set(pos.array as Float32Array);
  }

  buildInfluenceMap(segments: ToothSegment[], radiusMult = 1.8) {
    const pos = this.geometry.attributes.position as THREE.BufferAttribute;
    const n = pos.count;

    for (const seg of segments) {
      const cx = seg.centroidX;
      const cy = seg.centroidY;
      const cz = seg.centroidZ;

      // Use vertex spread as influence radius
      let maxDist = 0;
      for (const vi of seg.indices) {
        const dx = pos.getX(vi) - cx;
        const dy = pos.getY(vi) - cy;
        const dz = pos.getZ(vi) - cz;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > maxDist) maxDist = d;
      }
      const radius = maxDist * radiusMult;

      const tmpIndices: number[] = [];
      const tmpWeights: number[] = [];

      for (let i = 0; i < n; i++) {
        const dx = pos.getX(i) - cx;
        const dy = pos.getY(i) - cy;
        const dz = pos.getZ(i) - cz;
        const d2 = dx * dx + dy * dy + dz * dz;
        const r2 = radius * radius;
        if (d2 <= r2) {
          const w = Math.exp(-4 * d2 / r2);
          if (w > 0.005) {
            tmpIndices.push(i);
            tmpWeights.push(w);
          }
        }
      }

      this.influenceMap.set(seg.fdiNumber, {
        indices: new Uint32Array(tmpIndices),
        weights: new Float32Array(tmpWeights),
        cx, cy, cz, radius,
      });
    }

    this.ready = true;
  }

  update(transforms: Map<number, { tx: number; ty: number; tz: number }>) {
    if (!this.ready) return;
    const pos = this.geometry.attributes.position as THREE.BufferAttribute;
    const orig = this.originalPositions;
    const n = pos.count;

    // Reset to original positions
    for (let i = 0; i < n; i++) {
      pos.setXYZ(i, orig[i * 3], orig[i * 3 + 1], orig[i * 3 + 2]);
    }

    // Accumulate displacements per vertex
    // Using typed arrays for performance
    const dispX = new Float32Array(n);
    const dispY = new Float32Array(n);
    const dispZ = new Float32Array(n);
    const dispW = new Float32Array(n);

    for (const [fdi, zone] of this.influenceMap) {
      const t = transforms.get(fdi);
      if (!t) continue;
      const { tx, ty, tz } = t;
      if (Math.abs(tx) < 0.001 && Math.abs(ty) < 0.001 && Math.abs(tz) < 0.001) continue;

      const { indices, weights } = zone;
      for (let k = 0; k < indices.length; k++) {
        const vi = indices[k];
        const w = weights[k];
        dispX[vi] += tx * w;
        dispY[vi] += ty * w;
        dispZ[vi] += tz * w;
        dispW[vi] += w;
      }
    }

    // Apply accumulated displacements
    for (let i = 0; i < n; i++) {
      if (dispW[i] > 0) {
        pos.setXYZ(
          i,
          orig[i * 3] + dispX[i],
          orig[i * 3 + 1] + dispY[i],
          orig[i * 3 + 2] + dispZ[i],
        );
      }
    }

    pos.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  dispose() {
    this.geometry.dispose();
    this.influenceMap.clear();
  }
}
