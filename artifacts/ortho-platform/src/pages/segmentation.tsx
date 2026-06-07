import { useEffect, useRef, useState, useCallback } from "react";
import { useRoute, Link } from "wouter";
import * as THREE from "three";
import { OrbitControls } from "three-stdlib";
import { STLLoader, OBJLoader, PLYLoader } from "three-stdlib";
import { useGetScan, getGetScanQueryKey, getGetScanAnalysisQueryKey, useGetScanAnalysis, useSaveScanAnalysis } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, Brain, Eye, EyeOff, Maximize, Ruler, RotateCcw, Box, 
  Loader2, Save, FileText, Merge, Split, Tag 
} from "lucide-react";

import { runSegmentation, serializeSegments, type ToothSegment } from "@/lib/segmentation-engine";
import { detectLandmarks, serializeLandmarks, type ToothLandmarks, type Landmark } from "@/lib/landmark-engine";
import { calculateMeasurements, serializeMeasurements, type MeasurementSet } from "@/lib/measurement-engine";
import { generateReportHTML } from "@/lib/report-generator";

const FDI_NAMES: Record<number, string> = {
  11:"UR Central", 12:"UR Lateral", 13:"UR Canine", 14:"UR 1st Premolar", 15:"UR 2nd Premolar", 16:"UR 1st Molar", 17:"UR 2nd Molar", 18:"UR 3rd Molar",
  21:"UL Central", 22:"UL Lateral", 23:"UL Canine", 24:"UL 1st Premolar", 25:"UL 2nd Premolar", 26:"UL 1st Molar", 27:"UL 2nd Molar", 28:"UL 3rd Molar",
  31:"LL Central", 32:"LL Lateral", 33:"LL Canine", 34:"LL 1st Premolar", 35:"LL 2nd Premolar", 36:"LL 1st Molar", 37:"LL 2nd Molar", 38:"LL 3rd Molar",
  41:"LR Central", 42:"LR Lateral", 43:"LR Canine", 44:"LR 1st Premolar", 45:"LR 2nd Premolar", 46:"LR 1st Molar", 47:"LR 2nd Molar", 48:"LR 3rd Molar",
};

const LANDMARK_COLORS: Record<string, string> = {
  incisal_edge: "#f59e0b",
  cusp: "#10b981",
  contact_point: "#3b82f6",
  gingival_margin: "#ef4444",
  center: "#a855f7",
};

const LANDMARK_COLORS_HEX: Record<string, number> = {
  incisal_edge: 0xf59e0b,
  cusp: 0x10b981,
  contact_point: 0x3b82f6,
  gingival_margin: 0xef4444,
  center: 0xa855f7,
};

export default function SegmentationViewer() {
  const [, params] = useRoute("/segmentation/:scanId");
  const scanId = params?.scanId ? parseInt(params.scanId, 10) : 0;
  
  const mountRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  
  // App state
  const [status, setStatus] = useState<"idle" | "running" | "completed" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [segments, setSegments] = useState<ToothSegment[]>([]);
  const [landmarks, setLandmarks] = useState<ToothLandmarks[]>([]);
  const [measurements, setMeasurements] = useState<MeasurementSet | null>(null);
  
  // Selection
  const [selectedToothFdi, setSelectedToothFdi] = useState<number | null>(null);
  const [showLandmarks, setShowLandmarks] = useState(true);
  const [has3DData, setHas3DData] = useState(true);

  // Three.js refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  
  // Scene objects
  const originalMeshRef = useRef<THREE.Mesh | null>(null);
  const toothMeshesRef = useRef<THREE.Mesh[]>([]);
  const landmarkMarkersRef = useRef<THREE.Mesh[]>([]);
  
  // Data hooks
  const { data: scanData } = useGetScan(scanId, {
    query: { enabled: !!scanId, queryKey: getGetScanQueryKey(scanId) }
  });

  const { data: analysisData } = useGetScanAnalysis(scanId, {
    query: { enabled: !!scanId, queryKey: getGetScanAnalysisQueryKey(scanId) }
  });

  const saveAnalysis = useSaveScanAnalysis();

  // Setup Three.js scene
  useEffect(() => {
    if (!mountRef.current) return;
    
    let animationFrameId: number;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0a0a0f");
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 1000);
    camera.position.set(0, 0, 150);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.innerHTML = "";
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(1, 1, 1);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight2.position.set(-1, -1, -1);
    scene.add(dirLight2);
    
    const spotLight = new THREE.SpotLight(0xffffff, 1);
    spotLight.position.set(0, 50, 0);
    spotLight.angle = Math.PI / 4;
    scene.add(spotLight);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    const handleResize = () => {
      if (!mountRef.current || !camera || !renderer) return;
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    window.addEventListener("resize", handleResize);

    // Raycaster for hover/click
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    
    let hoveredMesh: THREE.Mesh | null = null;

    const onPointerMove = (e: MouseEvent) => {
      if (!mountRef.current) return;
      const rect = mountRef.current.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(toothMeshesRef.current);
      
      if (intersects.length > 0) {
        const mesh = intersects[0].object as THREE.Mesh;
        if (hoveredMesh !== mesh) {
          if (hoveredMesh && hoveredMesh.userData.fdiNumber !== selectedToothFdi) {
            (hoveredMesh.material as THREE.MeshPhongMaterial).emissive.setHex(0x000000);
          }
          hoveredMesh = mesh;
          if (hoveredMesh.userData.fdiNumber !== selectedToothFdi) {
            (hoveredMesh.material as THREE.MeshPhongMaterial).emissive.setHex(0x333333);
          }
        }
        mountRef.current.style.cursor = "pointer";
      } else {
        if (hoveredMesh && hoveredMesh.userData.fdiNumber !== selectedToothFdi) {
          (hoveredMesh.material as THREE.MeshPhongMaterial).emissive.setHex(0x000000);
        }
        hoveredMesh = null;
        mountRef.current.style.cursor = "default";
      }
    };

    const onClick = (e: MouseEvent) => {
      if (!mountRef.current) return;
      const rect = mountRef.current.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(toothMeshesRef.current);
      
      if (intersects.length > 0) {
        const mesh = intersects[0].object as THREE.Mesh;
        setSelectedToothFdi(mesh.userData.fdiNumber);
      } else {
        setSelectedToothFdi(null);
      }
    };

    mountRef.current.addEventListener("pointermove", onPointerMove);
    mountRef.current.addEventListener("click", onClick);

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
      
      // Update selections visually
      toothMeshesRef.current.forEach(mesh => {
        const mat = mesh.material as THREE.MeshPhongMaterial;
        if (mesh.userData.fdiNumber === selectedToothFdi) {
          mat.emissive.setHex(0x444444);
          mat.opacity = 1.0;
        } else {
          if (hoveredMesh !== mesh) {
            mat.emissive.setHex(0x000000);
          }
          mat.opacity = 0.92;
        }
      });
    };
    animate();

    return () => {
      window.removeEventListener("resize", handleResize);
      if (mountRef.current) {
        mountRef.current.removeEventListener("pointermove", onPointerMove);
        mountRef.current.removeEventListener("click", onClick);
      }
      cancelAnimationFrame(animationFrameId);
      renderer.dispose();
    };
  }, [selectedToothFdi]);

  // Handle restoring data on mount
  useEffect(() => {
    if (analysisData && analysisData.status === "completed" && status === "idle") {
      setStatus("completed");
      setSegments(analysisData.segmentationData as unknown as ToothSegment[]);
      setLandmarks(analysisData.landmarksData?.teeth as unknown as ToothLandmarks[] || []);
      setMeasurements(analysisData.measurementsData as unknown as MeasurementSet);
      setHas3DData(false); // Can't render without geom
    }
  }, [analysisData, status]);

  // Load original geometry for analysis
  const loadOriginalGeometry = async (): Promise<THREE.BufferGeometry> => {
    const response = await fetch(`/api/scans/${scanId}/file`);
    if (!response.ok) throw new Error("Failed to download scan file");
    
    const arrayBuffer = await response.arrayBuffer();
    let geometry: THREE.BufferGeometry | null = null;
    
    if (scanData?.fileType === "stl") {
      const loader = new STLLoader();
      geometry = loader.parse(arrayBuffer);
    } else if (scanData?.fileType === "obj") {
      const loader = new OBJLoader();
      const textDecoder = new TextDecoder("utf-8");
      const text = textDecoder.decode(arrayBuffer);
      const group = loader.parse(text);
      group.traverse((child) => {
        if (child instanceof THREE.Mesh && !geometry) {
          geometry = child.geometry;
        }
      });
    } else if (scanData?.fileType === "ply") {
      const loader = new PLYLoader();
      geometry = loader.parse(arrayBuffer);
    }

    if (!geometry) throw new Error("Could not parse geometry");
    geometry.computeVertexNormals();
    geometry.center();
    return geometry;
  };

  const handleRunAnalysis = async () => {
    if (!scanData) return;
    try {
      setStatus("running");
      setProgress(5);
      setError(null);

      // Clean up old scene
      if (sceneRef.current) {
        if (originalMeshRef.current) sceneRef.current.remove(originalMeshRef.current);
        toothMeshesRef.current.forEach(m => sceneRef.current?.remove(m));
        landmarkMarkersRef.current.forEach(m => sceneRef.current?.remove(m));
        toothMeshesRef.current = [];
        landmarkMarkersRef.current = [];
      }

      // Fetch and show original in wireframe
      const geometry = await loadOriginalGeometry();
      
      const origMat = new THREE.MeshPhongMaterial({
        color: 0x8ecfff,
        wireframe: true,
        transparent: true,
        opacity: 0.3
      });
      const origMesh = new THREE.Mesh(geometry, origMat);
      originalMeshRef.current = origMesh;
      if (sceneRef.current) sceneRef.current.add(origMesh);

      // Fit camera
      geometry.computeBoundingSphere();
      const radius = geometry.boundingSphere?.radius || 50;
      if (cameraRef.current) cameraRef.current.position.z = radius * 2.5;

      const segs = await runSegmentation(geometry, scanData.jawType as any, setProgress);
      const lms = detectLandmarks(segs);
      const meas = calculateMeasurements(segs, lms);

      setSegments(segs);
      setLandmarks(lms);
      setMeasurements(meas);
      setHas3DData(true);

      // Hide original
      if (sceneRef.current && originalMeshRef.current) {
        sceneRef.current.remove(originalMeshRef.current);
      }

      // Build meshes
      const tMeshes = segs.map(seg => {
        const mat = new THREE.MeshPhongMaterial({
          color: new THREE.Color(seg.color),
          specular: 0x222222,
          shininess: 40,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.92,
        });
        const mesh = new THREE.Mesh(seg.geometry!, mat);
        mesh.userData.fdiNumber = seg.fdiNumber;
        mesh.userData.color = seg.color;
        if (sceneRef.current) sceneRef.current.add(mesh);
        return mesh;
      });
      toothMeshesRef.current = tMeshes;

      // Build landmarks
      const sphereGeo = new THREE.SphereGeometry(0.5, 8, 8);
      const markers: THREE.Mesh[] = [];
      for (const tl of lms) {
        for (const lm of tl.landmarks) {
          const mat = new THREE.MeshBasicMaterial({ color: LANDMARK_COLORS_HEX[lm.type] ?? 0xffffff });
          const mesh = new THREE.Mesh(sphereGeo, mat);
          mesh.position.set(lm.x, lm.y, lm.z);
          mesh.userData.landmark = lm;
          markers.push(mesh);
          if (sceneRef.current) sceneRef.current.add(mesh);
        }
      }
      landmarkMarkersRef.current = markers;

      setStatus("completed");
      setProgress(100);

      // Auto save
      saveAnalysis.mutate({
        scanId,
        data: {
          status: "completed",
          segmentationData: serializeSegments(segs) as any,
          landmarksData: serializeLandmarks(lms) as any,
          measurementsData: serializeMeasurements(meas) as any
        }
      });

    } catch (err: any) {
      console.error(err);
      setError(err.message);
      setStatus("error");
    }
  };

  const handleSave = () => {
    saveAnalysis.mutate({
      scanId,
      data: {
        status: "completed",
        segmentationData: serializeSegments(segments) as any,
        landmarksData: serializeLandmarks(landmarks) as any,
        measurementsData: serializeMeasurements(measurements!) as any
      }
    }, {
      onSuccess: () => toast({ title: "Analysis saved successfully" }),
      onError: () => toast({ variant: "destructive", title: "Failed to save" })
    });
  };

  const handleGenerateReport = () => {
    if (!scanData || !measurements) return;
    const html = generateReportHTML({
      scanFileName: scanData.originalName || scanData.fileName,
      caseCode: `CASE-${scanData.caseId}`,
      jawType: scanData.jawType,
      segments,
      allLandmarks: landmarks,
      measurements,
      generatedAt: new Date().toISOString()
    });
    
    const newWin = window.open("", "_blank");
    if (newWin) {
      newWin.document.write(html);
      newWin.document.close();
      toast({ title: "Report opened in new tab" });
    }
  };

  // Toggle Landmark visibility
  useEffect(() => {
    landmarkMarkersRef.current.forEach(m => {
      m.visible = showLandmarks;
    });
  }, [showLandmarks]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  };

  const handleResetView = () => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(0, 0, 150);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#0a0a0f] text-zinc-100 overflow-hidden">
      <header className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-zinc-800 bg-zinc-950 z-10">
        <div className="flex items-center gap-4">
          <Link href={scanData?.caseId ? `/cases/${scanData.caseId}` : "/cases"}>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-cyan-500" />
            <span className="font-medium text-sm">AI Segmentation</span>
            {scanData && (
              <>
                <span className="text-zinc-600">/</span>
                <span className="text-sm text-zinc-400">{scanData.originalName || scanData.fileName}</span>
              </>
            )}
            <Badge variant="outline" className={`ml-2 text-[10px] uppercase border-zinc-700 ${status === 'completed' ? 'text-green-400 border-green-500/30 bg-green-500/10' : 'text-zinc-400'}`}>
              {status}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {status === "idle" || status === "error" ? (
            <Button size="sm" onClick={handleRunAnalysis} className="h-8 bg-cyan-600 hover:bg-cyan-700 text-white gap-2">
              <Brain className="h-4 w-4" /> Run Analysis
            </Button>
          ) : (
            <Button size="sm" onClick={handleRunAnalysis} variant="outline" className="h-8 border-zinc-700 hover:bg-zinc-800 gap-2">
              <RotateCcw className="h-3.5 w-3.5" /> Re-run
            </Button>
          )}
          
          <Button size="sm" variant="ghost" onClick={handleSave} disabled={status !== "completed" || saveAnalysis.isPending} className="h-8 text-zinc-400 hover:text-white hover:bg-zinc-800 gap-2">
            {saveAnalysis.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
          </Button>
          
          <Button size="sm" variant="ghost" onClick={handleGenerateReport} disabled={status !== "completed"} className="h-8 text-zinc-400 hover:text-white hover:bg-zinc-800 gap-2">
            <FileText className="h-4 w-4" /> Report
          </Button>
          
          <Separator orientation="vertical" className="h-6 mx-1 bg-zinc-800" />
          
          <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800" onClick={handleResetView} title="Reset View">
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800" onClick={toggleFullscreen} title="Fullscreen">
            <Maximize className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel */}
        <div className="w-[260px] shrink-0 border-r border-zinc-800 bg-zinc-950/50 flex flex-col">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Detected Teeth</h2>
            {segments.length > 0 && (
              <Badge variant="secondary" className="bg-zinc-800 hover:bg-zinc-800 text-cyan-400">{segments.length}</Badge>
            )}
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {segments.length === 0 && status !== "running" && (
                <div className="p-4 text-center text-xs text-zinc-500">No teeth detected. Run analysis to start.</div>
              )}
              {segments.map((seg) => (
                <button
                  key={seg.fdiNumber}
                  onClick={() => setSelectedToothFdi(seg.fdiNumber)}
                  className={`w-full flex items-center justify-between p-2 rounded text-left transition-colors border ${
                    selectedToothFdi === seg.fdiNumber 
                      ? "bg-cyan-950/30 border-cyan-500/50" 
                      : "border-transparent hover:bg-zinc-800/50"
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                    <div className="truncate">
                      <div className="font-bold text-sm text-zinc-200">{seg.fdiNumber}</div>
                      <div className="text-xs text-zinc-500 truncate">{FDI_NAMES[seg.fdiNumber] || "Tooth"}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-zinc-600">
                    <span className="text-[10px]">{seg.vertexCount}v</span>
                    {seg.isVisible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
          
          <div className="p-4 border-t border-zinc-800 bg-zinc-950">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Manual Correction</h3>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" className="h-8 text-xs border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-400 gap-1.5" onClick={() => toast({ description: "Select two teeth first" })}>
                <Merge className="h-3 w-3" /> Merge
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-400 gap-1.5" onClick={() => toast({ description: "Select a tooth to split" })}>
                <Split className="h-3 w-3" /> Split
              </Button>
              <Button variant="outline" size="sm" className="col-span-2 h-8 text-xs border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-400 gap-1.5" onClick={() => toast({ description: "Select a tooth to rename" })}>
                <Tag className="h-3 w-3" /> Rename FDI
              </Button>
            </div>
          </div>
        </div>

        {/* Center Canvas */}
        <div className="flex-1 relative bg-black">
          {/* Top Status */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 w-full max-w-md pointer-events-none">
            {status === "running" && (
              <div className="bg-zinc-950/90 border border-zinc-800 backdrop-blur rounded-lg p-3 shadow-2xl flex flex-col gap-2">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-cyan-400 flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Running AI Analysis...</span>
                  <span className="text-zinc-400">{progress}%</span>
                </div>
                <Progress value={progress} className="h-1 bg-zinc-800" />
              </div>
            )}
            {status === "error" && (
              <div className="bg-red-950/90 border border-red-900/50 text-red-400 backdrop-blur rounded-lg p-3 shadow-2xl text-sm text-center">
                Error: {error}
              </div>
            )}
            {status === "completed" && segments.length > 0 && (
              <div className="bg-zinc-950/80 border border-zinc-800/50 backdrop-blur rounded-full px-4 py-1.5 shadow-xl text-xs text-zinc-400 text-center mx-auto w-fit">
                Completed — <strong className="text-cyan-400">{segments.length}</strong> teeth detected
              </div>
            )}
          </div>
          
          {status === "completed" && !has3DData && (
             <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10 backdrop-blur-[2px]">
               <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 max-w-sm text-center">
                 <Box className="h-10 w-10 text-zinc-500 mx-auto mb-3" />
                 <h3 className="font-medium mb-2">3D Meshes Not Loaded</h3>
                 <p className="text-sm text-zinc-400 mb-4">The analysis data was loaded from the database, but 3D geometry needs to be re-processed to view.</p>
                 <Button onClick={handleRunAnalysis} className="w-full bg-cyan-600 hover:bg-cyan-700">Re-run Analysis</Button>
               </div>
             </div>
          )}

          <div ref={mountRef} className="w-full h-full outline-none" />
        </div>

        {/* Right Panel */}
        <div className="w-[280px] shrink-0 border-l border-zinc-800 bg-zinc-950/50 flex flex-col">
          <Tabs defaultValue="measurements" className="flex-1 flex flex-col">
            <TabsList className="w-full h-12 bg-transparent border-b border-zinc-800 p-0 rounded-none shrink-0">
              <TabsTrigger value="measurements" className="flex-1 h-full rounded-none data-[state=active]:bg-zinc-900/50 data-[state=active]:text-cyan-400 data-[state=active]:border-b-2 data-[state=active]:border-cyan-500">Measurements</TabsTrigger>
              <TabsTrigger value="landmarks" className="flex-1 h-full rounded-none data-[state=active]:bg-zinc-900/50 data-[state=active]:text-cyan-400 data-[state=active]:border-b-2 data-[state=active]:border-cyan-500">Landmarks</TabsTrigger>
            </TabsList>
            
            <ScrollArea className="flex-1">
              <TabsContent value="measurements" className="m-0 p-4 space-y-6">
                {measurements ? (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-zinc-900 border border-zinc-800 rounded p-2 text-center">
                        <div className="text-xs text-zinc-500 mb-1">Total</div>
                        <div className="font-mono text-cyan-400">{measurements.summary.totalTeeth}</div>
                      </div>
                      <div className="bg-zinc-900 border border-zinc-800 rounded p-2 text-center">
                        <div className="text-xs text-zinc-500 mb-1">Upper</div>
                        <div className="font-mono text-zinc-300">{measurements.summary.upperTeeth}</div>
                      </div>
                      <div className="bg-zinc-900 border border-zinc-800 rounded p-2 text-center">
                        <div className="text-xs text-zinc-500 mb-1">Lower</div>
                        <div className="font-mono text-zinc-300">{measurements.summary.lowerTeeth}</div>
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3 flex items-center gap-2"><Ruler className="h-3 w-3" /> Arch Stats</h3>
                      <div className="space-y-2 text-sm">
                        {measurements.archMeasurements.map(m => (
                          <div key={m.type} className="flex justify-between items-center py-1.5 border-b border-zinc-800/50">
                            <span className="text-zinc-400 text-xs">{m.label}</span>
                            <span className="font-mono text-zinc-200">{m.value} {m.unit}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3 flex items-center gap-2"><Box className="h-3 w-3" /> Widths</h3>
                      <div className="space-y-1">
                        {measurements.toothWidths.map(m => (
                          <div key={m.label} 
                               onMouseEnter={() => m.toothFdi && setSelectedToothFdi(m.toothFdi)}
                               className={`flex justify-between items-center p-1.5 rounded cursor-pointer ${selectedToothFdi === m.toothFdi ? 'bg-zinc-800' : 'hover:bg-zinc-900/50'}`}>
                            <span className="text-zinc-400 text-xs w-8">{m.toothFdi}</span>
                            <div className="flex-1 h-1.5 bg-zinc-900 mx-2 rounded-full overflow-hidden">
                              <div className="h-full bg-cyan-500/50" style={{ width: `${Math.min(100, (m.value / 15) * 100)}%` }} />
                            </div>
                            <span className="font-mono text-zinc-300 text-xs w-12 text-right">{m.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center text-sm text-zinc-500 mt-10">Run analysis to see measurements</div>
                )}
              </TabsContent>
              
              <TabsContent value="landmarks" className="m-0 p-4 space-y-4">
                <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 p-2 rounded">
                  <span className="text-xs text-zinc-400">Show 3D Markers</span>
                  <Button variant={showLandmarks ? "default" : "outline"} size="sm" className="h-6 text-[10px] px-2" onClick={() => setShowLandmarks(!showLandmarks)}>
                    {showLandmarks ? "Hide" : "Show"}
                  </Button>
                </div>
                
                {landmarks.length > 0 ? (
                  <div className="space-y-4">
                    {landmarks.map(tl => (
                      <div key={tl.fdiNumber} className={`border border-zinc-800 rounded overflow-hidden ${selectedToothFdi === tl.fdiNumber ? 'border-cyan-500/30 ring-1 ring-cyan-500/10' : ''}`}>
                        <div className="bg-zinc-900/50 px-3 py-1.5 border-b border-zinc-800 flex justify-between items-center cursor-pointer" onClick={() => setSelectedToothFdi(tl.fdiNumber)}>
                          <span className="font-bold text-sm text-zinc-300">Tooth {tl.fdiNumber}</span>
                          <Badge variant="secondary" className="text-[10px] h-4 px-1">{tl.landmarks.length} pts</Badge>
                        </div>
                        <div className="p-2 space-y-2">
                          {tl.landmarks.map(lm => (
                            <div key={lm.id} className="flex flex-col gap-1 text-[10px]">
                              <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: LANDMARK_COLORS[lm.type] }} />
                                <span className="text-zinc-400 capitalize">{lm.type.replace('_', ' ')}</span>
                              </div>
                              <div className="font-mono text-zinc-600 pl-3.5">
                                {lm.x.toFixed(1)}, {lm.y.toFixed(1)}, {lm.z.toFixed(1)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-sm text-zinc-500 mt-10">Run analysis to detect landmarks</div>
                )}
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
