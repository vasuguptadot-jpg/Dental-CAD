import * as THREE from "three";
import type { ToothSegment } from "./segmentation-engine";

// ─── Types ───────────────────────────────────────────────────────────────────

export type CollisionType = "crown" | "interproximal" | "occlusal";
export type CollisionSeverity = "collision" | "risk" | "safe";

export interface CollisionPair {
  toothA: number;
  toothB: number;
  type: CollisionType;
  distance: number;      // mm — negative = overlap
  severity: CollisionSeverity;
  contactPoint: THREE.Vector3;
  riskPercent: number;   // 0–100, higher = more dangerous
}

export interface ToothCollisionState {
  fdiNumber: number;
  worstSeverity: CollisionSeverity;
  pairs: CollisionPair[];
  isRootAtRisk: boolean;
  rootRiskReason?: string;
}

export interface CollisionReport {
  timestamp: number;
  states: Map<number, ToothCollisionState>;
  collisionCount: number;
  riskCount: number;
  worstDistance: number;
  hasOcclusalInterference: boolean;
}

// ─── Bounding Sphere Cache ────────────────────────────────────────────────────

export interface ToothBoundingSphere {
  fdiNumber: number;
  center: THREE.Vector3;
  radius: number;
  estimatedRootCenter: THREE.Vector3;
  estimatedRootRadius: number;
}

export function computeBoundingSpheres(
  segments: ToothSegment[],
  groups: Map<number, THREE.Group>
): Map<number, ToothBoundingSphere> {
  const map = new Map<number, ToothBoundingSphere>();

  for (const seg of segments) {
    const group = groups.get(seg.fdiNumber);
    if (!group) continue;

    // Get world-space center
    const worldPos = new THREE.Vector3();
    group.getWorldPosition(worldPos);

    // Estimate crown radius from vertex count and geometry
    const geo = seg.geometry;
    let radius = 5; // default fallback
    if (geo) {
      const bbox = new THREE.Box3().setFromBufferAttribute(
        geo.attributes.position as THREE.BufferAttribute
      );
      const size = new THREE.Vector3();
      bbox.getSize(size);
      radius = Math.max(size.x, size.y, size.z) * 0.5;
    }

    // Estimate root center: root extends apically (downward for upper, upward for lower)
    const isUpper = seg.fdiNumber >= 11 && seg.fdiNumber <= 28;
    const rootDir = isUpper ? -1 : 1; // upper roots go up (+Y), lower roots go down (-Y)
    const rootLength = radius * 2.5; // approximate root length
    const estimatedRootCenter = new THREE.Vector3(
      worldPos.x,
      worldPos.y + rootDir * rootLength,
      worldPos.z
    );

    map.set(seg.fdiNumber, {
      fdiNumber: seg.fdiNumber,
      center: worldPos,
      radius,
      estimatedRootCenter,
      estimatedRootRadius: radius * 0.6,
    });
  }

  return map;
}

// ─── Adjacency ────────────────────────────────────────────────────────────────

// Returns pairs of adjacent FDI numbers in the same arch
function getAdjacentPairs(fdis: number[]): Array<[number, number]> {
  const upper = fdis.filter(f => f >= 11 && f <= 28).sort((a, b) => a - b);
  const lower = fdis.filter(f => f >= 31 && f <= 48).sort((a, b) => a - b);

  const pairs: Array<[number, number]> = [];

  const addPairs = (sorted: number[]) => {
    for (let i = 0; i < sorted.length - 1; i++) {
      pairs.push([sorted[i], sorted[i + 1]]);
    }
  };

  addPairs(upper);
  addPairs(lower);
  return pairs;
}

// Returns upper-lower antagonist pairs for occlusal check
const ANTAGONIST_MAP: Record<number, number> = {
  11: 41, 12: 42, 13: 43, 14: 44, 15: 45, 16: 46, 17: 47,
  21: 31, 22: 32, 23: 33, 24: 34, 25: 35, 26: 36, 27: 37,
};

// ─── Severity Classifier ─────────────────────────────────────────────────────

const COLLISION_THRESHOLD = 0.0;    // distance < 0 = collision
const RISK_THRESHOLD = 2.0;         // distance < 2mm = risk

function classifySeverity(distance: number): CollisionSeverity {
  if (distance < COLLISION_THRESHOLD) return "collision";
  if (distance < RISK_THRESHOLD) return "risk";
  return "safe";
}

function computeRiskPercent(distance: number): number {
  if (distance < COLLISION_THRESHOLD) return 100;
  if (distance > RISK_THRESHOLD * 2) return 0;
  return Math.round(((RISK_THRESHOLD * 2 - distance) / (RISK_THRESHOLD * 2)) * 100);
}

// ─── Root Safety Check ───────────────────────────────────────────────────────

function checkRootSafety(
  sphere: ToothBoundingSphere,
  transform: { tx: number; ty: number; tz: number }
): { isAtRisk: boolean; reason?: string } {
  const totalTranslation = Math.sqrt(transform.tx ** 2 + transform.ty ** 2 + transform.tz ** 2);

  // Vertical movement (intrusion/extrusion) is most risky for roots
  const verticalMove = Math.abs(transform.ty);

  if (verticalMove > 3.0) {
    return {
      isAtRisk: true,
      reason: `Excessive intrusion/extrusion (${verticalMove.toFixed(1)}mm) risks root resorption`,
    };
  }
  if (totalTranslation > 3.5) {
    return {
      isAtRisk: true,
      reason: `Large bodily movement (${totalTranslation.toFixed(1)}mm) may cause root proximity to adjacent roots`,
    };
  }
  return { isAtRisk: false };
}

// ─── Main Collision Check ─────────────────────────────────────────────────────

export function runCollisionCheck(
  segments: ToothSegment[],
  groups: Map<number, THREE.Group>,
  transforms: Map<number, { tx: number; ty: number; tz: number }>
): CollisionReport {
  const spheres = computeBoundingSpheres(segments, groups);
  const fdis = segments.map(s => s.fdiNumber);
  const states = new Map<number, ToothCollisionState>();

  // Initialize states
  for (const fdi of fdis) {
    states.set(fdi, { fdiNumber: fdi, worstSeverity: "safe", pairs: [], isRootAtRisk: false });
  }

  const adjacentPairs = getAdjacentPairs(fdis);
  let collisionCount = 0;
  let riskCount = 0;
  let worstDistance = Infinity;
  let hasOcclusalInterference = false;

  // Check interproximal (adjacent same-arch) pairs
  for (const [fdiA, fdiB] of adjacentPairs) {
    const sA = spheres.get(fdiA);
    const sB = spheres.get(fdiB);
    if (!sA || !sB) continue;

    const centerDist = sA.center.distanceTo(sB.center);
    const distance = centerDist - sA.radius - sB.radius;
    const severity = classifySeverity(distance);
    const contactPoint = sA.center.clone().lerp(sB.center, 0.5);

    const pair: CollisionPair = {
      toothA: fdiA, toothB: fdiB,
      type: "interproximal",
      distance: parseFloat(distance.toFixed(2)),
      severity,
      contactPoint,
      riskPercent: computeRiskPercent(distance),
    };

    if (distance < worstDistance) worstDistance = distance;
    if (severity === "collision") collisionCount++;
    else if (severity === "risk") riskCount++;

    for (const fdi of [fdiA, fdiB]) {
      const state = states.get(fdi)!;
      state.pairs.push(pair);
      if (severity === "collision" || (severity === "risk" && state.worstSeverity === "safe")) {
        state.worstSeverity = severity;
      }
    }
  }

  // Check occlusal interference (upper vs lower antagonists)
  for (const [upperFdi, lowerFdi] of Object.entries(ANTAGONIST_MAP)) {
    const uFdi = parseInt(upperFdi);
    const lFdi = lowerFdi;
    const sU = spheres.get(uFdi);
    const sL = spheres.get(lFdi);
    if (!sU || !sL) continue;

    const centerDist = sU.center.distanceTo(sL.center);
    const distance = centerDist - sU.radius * 0.8 - sL.radius * 0.8; // tighter threshold for occlusal
    const severity = classifySeverity(distance - 0.5); // stricter for occlusal

    if (severity !== "safe") {
      hasOcclusalInterference = true;
      const contactPoint = sU.center.clone().lerp(sL.center, 0.5);
      const pair: CollisionPair = {
        toothA: uFdi, toothB: lFdi,
        type: "occlusal",
        distance: parseFloat(distance.toFixed(2)),
        severity,
        contactPoint,
        riskPercent: computeRiskPercent(distance),
      };

      if (severity === "collision") collisionCount++;
      else riskCount++;

      for (const fdi of [uFdi, lFdi]) {
        const state = states.get(fdi);
        if (!state) continue;
        state.pairs.push(pair);
        if (severity === "collision" || (severity === "risk" && state.worstSeverity === "safe")) {
          state.worstSeverity = severity;
        }
      }
    }
  }

  // Root safety check
  for (const [fdi, transform] of transforms) {
    const state = states.get(fdi);
    if (!state) continue;
    const sphere = spheres.get(fdi);
    if (!sphere) continue;

    const rootCheck = checkRootSafety(sphere, transform);
    state.isRootAtRisk = rootCheck.isAtRisk;
    state.rootRiskReason = rootCheck.reason;
  }

  return {
    timestamp: Date.now(),
    states,
    collisionCount,
    riskCount,
    worstDistance: worstDistance === Infinity ? 99 : parseFloat(worstDistance.toFixed(2)),
    hasOcclusalInterference,
  };
}

// ─── Visual Indicator Builder ─────────────────────────────────────────────────

const COLLISION_COLOR = 0xef4444;
const RISK_COLOR = 0xf59e0b;
const SAFE_COLOR = 0x22c55e;

export function buildCollisionIndicators(
  report: CollisionReport,
  spheres: Map<number, ToothBoundingSphere>
): THREE.Group {
  const group = new THREE.Group();
  group.name = "collision_indicators";

  const seen = new Set<string>();

  for (const [, state] of report.states) {
    for (const pair of state.pairs) {
      const key = [pair.toothA, pair.toothB].sort().join("-") + pair.type;
      if (seen.has(key) || pair.severity === "safe") continue;
      seen.add(key);

      const sA = spheres.get(pair.toothA);
      const sB = spheres.get(pair.toothB);
      if (!sA || !sB) continue;

      const color = pair.severity === "collision" ? COLLISION_COLOR : RISK_COLOR;
      const opacity = pair.severity === "collision" ? 0.45 : 0.25;

      // Contact zone sphere at midpoint
      const contactGeo = new THREE.SphereGeometry(
        pair.severity === "collision" ? 2.0 : 1.5, 16, 16
      );
      const contactMat = new THREE.MeshPhongMaterial({
        color, transparent: true, opacity,
        emissive: color, emissiveIntensity: 0.3,
        depthWrite: false,
      });
      const contactMesh = new THREE.Mesh(contactGeo, contactMat);
      contactMesh.position.copy(pair.contactPoint);
      group.add(contactMesh);

      // Ring around each affected tooth
      for (const sphere of [sA, sB]) {
        const ringGeo = new THREE.TorusGeometry(sphere.radius * 1.1, 0.3, 8, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: opacity * 1.5, depthWrite: false });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.copy(sphere.center);
        ring.rotation.x = Math.PI / 2;
        group.add(ring);
      }
    }
  }

  return group;
}

// ─── Safe Zone Overlay ────────────────────────────────────────────────────────

export function buildSafeZoneIndicators(
  report: CollisionReport,
  spheres: Map<number, ToothBoundingSphere>
): THREE.Group {
  const group = new THREE.Group();
  group.name = "safe_zone_indicators";

  for (const [fdi, state] of report.states) {
    const sphere = spheres.get(fdi);
    if (!sphere) continue;

    const color = state.worstSeverity === "collision" ? COLLISION_COLOR
      : state.worstSeverity === "risk" ? RISK_COLOR
      : SAFE_COLOR;

    const dotGeo = new THREE.SphereGeometry(0.8, 8, 8);
    const dotMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.set(sphere.center.x, sphere.center.y + sphere.radius + 2, sphere.center.z);
    dot.name = `status_${fdi}`;
    group.add(dot);
  }

  return group;
}

// ─── Movement Arrow Builder ───────────────────────────────────────────────────

export function buildMovementArrows(
  transform: { tx: number; ty: number; tz: number },
  origin: THREE.Vector3
): THREE.Group {
  const group = new THREE.Group();
  group.name = "movement_arrows";

  const arrowLength = 8;
  const arrowHeadLen = 2;
  const arrowHeadWidth = 1;

  if (Math.abs(transform.tx) > 0.05) {
    const dir = new THREE.Vector3(Math.sign(transform.tx), 0, 0).normalize();
    const arrow = new THREE.ArrowHelper(dir, origin, arrowLength * Math.min(Math.abs(transform.tx) / 3, 1) + 5, 0x3b82f6, arrowHeadLen, arrowHeadWidth);
    group.add(arrow);
  }
  if (Math.abs(transform.ty) > 0.05) {
    const dir = new THREE.Vector3(0, Math.sign(transform.ty), 0).normalize();
    const arrow = new THREE.ArrowHelper(dir, origin, arrowLength * Math.min(Math.abs(transform.ty) / 3, 1) + 5, 0x10b981, arrowHeadLen, arrowHeadWidth);
    group.add(arrow);
  }
  if (Math.abs(transform.tz) > 0.05) {
    const dir = new THREE.Vector3(0, 0, Math.sign(transform.tz)).normalize();
    const arrow = new THREE.ArrowHelper(dir, origin, arrowLength * Math.min(Math.abs(transform.tz) / 3, 1) + 5, 0xf59e0b, arrowHeadLen, arrowHeadWidth);
    group.add(arrow);
  }

  return group;
}
