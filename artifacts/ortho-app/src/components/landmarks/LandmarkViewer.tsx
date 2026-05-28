import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Loader2, XCircle, Focus, Maximize, MapPin, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { buildToothGeometry } from "../segmentation/meshSegmentation";
import { detectAllLandmarks } from "./landmarkDetection";
import { calculateMeasurements } from "./measurementEngine";
import { MeasurementPanel } from "./MeasurementPanel";
import { ReportModal } from "./ReportModal";
import type { ToothLandmark, DentalMeasurement } from "./types";
import { LANDMARK_COLORS, LANDMARK_SIZE } from "./types";
import type { ToothSegmentData } from "../segmentation/types";

interface LandmarkViewerProps {
  fileUrl: string;
  fileType: string;
  scanId: number;
  jawType: string;
  scanName?: string;
  segments: ToothSegmentData[];
  initialLandmarks?: ToothLandmark[];
  onSave: (landmarks: ToothLandmark[]) => Promise<void>;
  isSaving: boolean;
  hasSaved: boolean;
}

interface ToothMeshEntry {
  mesh: THREE.Mesh;
  toothId: number;
  geometry: THREE.BufferGeometry;
  centroid: { x: number; y: number; z: number };
  material: THREE.MeshPhongMaterial;
}

interface MarkerEntry {
  mesh: THREE.Mesh;
  landmark: ToothLandmark;
  material: THREE.MeshBasicMaterial;
  baseScale: number;
}

export function LandmarkViewer({
  fileUrl,
  fileType,
  scanId,
  jawType,
  scanName,
  segments,
  initialLandmarks,
  onSave,
  isSaving,
  hasSaved,
}: LandmarkViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const reqIdRef = useRef<number>(0);
  const toothMeshesRef = useRef<ToothMeshEntry[]>([]);
  const markersRef = useRef<MarkerEntry[]>([]);
  const baseGeometryRef = useRef<THREE.BufferGeometry | null>(null);
  const isDraggingLandmarkRef = useRef(false);
  const dragLandmarkIdRef = useRef<string | null>(null);

  const [loadingMesh, setLoadingMesh] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [landmarks, setLandmarks] = useState<ToothLandmark[]>(initialLandmarks ?? []);
  const [measurements, setMeasurements] = useState<DentalMeasurement[]>(() =>
    initialLandmarks ? calculateMeasurements(initialLandmarks, jawType) : []
  );
  const [selectedLandmarkId, setSelectedLandmarkId] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [hasDetected, setHasDetected] = useState((initialLandmarks?.length ?? 0) > 0);

  const clearMarkers = useCallback(() => {
    if (!sceneRef.current) return;
    for (const m of markersRef.current) {
      sceneRef.current.remove(m.mesh);
      m.mesh.geometry.dispose();
      m.material.dispose();
    }
    markersRef.current = [];
  }, []);

  const buildMarkers = useCallback((lms: ToothLandmark[]) => {
    if (!sceneRef.current) return;
    clearMarkers();
    const newMarkers: MarkerEntry[] = [];
    for (const lm of lms) {
      const color = new THREE.Color(LANDMARK_COLORS[lm.type]);
      const size = LANDMARK_SIZE[lm.type] ?? 0.8;
      const geo = new THREE.SphereGeometry(size, 12, 12);
      const mat = new THREE.MeshBasicMaterial({ color, depthTest: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(lm.position.x, lm.position.y, lm.position.z);
      mesh.renderOrder = 999;
      mesh.userData.landmarkId = lm.id;
      sceneRef.current.add(mesh);
      newMarkers.push({ mesh, landmark: lm, material: mat, baseScale: 1 });
    }
    markersRef.current = newMarkers;
  }, [clearMarkers]);

  const clearToothMeshes = useCallback(() => {
    if (!sceneRef.current) return;
    for (const tm of toothMeshesRef.current) {
      sceneRef.current.remove(tm.mesh);
      tm.mesh.geometry.dispose();
      tm.material.dispose();
    }
    toothMeshesRef.current = [];
  }, []);

  const buildToothMeshes = useCallback(
    (segs: ToothSegmentData[], baseGeo: THREE.BufferGeometry) => {
      if (!sceneRef.current) return;
      clearToothMeshes();
      const entries: ToothMeshEntry[] = [];
      for (const seg of segs) {
        const geo = buildToothGeometry(baseGeo, seg.faceIndices);
        const mat = new THREE.MeshPhongMaterial({
          color: new THREE.Color(seg.color),
          specular: 0x222222,
          shininess: 35,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.72,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData.toothId = seg.toothId;
        mesh.castShadow = true;
        sceneRef.current.add(mesh);
        entries.push({ mesh, toothId: seg.toothId, geometry: geo, centroid: seg.centroid, material: mat });
      }
      toothMeshesRef.current = entries;
    },
    [clearToothMeshes]
  );

  useEffect(() => {
    if (!containerRef.current) return;
    if (rendererRef.current) rendererRef.current.dispose();

    setLoadingMesh(true);
    setError(null);

    const container = containerRef.current;
    const { clientWidth: w, clientHeight: h } = container;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1117);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
    camera.position.set(0, 0, 150);
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

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dir1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dir1.position.set(1, 1, 1).normalize();
    scene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dir2.position.set(-1, -0.5, -1).normalize();
    scene.add(dir2);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 0.4));

    const grid = new THREE.GridHelper(200, 40, 0x1a2030, 0x131920);
    grid.position.y = -55;
    scene.add(grid);

    const onError = () => { setError("Failed to load 3D model."); setLoadingMesh(false); };

    const processGeometry = (geometry: THREE.BufferGeometry) => {
      geometry.computeVertexNormals();
      geometry.center();
      geometry.computeBoundingSphere();
      const radius = geometry.boundingSphere?.radius ?? 50;
      const scale = 50 / radius;
      geometry.scale(scale, scale, scale);
      geometry.rotateX(-Math.PI / 2);

      baseGeometryRef.current = geometry;
      buildToothMeshes(segments, geometry);

      if (initialLandmarks && initialLandmarks.length > 0) {
        buildMarkers(initialLandmarks);
        setLandmarks(initialLandmarks);
        setMeasurements(calculateMeasurements(initialLandmarks, jawType));
        setHasDetected(true);
      }

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
      if (!isDraggingLandmarkRef.current) controls.update();
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
      clearMarkers();
      clearToothMeshes();
      if (rendererRef.current && containerRef.current?.contains(rendererRef.current.domElement)) {
        containerRef.current.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }
      controlsRef.current?.dispose();
    };
  }, [fileUrl, fileType]);

  // Marker hover & drag interaction
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !cameraRef.current) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    raycaster.params.Points = { threshold: 2 };

    let lastHoveredId: string | null = null;

    const getMouseNDC = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (isDraggingLandmarkRef.current && dragLandmarkIdRef.current) {
        getMouseNDC(e);
        raycaster.setFromCamera(mouse, cameraRef.current!);

        const toothMeshes = toothMeshesRef.current.map((t) => t.mesh);
        const hits = raycaster.intersectObjects(toothMeshes, false);
        if (hits.length > 0) {
          const point = hits[0].point;
          const marker = markersRef.current.find((m) => m.landmark.id === dragLandmarkIdRef.current);
          if (marker) {
            marker.mesh.position.copy(point);
            marker.landmark = { ...marker.landmark, position: { x: point.x, y: point.y, z: point.z }, isManual: true };
          }
        }
        return;
      }

      getMouseNDC(e);
      raycaster.setFromCamera(mouse, cameraRef.current!);
      const markerMeshes = markersRef.current.map((m) => m.mesh);
      const hits = raycaster.intersectObjects(markerMeshes, false);
      const hoveredId: string | null = hits[0]?.object?.userData?.landmarkId ?? null;

      if (hoveredId !== lastHoveredId) {
        for (const m of markersRef.current) {
          const scale = m.landmark.id === hoveredId ? 1.6 : 1.0;
          m.mesh.scale.setScalar(scale);
        }
        lastHoveredId = hoveredId;
        container.style.cursor = hoveredId ? "grab" : "default";
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      getMouseNDC(e);
      raycaster.setFromCamera(mouse, cameraRef.current!);
      const markerMeshes = markersRef.current.map((m) => m.mesh);
      const hits = raycaster.intersectObjects(markerMeshes, false);
      const hitId: string | null = hits[0]?.object?.userData?.landmarkId ?? null;

      if (hitId) {
        isDraggingLandmarkRef.current = true;
        dragLandmarkIdRef.current = hitId;
        controlsRef.current!.enabled = false;
        container.style.cursor = "grabbing";
        setSelectedLandmarkId(hitId);
        e.stopPropagation();
      }
    };

    const onMouseUp = () => {
      if (isDraggingLandmarkRef.current) {
        isDraggingLandmarkRef.current = false;
        controlsRef.current!.enabled = true;
        container.style.cursor = "default";

        const dragId = dragLandmarkIdRef.current;
        if (dragId) {
          const marker = markersRef.current.find((m) => m.landmark.id === dragId);
          if (marker) {
            setLandmarks((prev) => {
              const next = prev.map((l) =>
                l.id === dragId
                  ? { ...l, position: marker.landmark.position, isManual: true }
                  : l
              );
              setMeasurements(calculateMeasurements(next, jawType));
              return next;
            });
          }
        }
        dragLandmarkIdRef.current = null;
      }
    };

    container.addEventListener("mousemove", onMouseMove);
    container.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      container.removeEventListener("mousemove", onMouseMove);
      container.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [jawType]);

  const runDetection = useCallback(async () => {
    if (!baseGeometryRef.current || toothMeshesRef.current.length === 0) return;
    setDetecting(true);
    setProgress(0);

    await new Promise((r) => setTimeout(r, 30));

    const toothInputs = toothMeshesRef.current.map((tm) => ({
      geometry: tm.geometry,
      toothId: tm.toothId,
      centroid: tm.centroid,
    }));

    const total = toothInputs.length;
    const detected: ToothLandmark[] = [];
    for (let i = 0; i < total; i++) {
      const { detectToothLandmarks } = await import("./landmarkDetection");
      const lms = detectToothLandmarks(toothInputs[i].geometry, toothInputs[i].toothId, toothInputs[i].centroid);
      detected.push(...lms);
      setProgress(Math.round(((i + 1) / total) * 100));
      if (i % 3 === 0) await new Promise((r) => setTimeout(r, 0));
    }

    setLandmarks(detected);
    setMeasurements(calculateMeasurements(detected, jawType));
    buildMarkers(detected);
    setHasDetected(true);
    setDetecting(false);
  }, [jawType, buildMarkers]);

  useEffect(() => {
    for (const m of markersRef.current) {
      const isSelected = m.landmark.id === selectedLandmarkId;
      m.material.color.set(isSelected ? 0xffffff : LANDMARK_COLORS[m.landmark.type]);
    }
  }, [selectedLandmarkId]);

  const resetView = () => {
    cameraRef.current?.position.set(0, 0, 150);
    cameraRef.current?.up.set(0, 1, 0);
    controlsRef.current?.target.set(0, 0, 0);
    controlsRef.current?.update();
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) containerRef.current.requestFullscreen();
    else document.exitFullscreen();
  };

  const noSegments = segments.length === 0;

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

          {!loadingMesh && noSegments && !detecting && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0d1117]/80 backdrop-blur-sm">
              <div className="bg-[#161b22] border border-white/10 rounded-2xl p-8 max-w-sm text-center">
                <MapPin className="h-10 w-10 text-amber-400 mx-auto mb-4" />
                <h3 className="text-base font-bold text-white mb-2">No Segments Found</h3>
                <p className="text-sm text-white/50">
                  Run AI Segmentation first to identify individual teeth, then use this module for landmark detection.
                </p>
              </div>
            </div>
          )}

          {!loadingMesh && !noSegments && !hasDetected && !detecting && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0d1117]/75 backdrop-blur-sm">
              <div className="bg-[#161b22] border border-white/10 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
                <div className="h-16 w-16 rounded-2xl bg-amber-500/15 flex items-center justify-center mx-auto mb-5">
                  <MapPin className="h-8 w-8 text-amber-400" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Landmark Detection</h3>
                <p className="text-sm text-white/50 mb-6">
                  Automatically detect incisal edges, cusps, contact points, gingival margins, and tooth centers on{" "}
                  {segments.length} segmented teeth.
                </p>
                <Button onClick={runDetection} className="w-full gap-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold">
                  <MapPin className="h-4 w-4" />
                  Detect Landmarks
                </Button>
              </div>
            </div>
          )}

          {detecting && (
            <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-[#0d1117]/85 backdrop-blur-sm">
              <Brain className="h-12 w-12 text-amber-400 mb-5 animate-pulse" />
              <p className="text-base font-semibold text-white mb-3">Detecting landmarks…</p>
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
              <Button variant="outline" className="text-white border-white/20" onClick={() => window.location.reload()}>
                Retry
              </Button>
            </div>
          )}

          {hasDetected && !detecting && (
            <div className="absolute top-4 left-4 z-20">
              <div className="bg-black/50 backdrop-blur border border-white/10 rounded-md px-3 py-2 text-xs text-white/60 font-mono">
                <span className="text-amber-400 font-semibold">{landmarks.length}</span> landmarks
                <span className="mx-1.5 text-white/20">·</span>
                <span className="text-white/50">drag to adjust</span>
              </div>
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
                  <Button variant="outline" size="icon" className="h-9 w-9 bg-black/40 backdrop-blur border-white/10 text-white hover:bg-white/20" onClick={toggleFullscreen}>
                    <Maximize className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left" className="text-xs">Fullscreen</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {hasDetected && !detecting && (
            <div className="absolute bottom-4 left-4 z-20">
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 bg-black/50 backdrop-blur border-white/10 text-white/70 hover:text-white hover:bg-white/15" onClick={runDetection}>
                <Brain className="h-3.5 w-3.5" />
                Re-detect
              </Button>
            </div>
          )}
        </div>

        <MeasurementPanel
          landmarks={landmarks}
          measurements={measurements}
          selectedLandmarkId={selectedLandmarkId}
          isSaving={isSaving}
          hasSaved={hasSaved}
          onSelectLandmark={setSelectedLandmarkId}
          onSave={() => onSave(landmarks)}
          onReport={() => setShowReport(true)}
          onRedetect={runDetection}
        />
      </div>

      <ReportModal
        open={showReport}
        onClose={() => setShowReport(false)}
        scanId={scanId}
        jawType={jawType}
        landmarks={landmarks}
        measurements={measurements}
        scanName={scanName}
      />
    </>
  );
}
