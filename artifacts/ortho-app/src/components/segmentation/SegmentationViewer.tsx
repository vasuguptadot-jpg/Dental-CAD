import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Loader2, XCircle, Focus, Maximize, Rotate3D, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { segmentDentalMesh, buildToothGeometry } from "./meshSegmentation";
import { ToothPanel } from "./ToothPanel";
import type { ToothSegmentData, CorrectionTool } from "./types";

interface SegmentationViewerProps {
  fileUrl: string;
  fileType: string;
  scanId: number;
  jawType: string;
  initialSegments?: ToothSegmentData[];
  onSave: (segments: ToothSegmentData[]) => Promise<void>;
  isSaving: boolean;
  hasSavedResults: boolean;
}

interface ToothMesh {
  mesh: THREE.Mesh;
  toothId: number;
  originalColor: string;
  material: THREE.MeshPhongMaterial;
}

export function SegmentationViewer({
  fileUrl,
  fileType,
  scanId,
  jawType,
  initialSegments,
  onSave,
  isSaving,
  hasSavedResults,
}: SegmentationViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const reqIdRef = useRef<number>(0);
  const toothMeshesRef = useRef<ToothMesh[]>([]);
  const baseGeometryRef = useRef<THREE.BufferGeometry | null>(null);

  const [loadingMesh, setLoadingMesh] = useState(true);
  const [segmenting, setSegmenting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [segments, setSegments] = useState<ToothSegmentData[]>(initialSegments ?? []);
  const [selectedToothId, setSelectedToothId] = useState<number | null>(null);
  const [hoveredToothId, setHoveredToothId] = useState<number | null>(null);
  const [activeTool, setActiveTool] = useState<CorrectionTool>("none");
  const [mergeFirst, setMergeFirst] = useState<number | null>(null);
  const [hasSegmented, setHasSegmented] = useState((initialSegments?.length ?? 0) > 0);

  const clearToothMeshes = useCallback(() => {
    if (!sceneRef.current) return;
    for (const tm of toothMeshesRef.current) {
      sceneRef.current.remove(tm.mesh);
      tm.mesh.geometry.dispose();
      tm.material.dispose();
    }
    toothMeshesRef.current = [];
  }, []);

  const buildToothMeshes = useCallback((segs: ToothSegmentData[], baseGeo: THREE.BufferGeometry) => {
    if (!sceneRef.current) return;
    clearToothMeshes();

    const newMeshes: ToothMesh[] = [];
    for (const seg of segs) {
      const geo = buildToothGeometry(baseGeo, seg.faceIndices);
      const mat = new THREE.MeshPhongMaterial({
        color: new THREE.Color(seg.color),
        specular: new THREE.Color(0x222222),
        shininess: 40,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.toothId = seg.toothId;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      sceneRef.current.add(mesh);
      newMeshes.push({ mesh, toothId: seg.toothId, originalColor: seg.color, material: mat });
    }
    toothMeshesRef.current = newMeshes;
  }, [clearToothMeshes]);

  useEffect(() => {
    if (!containerRef.current) return;

    if (rendererRef.current) rendererRef.current.dispose();

    setLoadingMesh(true);
    setError(null);

    const container = containerRef.current;
    const { clientWidth: width, clientHeight: height } = container;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1117);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 150);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dir1 = new THREE.DirectionalLight(0xffffff, 0.9);
    dir1.position.set(1, 1, 1).normalize();
    scene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.4);
    dir2.position.set(-1, -0.5, -1).normalize();
    scene.add(dir2);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x334455, 0.5);
    scene.add(hemi);

    const grid = new THREE.GridHelper(200, 40, 0x1a2030, 0x131920);
    grid.position.y = -55;
    scene.add(grid);

    const onError = () => {
      setError("Failed to load 3D model.");
      setLoadingMesh(false);
    };

    const processGeometry = (geometry: THREE.BufferGeometry) => {
      geometry.computeVertexNormals();
      geometry.center();

      geometry.computeBoundingSphere();
      const radius = geometry.boundingSphere?.radius ?? 50;
      const scale = 50 / radius;
      geometry.scale(scale, scale, scale);
      geometry.rotateX(-Math.PI / 2);

      baseGeometryRef.current = geometry;

      setLoadingMesh(false);

      if (initialSegments && initialSegments.length > 0) {
        buildToothMeshes(initialSegments, geometry);
        setSegments(initialSegments);
        setHasSegmented(true);
      }
    };

    const type = fileType.toLowerCase();
    if (type === "stl") {
      new STLLoader().load(fileUrl, processGeometry, undefined, onError);
    } else if (type === "obj") {
      new OBJLoader().load(fileUrl, (group) => {
        const geos: THREE.BufferGeometry[] = [];
        group.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) geos.push((child as THREE.Mesh).geometry);
        });
        if (geos.length > 0) processGeometry(geos[0]);
        else onError();
      }, undefined, onError);
    } else if (type === "ply") {
      new PLYLoader().load(fileUrl, processGeometry, undefined, onError);
    } else {
      setError(`Unsupported file type: ${type}`);
      setLoadingMesh(false);
    }

    const animate = () => {
      reqIdRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const ro = new ResizeObserver(() => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const { clientWidth: w, clientHeight: h } = containerRef.current;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    });
    ro.observe(container);

    return () => {
      cancelAnimationFrame(reqIdRef.current);
      ro.disconnect();
      clearToothMeshes();
      if (rendererRef.current && containerRef.current?.contains(rendererRef.current.domElement)) {
        containerRef.current.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }
      controlsRef.current?.dispose();
    };
  }, [fileUrl, fileType]);

  useEffect(() => {
    for (const tm of toothMeshesRef.current) {
      const isSelected = tm.toothId === selectedToothId;
      const isHovered = tm.toothId === hoveredToothId;
      if (isSelected) {
        tm.material.emissive.set(0x444444);
        tm.material.opacity = 1;
      } else if (isHovered) {
        tm.material.emissive.set(0x222222);
        tm.material.opacity = 1;
      } else if (selectedToothId !== null) {
        tm.material.emissive.set(0x000000);
        tm.material.opacity = 0.35;
      } else {
        tm.material.emissive.set(0x000000);
        tm.material.opacity = 1;
      }
    }
  }, [selectedToothId, hoveredToothId]);

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
      const hit = hits[0]?.object?.userData?.toothId ?? null;
      if (hit !== lastHovered) {
        lastHovered = hit;
        setHoveredToothId(hit);
      }
    };

    const onClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, cameraRef.current!);

      const meshes = toothMeshesRef.current.map((t) => t.mesh);
      const hits = raycaster.intersectObjects(meshes, false);
      const hitToothId: number | null = hits[0]?.object?.userData?.toothId ?? null;

      if (hitToothId === null) {
        setSelectedToothId(null);
        return;
      }

      setActiveTool((tool) => {
        if (tool === "merge") {
          setMergeFirst((first) => {
            if (first === null) return hitToothId;
            if (first === hitToothId) return null;
            handleMerge(first, hitToothId);
            return null;
          });
          return tool;
        }
        if (tool === "split") {
          handleSplit(hitToothId);
          return "none";
        }
        if (tool === "rename") {
          return tool;
        }
        setSelectedToothId((cur) => cur === hitToothId ? null : hitToothId);
        return tool;
      });
    };

    container.addEventListener("mousemove", onMouseMove);
    container.addEventListener("click", onClick);
    return () => {
      container.removeEventListener("mousemove", onMouseMove);
      container.removeEventListener("click", onClick);
    };
  }, []);

  const runSegmentation = async () => {
    if (!baseGeometryRef.current) return;

    setSegmenting(true);
    setProgress(0);
    clearToothMeshes();

    await new Promise((r) => setTimeout(r, 50));

    const geo = baseGeometryRef.current;
    const results = segmentDentalMesh(geo, jawType, (pct) => setProgress(pct));

    setSegments(results);
    setHasSegmented(true);
    buildToothMeshes(results, geo);
    setSegmenting(false);
  };

  const handleMerge = (firstId: number, secondId: number) => {
    setSegments((prev) => {
      const first = prev.find((s) => s.toothId === firstId);
      const second = prev.find((s) => s.toothId === secondId);
      if (!first || !second) return prev;

      const merged: ToothSegmentData = {
        ...first,
        faceIndices: [...first.faceIndices, ...second.faceIndices],
        centroid: {
          x: (first.centroid.x + second.centroid.x) / 2,
          y: (first.centroid.y + second.centroid.y) / 2,
          z: (first.centroid.z + second.centroid.z) / 2,
        },
      };

      const next = prev.filter((s) => s.toothId !== secondId).map((s) => (s.toothId === firstId ? merged : s));

      if (baseGeometryRef.current) buildToothMeshes(next, baseGeometryRef.current);
      return next;
    });

    setSelectedToothId(firstId);
  };

  const handleSplit = (toothId: number) => {
    setSegments((prev) => {
      const seg = prev.find((s) => s.toothId === toothId);
      if (!seg || seg.faceIndices.length < 4) return prev;

      const mid = Math.floor(seg.faceIndices.length / 2);
      const half1 = seg.faceIndices.slice(0, mid);
      const half2 = seg.faceIndices.slice(mid);

      const newId = Math.max(...prev.map((s) => s.toothId)) + 1;
      const split1: ToothSegmentData = { ...seg, faceIndices: half1 };
      const split2: ToothSegmentData = {
        ...seg,
        toothId: newId,
        label: String(newId),
        faceIndices: half2,
        color: "#aaaaaa",
      };

      const next = prev.map((s) => (s.toothId === toothId ? split1 : s)).concat(split2);
      if (baseGeometryRef.current) buildToothMeshes(next, baseGeometryRef.current);
      return next;
    });
  };

  const handleRename = (toothId: number, newLabel: string, newToothId: number) => {
    setSegments((prev) => {
      const next = prev.map((s) =>
        s.toothId === toothId ? { ...s, label: newLabel, toothId: newToothId } : s
      );
      for (const tm of toothMeshesRef.current) {
        if (tm.toothId === toothId) {
          tm.mesh.userData.toothId = newToothId;
          (tm as any).toothId = newToothId;
        }
      }
      return next;
    });
    if (selectedToothId === toothId) setSelectedToothId(newToothId);
  };

  const handleMergeTrigger = (toothId: number) => {
    setMergeFirst((first) => {
      if (first === null) return toothId;
      if (first === toothId) return null;
      handleMerge(first, toothId);
      return null;
    });
  };

  const handleSplitTrigger = (toothId: number) => {
    handleSplit(toothId);
  };

  const resetView = () => {
    cameraRef.current?.position.set(0, 0, 150);
    cameraRef.current?.up.set(0, 1, 0);
    controlsRef.current?.target.set(0, 0, 0);
    controlsRef.current?.update();
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const handleSave = () => onSave(segments);

  const handleReset = () => {
    if (baseGeometryRef.current) {
      runSegmentation();
    }
  };

  return (
    <div className="flex h-[680px] w-full overflow-hidden rounded-xl border border-white/10">
      <div ref={containerRef} className="relative flex-1 overflow-hidden bg-[#0d1117]">
        {loadingMesh && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0d1117]/90">
            <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
            <p className="text-sm text-white/70 animate-pulse">Loading 3D scan…</p>
          </div>
        )}

        {!loadingMesh && !hasSegmented && !segmenting && !error && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#0d1117]/70 backdrop-blur-sm">
            <div className="bg-[#161b22] border border-white/10 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
              <div className="h-16 w-16 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto mb-5">
                <Brain className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">AI Tooth Segmentation</h3>
              <p className="text-sm text-white/50 mb-6">
                Automatically detect and separate individual teeth using geometric mesh analysis and spatial clustering.
              </p>
              <Button onClick={runSegmentation} className="w-full gap-2 bg-primary hover:bg-primary/90">
                <Brain className="h-4 w-4" />
                Run AI Segmentation
              </Button>
            </div>
          </div>
        )}

        {segmenting && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-[#0d1117]/85 backdrop-blur-sm">
            <Brain className="h-12 w-12 text-primary mb-5 animate-pulse" />
            <p className="text-base font-semibold text-white mb-3">Segmenting teeth…</p>
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

        {!loadingMesh && hasSegmented && !segmenting && (
          <div className="absolute top-4 left-4 z-20">
            <div className="bg-black/50 backdrop-blur border border-white/10 rounded-md px-3 py-2 text-xs text-white/60 font-mono">
              <span className="text-primary font-semibold">{segments.length}</span> teeth detected
              <span className="ml-2 text-white/30">• hover/click to inspect</span>
            </div>
          </div>
        )}

        <div className="absolute top-4 right-4 z-20 flex gap-2">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 bg-black/40 backdrop-blur border-white/10 text-white hover:bg-white/20"
                  onClick={resetView}
                >
                  <Focus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs">Reset Camera</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 bg-black/40 backdrop-blur border-white/10 text-white hover:bg-white/20"
                  onClick={toggleFullscreen}
                >
                  <Maximize className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs">Fullscreen</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {hasSegmented && !segmenting && (
          <div className="absolute bottom-4 left-4 z-20">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5 bg-black/50 backdrop-blur border-white/10 text-white/70 hover:text-white hover:bg-white/15"
              onClick={runSegmentation}
            >
              <Brain className="h-3.5 w-3.5" />
              Re-segment
            </Button>
          </div>
        )}
      </div>

      <ToothPanel
        segments={segments}
        selectedToothId={selectedToothId}
        hoveredToothId={hoveredToothId}
        activeTool={activeTool}
        mergeFirst={mergeFirst}
        isSaving={isSaving}
        hasSavedResults={hasSavedResults}
        onSelectTooth={setSelectedToothId}
        onSetTool={setActiveTool}
        onMergeTrigger={handleMergeTrigger}
        onSplitTrigger={handleSplitTrigger}
        onRename={handleRename}
        onSave={handleSave}
        onReset={handleReset}
      />
    </div>
  );
}
