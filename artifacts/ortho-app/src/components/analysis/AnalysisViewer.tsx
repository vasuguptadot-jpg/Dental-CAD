import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Loader2, XCircle, Focus, Maximize, Zap, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { buildToothGeometry } from "../segmentation/meshSegmentation";
import { runOrthoAnalysis } from "./analysisEngine";
import { AnalysisPanel } from "./AnalysisPanel";
import { AnalysisReport } from "./AnalysisReport";
import type { OrthoAnalysis } from "./types";
import { SEVERITY_HEX } from "./types";
import type { ToothLandmark } from "../landmarks/types";
import type { ToothSegmentData } from "../segmentation/types";

interface AnalysisViewerProps {
  fileUrl: string;
  fileType: string;
  scanId: number;
  jawType: string;
  scanName?: string;
  segments: ToothSegmentData[];
  landmarks: ToothLandmark[];
  initialAnalysis?: OrthoAnalysis | null;
  onSave: (analysis: OrthoAnalysis) => Promise<void>;
  isSaving: boolean;
  hasSaved: boolean;
}

interface ToothMeshEntry {
  mesh: THREE.Mesh;
  toothId: number;
  material: THREE.MeshPhongMaterial;
  baseMaterial: THREE.MeshPhongMaterial;
}

interface RotationArrow {
  group: THREE.Group;
  toothId: number;
}

export function AnalysisViewer({
  fileUrl,
  fileType,
  scanId,
  jawType,
  scanName,
  segments,
  landmarks,
  initialAnalysis,
  onSave,
  isSaving,
  hasSaved,
}: AnalysisViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const reqIdRef = useRef<number>(0);
  const toothMeshesRef = useRef<ToothMeshEntry[]>([]);
  const rotationArrowsRef = useRef<RotationArrow[]>([]);

  const [loadingMesh, setLoadingMesh] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<OrthoAnalysis | null>(initialAnalysis ?? null);
  const [hasRun, setHasRun] = useState(!!initialAnalysis);
  const [selectedToothId, setSelectedToothId] = useState<number | null>(null);
  const [showReport, setShowReport] = useState(false);

  const hasData = segments.length > 0 && landmarks.length > 0;

  // ── scene helpers ────────────────────────────────────────────────────────

  const clearToothMeshes = useCallback(() => {
    if (!sceneRef.current) return;
    for (const tm of toothMeshesRef.current) {
      sceneRef.current.remove(tm.mesh);
      tm.mesh.geometry.dispose();
      tm.material.dispose();
      tm.baseMaterial.dispose();
    }
    toothMeshesRef.current = [];
  }, []);

  const clearArrows = useCallback(() => {
    if (!sceneRef.current) return;
    for (const a of rotationArrowsRef.current) {
      sceneRef.current.remove(a.group);
      a.group.traverse((c) => {
        if (c instanceof THREE.Mesh) {
          c.geometry.dispose();
          (c.material as THREE.Material).dispose();
        }
      });
    }
    rotationArrowsRef.current = [];
  }, []);

  const buildToothMeshes = useCallback(
    (baseGeo: THREE.BufferGeometry, healthMap?: OrthoAnalysis["toothHealthMap"]) => {
      if (!sceneRef.current) return;
      clearToothMeshes();
      const entries: ToothMeshEntry[] = [];

      for (const seg of segments) {
        const geo = buildToothGeometry(baseGeo, seg.faceIndices);
        const entry = healthMap?.[seg.toothId];
        const baseHex =
          entry && entry.severity >= 0.5
            ? SEVERITY_HEX[entry.severityLabel]
            : 0x4a9eff;

        const mat = new THREE.MeshPhongMaterial({
          color: baseHex,
          specular: 0x222222,
          shininess: 40,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.82,
        });
        const baseMat = mat.clone();
        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData.toothId = seg.toothId;
        mesh.castShadow = true;
        sceneRef.current.add(mesh);
        entries.push({ mesh, toothId: seg.toothId, material: mat, baseMaterial: baseMat });
      }
      toothMeshesRef.current = entries;
    },
    [segments, clearToothMeshes]
  );

  const addRotationArrows = useCallback(
    (orthoAnalysis: OrthoAnalysis) => {
      if (!sceneRef.current) return;
      clearArrows();
      const rotationFinding = orthoAnalysis.findings.find((f) => f.type === "rotation" && f.severity >= 2);
      if (!rotationFinding || rotationFinding.affectedTeeth.length === 0) return;

      const arrowColor = 0xfbbf24;
      const newArrows: RotationArrow[] = [];

      for (const toothId of rotationFinding.affectedTeeth.slice(0, 8)) {
        const seg = segments.find((s) => s.toothId === toothId);
        if (!seg) continue;

        const group = new THREE.Group();
        group.position.set(seg.centroid.x, seg.centroid.y + 8, seg.centroid.z);

        const ringGeo = new THREE.TorusGeometry(3, 0.3, 8, 24);
        const ringMat = new THREE.MeshBasicMaterial({ color: arrowColor, depthTest: false });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2;
        ring.renderOrder = 998;
        group.add(ring);

        const coneMat = new THREE.MeshBasicMaterial({ color: arrowColor, depthTest: false });
        const coneGeo = new THREE.ConeGeometry(0.8, 2, 6);
        const cone = new THREE.Mesh(coneGeo, coneMat);
        cone.position.set(3, 1, 0);
        cone.renderOrder = 998;
        group.add(cone);

        sceneRef.current.add(group);
        newArrows.push({ group, toothId });
      }
      rotationArrowsRef.current = newArrows;
    },
    [segments, clearArrows]
  );

  // ── Three.js init ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return;
    setLoadingMesh(true);
    setError(null);

    const container = containerRef.current;
    const { clientWidth: w, clientHeight: h } = container;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1117);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
    camera.position.set(0, 30, 150);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const dir1 = new THREE.DirectionalLight(0xffffff, 0.9);
    dir1.position.set(1, 1, 1).normalize();
    scene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dir2.position.set(-1, -0.5, -1).normalize();
    scene.add(dir2);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x1a2540, 0.4));

    const grid = new THREE.GridHelper(200, 40, 0x1a2030, 0x131920);
    grid.position.y = -55;
    scene.add(grid);

    const onError = () => { setError("Failed to load 3D model."); setLoadingMesh(false); };

    const processGeometry = (geometry: THREE.BufferGeometry) => {
      geometry.computeVertexNormals();
      geometry.center();
      geometry.computeBoundingSphere();
      const scale = 50 / (geometry.boundingSphere?.radius ?? 50);
      geometry.scale(scale, scale, scale);
      geometry.rotateX(-Math.PI / 2);

      buildToothMeshes(geometry, initialAnalysis?.toothHealthMap);
      if (initialAnalysis) addRotationArrows(initialAnalysis);
      setLoadingMesh(false);
    };

    const type = fileType.toLowerCase();
    if (type === "stl") new STLLoader().load(fileUrl, processGeometry, undefined, onError);
    else if (type === "obj") {
      new OBJLoader().load(fileUrl, (group) => {
        const geos: THREE.BufferGeometry[] = [];
        group.traverse((c) => { if ((c as THREE.Mesh).isMesh) geos.push((c as THREE.Mesh).geometry); });
        if (geos.length > 0) processGeometry(geos[0]); else onError();
      }, undefined, onError);
    } else if (type === "ply") new PLYLoader().load(fileUrl, processGeometry, undefined, onError);
    else { setError(`Unsupported file type: ${type}`); setLoadingMesh(false); }

    const animate = () => {
      reqIdRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const ro = new ResizeObserver(() => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const { clientWidth: rw, clientHeight: rh } = containerRef.current;
      cameraRef.current.aspect = rw / rh;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(rw, rh);
    });
    ro.observe(container);

    return () => {
      cancelAnimationFrame(reqIdRef.current);
      ro.disconnect();
      clearToothMeshes();
      clearArrows();
      if (rendererRef.current && containerRef.current?.contains(rendererRef.current.domElement)) {
        containerRef.current.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }
      controlsRef.current?.dispose();
    };
  }, [fileUrl, fileType]);

  // ── hover interaction ────────────────────────────────────────────────────

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !cameraRef.current) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let lastHovered: number | null = null;

    const onMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, cameraRef.current!);

      const meshes = toothMeshesRef.current.map((t) => t.mesh);
      const hits = raycaster.intersectObjects(meshes, false);
      const hoveredId: number | null = hits[0]?.object?.userData?.toothId ?? null;

      if (hoveredId !== lastHovered) {
        for (const tm of toothMeshesRef.current) {
          const isHovered = tm.toothId === hoveredId;
          const isSelected = tm.toothId === selectedToothId;
          tm.material.opacity = isHovered || isSelected ? 1.0 : hoveredId !== null ? 0.45 : 0.82;
          tm.material.emissive.setHex(isHovered ? 0x222222 : 0x000000);
        }
        container.style.cursor = hoveredId ? "pointer" : "default";
        lastHovered = hoveredId;
      }
    };

    const onClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, cameraRef.current!);
      const meshes = toothMeshesRef.current.map((t) => t.mesh);
      const hits = raycaster.intersectObjects(meshes, false);
      const clickedId: number | null = hits[0]?.object?.userData?.toothId ?? null;
      setSelectedToothId((prev) => (prev === clickedId ? null : clickedId));
    };

    container.addEventListener("mousemove", onMouseMove);
    container.addEventListener("click", onClick);
    return () => {
      container.removeEventListener("mousemove", onMouseMove);
      container.removeEventListener("click", onClick);
    };
  }, [selectedToothId, analysis]);

  // highlight selected tooth
  useEffect(() => {
    for (const tm of toothMeshesRef.current) {
      const isSelected = tm.toothId === selectedToothId;
      tm.material.opacity = isSelected ? 1.0 : 0.82;
      tm.material.emissive.setHex(isSelected ? 0x333333 : 0x000000);
    }
  }, [selectedToothId]);

  // ── run analysis ─────────────────────────────────────────────────────────

  const runAnalysis = useCallback(async () => {
    setRunning(true);
    setProgress(0);
    await new Promise((r) => setTimeout(r, 30));

    for (let i = 0; i <= 80; i += 20) {
      setProgress(i);
      await new Promise((r) => setTimeout(r, 60));
    }

    const result = runOrthoAnalysis(landmarks, segments, jawType);

    setProgress(100);
    await new Promise((r) => setTimeout(r, 100));

    setAnalysis(result);
    setHasRun(true);

    // Recolor teeth
    for (const tm of toothMeshesRef.current) {
      const entry = result.toothHealthMap[tm.toothId];
      const hex = entry && entry.severity >= 0.5 ? SEVERITY_HEX[entry.severityLabel] : 0x4a9eff;
      tm.material.color.setHex(hex);
      tm.baseMaterial.color.setHex(hex);
    }

    addRotationArrows(result);
    setRunning(false);
  }, [landmarks, segments, jawType, addRotationArrows]);

  const resetView = () => {
    cameraRef.current?.position.set(0, 30, 150);
    cameraRef.current?.up.set(0, 1, 0);
    controlsRef.current?.target.set(0, 0, 0);
    controlsRef.current?.update();
  };

  // ── render ───────────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex h-[700px] w-full overflow-hidden rounded-xl border border-white/10">
        <div ref={containerRef} className="relative flex-1 overflow-hidden bg-[#0d1117]">
          {loadingMesh && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0d1117]/90">
              <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
              <p className="text-sm text-white/70 animate-pulse">Loading scan…</p>
            </div>
          )}

          {!loadingMesh && !hasData && !running && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0d1117]/80 backdrop-blur-sm">
              <div className="bg-[#161b22] border border-white/10 rounded-2xl p-8 max-w-sm text-center">
                <Zap className="h-10 w-10 text-amber-400 mx-auto mb-4" />
                <h3 className="text-base font-bold text-white mb-2">Segmentation & Landmarks Required</h3>
                <p className="text-sm text-white/50">
                  Run <strong>AI Segmentation</strong> and <strong>Landmark Detection</strong> on this scan first, then return here for orthodontic analysis.
                </p>
                <div className="mt-4 space-y-1.5">
                  {[["1", "AI Segmentation tab → Segment"], ["2", "Landmarks tab → Detect & Save"], ["3", "Analysis tab → Run Analysis"]].map(([n, s]) => (
                    <div key={n} className="flex items-center gap-2 text-xs text-white/50 text-left bg-white/5 rounded-lg px-3 py-2">
                      <span className="text-[10px] font-mono bg-white/15 px-1.5 py-0.5 rounded text-white/60">{n}</span>
                      {s}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!loadingMesh && hasData && !hasRun && !running && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0d1117]/75 backdrop-blur-sm">
              <div className="bg-[#161b22] border border-white/10 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
                <div className="h-16 w-16 rounded-2xl bg-blue-500/15 flex items-center justify-center mx-auto mb-5">
                  <Zap className="h-8 w-8 text-blue-400" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Orthodontic Analysis</h3>
                <p className="text-sm text-white/50 mb-3">
                  Analyze <strong className="text-white">{segments.length} teeth</strong> across{" "}
                  <strong className="text-white">{landmarks.length}</strong> landmarks for 9 orthodontic conditions.
                </p>
                <div className="grid grid-cols-3 gap-1.5 mb-6">
                  {["Crowding", "Spacing", "Rotation", "Midline", "Overjet", "Overbite", "Crossbite", "Open Bite", "Deep Bite"].map((label) => (
                    <span key={label} className="text-[9px] text-white/40 bg-white/5 rounded px-2 py-1 font-medium">
                      {label}
                    </span>
                  ))}
                </div>
                <Button onClick={runAnalysis} className="w-full gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold">
                  <Zap className="h-4 w-4" />
                  Run Analysis
                </Button>
              </div>
            </div>
          )}

          {running && (
            <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-[#0d1117]/85 backdrop-blur-sm">
              <Zap className="h-12 w-12 text-blue-400 mb-5 animate-pulse" />
              <p className="text-base font-semibold text-white mb-3">Running analysis…</p>
              <div className="w-64 mb-2">
                <Progress value={progress} className="h-2 bg-white/10" />
              </div>
              <p className="text-xs text-white/40 font-mono">{progress}%</p>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0d1117]">
              <XCircle className="h-12 w-12 text-destructive mb-4" />
              <p className="text-white font-medium mb-4">{error}</p>
            </div>
          )}

          {/* Health legend */}
          {hasRun && !running && (
            <div className="absolute top-4 left-4 z-20 bg-black/50 backdrop-blur border border-white/10 rounded-lg px-3 py-2 space-y-1">
              <p className="text-[9px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">Health Map</p>
              {(["none", "mild", "moderate", "severe", "critical"] as const).map((sev) => (
                <div key={sev} className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full" style={{
                    backgroundColor: sev === "none" ? "#4a9eff" : sev === "mild" ? "#f59e0b" : sev === "moderate" ? "#f97316" : sev === "severe" ? "#ef4444" : "#dc2626"
                  }} />
                  <span className="text-[10px] text-white/50 capitalize">{sev === "none" ? "Healthy" : sev}</span>
                </div>
              ))}
            </div>
          )}

          {/* Selected tooth info */}
          {selectedToothId != null && analysis && (
            <div className="absolute bottom-4 left-4 z-20 bg-black/60 backdrop-blur border border-white/10 rounded-lg px-3 py-2 max-w-xs">
              <p className="text-xs font-mono font-bold text-white mb-1">Tooth {selectedToothId}</p>
              {analysis.toothHealthMap[selectedToothId] ? (
                <div className="space-y-0.5">
                  <p className="text-[10px] text-white/50 capitalize">
                    Severity: <span className="text-white font-medium">
                      {analysis.toothHealthMap[selectedToothId].severityLabel}
                    </span>
                  </p>
                  {analysis.toothHealthMap[selectedToothId].issues.length > 0 && (
                    <p className="text-[10px] text-white/50">
                      Issues: <span className="text-white/70">{analysis.toothHealthMap[selectedToothId].issues.join(", ")}</span>
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[10px] text-white/50">No issues detected</p>
              )}
            </div>
          )}

          <div className="absolute top-4 right-4 z-20 flex gap-2">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9 bg-black/40 backdrop-blur border-white/10 text-white hover:bg-white/20" onClick={resetView}>
                    <Focus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left" className="text-xs">Reset Camera</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9 bg-black/40 backdrop-blur border-white/10 text-white hover:bg-white/20"
                    onClick={() => document.fullscreenElement ? document.exitFullscreen() : containerRef.current?.requestFullscreen()}>
                    <Maximize className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left" className="text-xs">Fullscreen</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        <AnalysisPanel
          analysis={analysis}
          isSaving={isSaving}
          hasSaved={hasSaved}
          onSave={() => analysis && onSave(analysis)}
          onReport={() => setShowReport(true)}
          onRerun={runAnalysis}
          selectedToothId={selectedToothId}
          onSelectTooth={setSelectedToothId}
        />
      </div>

      {analysis && (
        <AnalysisReport
          open={showReport}
          onClose={() => setShowReport(false)}
          scanId={scanId}
          jawType={jawType}
          scanName={scanName}
          analysis={analysis}
        />
      )}
    </>
  );
}
