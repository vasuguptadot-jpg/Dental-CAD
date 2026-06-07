import { useEffect, useRef, useState, useCallback } from "react";
import { useRoute, Link, useLocation } from "wouter";
import * as THREE from "three";
import { OrbitControls } from "three-stdlib";
import { STLLoader, OBJLoader, PLYLoader } from "three-stdlib";
import { useGetScan, useGetScanAnalysis } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Brain, Loader2, RotateCcw, Save, Download,
  Undo2, Redo2, AlertTriangle, CheckCircle, XCircle,
  Move, RotateCw, ZapOff, ShieldAlert, ChevronRight,
  Layers, History, Settings2, Eye, Cpu, Sparkles
} from "lucide-react";

import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { ToothChart } from "@/components/tooth-chart";
import { runSegmentation, type ToothSegment } from "@/lib/segmentation-engine";
import { calculateMeasurements } from "@/lib/measurement-engine";
import {
  makeDefaultTransform, getConstraints, checkMovementWarnings,
  applyTransformToGroup, computeMatrix, describeMovement,
  MovementHistory, serializeTreatmentPlan,
  type ToothTransform, type MovementWarning, type ToothMovementRecord, type HistoryEntry,
} from "@/lib/tooth-movement-engine";
import { saveTreatmentPlanToStorage } from "@/lib/aligner-staging-engine";
import {
  runCollisionCheck, buildCollisionIndicators, buildSafeZoneIndicators,
  buildMovementArrows, computeBoundingSpheres,
  type CollisionReport, type CollisionSeverity,
} from "@/lib/collision-engine";

const FDI_NAMES: Record<number, string> = {
  11:"UR Central",12:"UR Lateral",13:"UR Canine",14:"UR 1st PM",15:"UR 2nd PM",16:"UR 1st Molar",17:"UR 2nd Molar",18:"UR 3rd Molar",
  21:"UL Central",22:"UL Lateral",23:"UL Canine",24:"UL 1st PM",25:"UL 2nd PM",26:"UL 1st Molar",27:"UL 2nd Molar",28:"UL 3rd Molar",
  31:"LL Central",32:"LL Lateral",33:"LL Canine",34:"LL 1st PM",35:"LL 2nd PM",36:"LL 1st Molar",37:"LL 2nd Molar",38:"LL 3rd Molar",
  41:"LR Central",42:"LR Lateral",43:"LR Canine",44:"LR 1st PM",45:"LR 2nd PM",46:"LR 1st Molar",47:"LR 2nd Molar",48:"LR 3rd Molar",
};

const SEVERITY_COLOR: Record<CollisionSeverity, string> = {
  collision: "#ef4444", risk: "#f59e0b", safe: "#22c55e"
};

interface TransformSlider {
  field: keyof ToothTransform;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  group: "translation" | "rotation" | "orthodontic";
}

function makeSliders(constraints: ReturnType<typeof getConstraints>): TransformSlider[] {
  const t = constraints.maxTranslationMm;
  const r = constraints.maxRotationDeg;
  return [
    { field: "tx", label: "Translate X", unit: "mm", min: -t, max: t, step: 0.1, group: "translation" },
    { field: "ty", label: "Translate Y", unit: "mm", min: -t, max: t, step: 0.1, group: "translation" },
    { field: "tz", label: "Translate Z", unit: "mm", min: -t, max: t, step: 0.1, group: "translation" },
    { field: "rx", label: "Rotation X", unit: "°", min: -r, max: r, step: 0.5, group: "rotation" },
    { field: "ry", label: "Rotation Y", unit: "°", min: -r, max: r, step: 0.5, group: "rotation" },
    { field: "rz", label: "Rotation Z", unit: "°", min: -r, max: r, step: 0.5, group: "rotation" },
    { field: "torque", label: "Torque", unit: "°", min: -constraints.maxTorqueDeg, max: constraints.maxTorqueDeg, step: 0.5, group: "orthodontic" },
    { field: "tip", label: "Tip", unit: "°", min: -constraints.maxTipDeg, max: constraints.maxTipDeg, step: 0.5, group: "orthodontic" },
    { field: "angulation", label: "Angulation", unit: "°", min: -constraints.maxAngulationDeg, max: constraints.maxAngulationDeg, step: 0.5, group: "orthodontic" },
  ];
}

export default function TreatmentPlanner() {
  const [, params] = useRoute("/treatment-planner/:scanId");
  const [, navigate] = useLocation();
  const scanId = params?.scanId ? parseInt(params.scanId, 10) : 0;
  const { toast } = useToast();

  // Three.js refs
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const toothGroupsRef = useRef<Map<number, THREE.Group>>(new Map());
  const initialPosRef = useRef<Map<number, THREE.Vector3>>(new Map());
  const initialRotRef = useRef<Map<number, THREE.Euler>>(new Map());
  const collisionGroupRef = useRef<THREE.Group | null>(null);
  const safeZoneGroupRef = useRef<THREE.Group | null>(null);
  const arrowGroupRef = useRef<THREE.Group | null>(null);
  const spheresRef = useRef<ReturnType<typeof computeBoundingSpheres>>(new Map());

  // App state
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [segments, setSegments] = useState<ToothSegment[]>([]);
  const [selectedFdi, setSelectedFdi] = useState<number | null>(null);
  const [transforms, setTransforms] = useState<Map<number, ToothTransform>>(new Map());
  const [records, setRecords] = useState<ToothMovementRecord[]>([]);
  const [collisionReport, setCollisionReport] = useState<CollisionReport | null>(null);
  const [warnings, setWarnings] = useState<MovementWarning[]>([]);
  const [showIndicators, setShowIndicators] = useState(true);
  const [activePanel, setActivePanel] = useState<"controls" | "history" | "safety">("controls");
  const [aiSafetyLoading, setAiSafetyLoading] = useState(false);
  const [aiSafetyText, setAiSafetyText] = useState("");
  const historyRef = useRef(new MovementHistory());
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [showToothChart, setShowToothChart] = useState(false);

  const { data: scanData } = useGetScan(scanId, { query: { enabled: !!scanId } });
  const { data: analysisData } = useGetScanAnalysis(scanId, { query: { enabled: !!scanId } });

  // Setup Three.js
  useEffect(() => {
    if (!mountRef.current) return;
    let animId: number;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#080c14");
    sceneRef.current = scene;

    const cam = new THREE.PerspectiveCamera(45, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 2000);
    cam.position.set(0, 20, 150);
    cameraRef.current = cam;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    mountRef.current.innerHTML = "";
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const d1 = new THREE.DirectionalLight(0xffffff, 1.2); d1.position.set(1, 3, 2); scene.add(d1);
    const d2 = new THREE.DirectionalLight(0x8ecfff, 0.4); d2.position.set(-2, -1, -1); scene.add(d2);
    const h = new THREE.HemisphereLight(0x1a2a4a, 0x080c14, 0.4); scene.add(h);

    // Grid
    const grid = new THREE.GridHelper(200, 40, 0x1a2a4a, 0x0d1625);
    grid.position.y = -30;
    scene.add(grid);

    const controls = new OrbitControls(cam, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controlsRef.current = controls;

    const handleResize = () => {
      if (!mountRef.current) return;
      cam.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      cam.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    window.addEventListener("resize", handleResize);

    // Click to select tooth
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const onClick = (e: MouseEvent) => {
      if (!mountRef.current) return;
      const rect = mountRef.current.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, cam);
      const meshes: THREE.Mesh[] = [];
      toothGroupsRef.current.forEach(g => g.traverse(c => { if (c instanceof THREE.Mesh) meshes.push(c); }));
      const hits = raycaster.intersectObjects(meshes);
      if (hits.length > 0) {
        let obj: THREE.Object3D | null = hits[0].object;
        while (obj && !obj.userData.fdiNumber) obj = obj.parent;
        if (obj?.userData.fdiNumber) setSelectedFdi(obj.userData.fdiNumber as number);
      } else {
        setSelectedFdi(null);
      }
    };
    mountRef.current.addEventListener("click", onClick);

    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, cam);
    };
    animate();

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animId);
      renderer.dispose();
    };
  }, []);

  // Highlight selected tooth
  useEffect(() => {
    toothGroupsRef.current.forEach((group, fdi) => {
      group.traverse(child => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.MeshPhongMaterial;
          if (fdi === selectedFdi) {
            mat.emissive.setHex(0x334466);
            mat.opacity = 1.0;
          } else {
            mat.emissive.setHex(0x000000);
            mat.opacity = 0.85;
          }
        }
      });
    });
  }, [selectedFdi]);

  // Toggle visual indicators
  useEffect(() => {
    if (collisionGroupRef.current) collisionGroupRef.current.visible = showIndicators;
    if (safeZoneGroupRef.current) safeZoneGroupRef.current.visible = showIndicators;
  }, [showIndicators]);

  // Load geometry and build scene
  const loadAndBuild = useCallback(async () => {
    if (!scanData) return;
    const scene = sceneRef.current!;

    // Clear previous
    toothGroupsRef.current.forEach(g => scene.remove(g));
    toothGroupsRef.current.clear();
    initialPosRef.current.clear();
    initialRotRef.current.clear();
    [collisionGroupRef, safeZoneGroupRef, arrowGroupRef].forEach(r => {
      if (r.current) { scene.remove(r.current); r.current = null; }
    });

    setStatus("loading");
    setProgress(5);

    try {
      // Load file
      const response = await fetch(`/api/scans/${scanId}/file`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load scan");
      const buf = await response.arrayBuffer();

      let geo: THREE.BufferGeometry | null = null;
      if (scanData.fileType === "stl") {
        geo = new STLLoader().parse(buf);
      } else if (scanData.fileType === "obj") {
        const text = new TextDecoder().decode(buf);
        new OBJLoader().parse(text).traverse(c => { if (c instanceof THREE.Mesh && !geo) geo = c.geometry; });
      } else if (scanData.fileType === "ply") {
        geo = new PLYLoader().parse(buf);
      }
      if (!geo) throw new Error("Cannot parse geometry");
      (geo as THREE.BufferGeometry).computeVertexNormals();
      (geo as THREE.BufferGeometry).center();

      setProgress(20);

      // Try to use existing segmentation data
      let segs: ToothSegment[] = [];
      if (analysisData?.status === "completed" && analysisData.segmentationData) {
        segs = analysisData.segmentationData as unknown as ToothSegment[];
        // Rebuild geometries since they don't serialize
        segs = await runSegmentation(geo as THREE.BufferGeometry, (scanData.jawType as "upper" | "lower" | "both") ?? "both", p => setProgress(20 + p * 0.6));
      } else {
        segs = await runSegmentation(geo as THREE.BufferGeometry, (scanData.jawType as "upper" | "lower" | "both") ?? "both", p => setProgress(20 + p * 0.6));
      }

      setSegments(segs);
      setProgress(85);

      // Fit camera
      geo.computeBoundingSphere();
      const sphere = (geo as THREE.BufferGeometry).boundingSphere!;
      cameraRef.current!.position.set(sphere.center.x, sphere.center.y + 10, sphere.center.z + sphere.radius * 2.8);
      controlsRef.current?.target.copy(sphere.center);

      // Build tooth groups
      const newTransforms = new Map<number, ToothTransform>();
      const newRecords: ToothMovementRecord[] = [];

      for (const seg of segs) {
        if (!seg.geometry) continue;

        const group = new THREE.Group();
        group.name = `tooth_${seg.fdiNumber}`;
        group.userData.fdiNumber = seg.fdiNumber;

        const mat = new THREE.MeshPhongMaterial({
          color: new THREE.Color(seg.color),
          specular: 0x224466,
          shininess: 60,
          transparent: true,
          opacity: 0.88,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(seg.geometry, mat);
        mesh.userData.fdiNumber = seg.fdiNumber;
        group.add(mesh);
        scene.add(group);

        toothGroupsRef.current.set(seg.fdiNumber, group);
        initialPosRef.current.set(seg.fdiNumber, group.position.clone());
        initialRotRef.current.set(seg.fdiNumber, group.rotation.clone());

        const transform = makeDefaultTransform(seg.fdiNumber);
        newTransforms.set(seg.fdiNumber, transform);

        newRecords.push({
          fdiNumber: seg.fdiNumber,
          toothLabel: FDI_NAMES[seg.fdiNumber] ?? `Tooth ${seg.fdiNumber}`,
          initialPosition: group.position.clone(),
          initialRotation: group.rotation.clone(),
          currentTransform: transform,
          matrix: computeMatrix(transform, group.position, group.rotation),
        });
      }

      setTransforms(newTransforms);
      setRecords(newRecords);
      historyRef.current.clear();
      setHistoryEntries([]);
      setCanUndo(false);
      setCanRedo(false);

      // Run initial collision check
      const initialSpheres = computeBoundingSpheres(segs, toothGroupsRef.current);
      spheresRef.current = initialSpheres;
      const report = runCollisionCheck(segs, toothGroupsRef.current, new Map(segs.map(s => [s.fdiNumber, { tx: 0, ty: 0, tz: 0 }])));
      setCollisionReport(report);
      updateVisualIndicators(report, initialSpheres, scene);

      setProgress(100);
      setStatus("ready");
      toast({ title: "Treatment Planner ready", description: `${segs.length} teeth loaded. Click any tooth to select.` });

    } catch (err) {
      setStatus("error");
      toast({ title: "Load failed", description: (err as Error).message, variant: "destructive" });
    }
  }, [scanData, analysisData, scanId, toast]);

  const updateVisualIndicators = (
    report: CollisionReport,
    spheres: ReturnType<typeof computeBoundingSpheres>,
    scene: THREE.Scene
  ) => {
    if (collisionGroupRef.current) scene.remove(collisionGroupRef.current);
    if (safeZoneGroupRef.current) scene.remove(safeZoneGroupRef.current);

    const collGroup = buildCollisionIndicators(report, spheres);
    const safeGroup = buildSafeZoneIndicators(report, spheres);

    scene.add(collGroup);
    scene.add(safeGroup);
    collisionGroupRef.current = collGroup;
    safeZoneGroupRef.current = safeGroup;
  };

  // Apply transform to tooth
  const applyTransform = useCallback((fdi: number, newTransform: ToothTransform, saveHistory = true) => {
    const group = toothGroupsRef.current.get(fdi);
    const initPos = initialPosRef.current.get(fdi);
    const initRot = initialRotRef.current.get(fdi);
    if (!group || !initPos || !initRot) return;

    const prevTransform = transforms.get(fdi) ?? makeDefaultTransform(fdi);

    applyTransformToGroup(group, newTransform, initPos, initRot);

    if (saveHistory && describeMovement(prevTransform, newTransform) !== "No change") {
      historyRef.current.push({
        fdiNumber: fdi,
        label: `Tooth ${fdi}: ${describeMovement(prevTransform, newTransform)}`,
        before: { ...prevTransform },
        after: { ...newTransform },
      });
      setHistoryEntries(historyRef.current.getHistory());
      setCanUndo(historyRef.current.canUndo());
      setCanRedo(historyRef.current.canRedo());
    }

    const newTransforms = new Map(transforms);
    newTransforms.set(fdi, newTransform);
    setTransforms(newTransforms);

    // Update matrix record
    const matrix = computeMatrix(newTransform, initPos, initRot);
    setRecords(prev => prev.map(r => r.fdiNumber === fdi ? { ...r, currentTransform: newTransform, matrix } : r));

    // Check warnings
    const constraints = getConstraints(fdi);
    setWarnings(checkMovementWarnings(newTransform, constraints));

    // Run collision detection
    const transformMap = new Map<number, { tx: number; ty: number; tz: number }>();
    newTransforms.forEach((t, f) => transformMap.set(f, { tx: t.tx, ty: t.ty, tz: t.tz }));

    // Update bounding spheres for moved tooth
    const updatedSpheres = computeBoundingSpheres(segments, toothGroupsRef.current);
    spheresRef.current = updatedSpheres;
    const report = runCollisionCheck(segments, toothGroupsRef.current, transformMap);
    setCollisionReport(report);

    if (sceneRef.current) {
      updateVisualIndicators(report, updatedSpheres, sceneRef.current);
      // Movement arrows
      if (arrowGroupRef.current) sceneRef.current.remove(arrowGroupRef.current);
      const worldPos = new THREE.Vector3();
      group.getWorldPosition(worldPos);
      const arrows = buildMovementArrows(newTransform, worldPos);
      sceneRef.current.add(arrows);
      arrowGroupRef.current = arrows;
    }
  }, [transforms, segments]);

  const handleSliderChange = useCallback((field: keyof ToothTransform, value: number) => {
    if (!selectedFdi) return;
    const current = transforms.get(selectedFdi) ?? makeDefaultTransform(selectedFdi);
    const updated = { ...current, [field]: value };
    applyTransform(selectedFdi, updated, false); // don't push to history on every slider tick
  }, [selectedFdi, transforms, applyTransform]);

  const handleSliderCommit = useCallback((field: keyof ToothTransform, value: number) => {
    if (!selectedFdi) return;
    const current = transforms.get(selectedFdi) ?? makeDefaultTransform(selectedFdi);
    const before = { ...current };
    const updated = { ...current, [field]: value };
    const group = toothGroupsRef.current.get(selectedFdi);
    const initPos = initialPosRef.current.get(selectedFdi);
    const initRot = initialRotRef.current.get(selectedFdi);
    if (group && initPos && initRot) {
      const prevStr = describeMovement(before, updated);
      if (prevStr !== "No change") {
        historyRef.current.push({ fdiNumber: selectedFdi, label: `Tooth ${selectedFdi}: ${prevStr}`, before, after: updated });
        setHistoryEntries(historyRef.current.getHistory());
        setCanUndo(historyRef.current.canUndo());
        setCanRedo(historyRef.current.canRedo());
      }
    }
  }, [selectedFdi, transforms]);

  const handleUndo = () => {
    const entry = historyRef.current.undo();
    if (!entry) return;
    applyTransform(entry.fdiNumber, { ...entry.before }, false);
    setCanUndo(historyRef.current.canUndo());
    setCanRedo(historyRef.current.canRedo());
    setHistoryEntries(historyRef.current.getHistory());
  };

  const handleRedo = () => {
    const entry = historyRef.current.redo();
    if (!entry) return;
    applyTransform(entry.fdiNumber, { ...entry.after }, false);
    setCanUndo(historyRef.current.canUndo());
    setCanRedo(historyRef.current.canRedo());
    setHistoryEntries(historyRef.current.getHistory());
  };

  const handleResetTooth = () => {
    if (!selectedFdi) return;
    const reset = makeDefaultTransform(selectedFdi);
    applyTransform(selectedFdi, reset, true);
    setWarnings([]);
  };

  const handleResetView = () => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(0, 20, 150);
      controlsRef.current.reset();
    }
  };

  const handleNextTooth = () => {
    if (segments.length === 0) return;
    const fdis = segments.map(s => s.fdiNumber);
    const idx = selectedFdi ? fdis.indexOf(selectedFdi) : -1;
    setSelectedFdi(fdis[(idx + 1) % fdis.length]);
  };

  const handlePrevTooth = () => {
    if (segments.length === 0) return;
    const fdis = segments.map(s => s.fdiNumber);
    const idx = selectedFdi ? fdis.indexOf(selectedFdi) : 0;
    setSelectedFdi(fdis[(idx - 1 + fdis.length) % fdis.length]);
  };

  useKeyboardShortcuts({
    enabled: status === "ready",
    onUndo: handleUndo,
    onRedo: handleRedo,
    onResetView: handleResetView,
    onNextTooth: handleNextTooth,
    onPrevTooth: handlePrevTooth,
  });

  const handleSavePlan = () => {
    const plan = serializeTreatmentPlan(records);
    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `treatment-plan-scan-${scanId}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Treatment plan saved", description: `${plan.movements.length} movements exported.` });
  };

  const [autoPlanning, setAutoPlanning] = useState(false);

  const handleAutoGeneratePlan = async () => {
    if (!analysisData || segments.length === 0) {
      toast({ title: "No analysis data", description: "Run ortho analysis first to enable AI plan generation.", variant: "destructive" });
      return;
    }
    setAutoPlanning(true);
    try {
      const toothSummary = segments.slice(0, 16).map(s => ({
        fdi: s.fdiNumber,
        label: FDI_NAMES[s.fdiNumber] ?? String(s.fdiNumber),
        x: s.centroidX.toFixed(1),
        y: s.centroidY.toFixed(1),
        z: s.centroidZ.toFixed(1),
      }));
      const res = await fetch("/api/ai-copilot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          scanId,
          messages: [{
            role: "user",
            content: `You are an orthodontic treatment planning expert. Based on the following tooth positions, suggest a realistic starting treatment plan for a clear aligner case. For each tooth that needs movement, specify: fdi number, and small movement values (tx/ty/tz in mm, rx/ry/rz in degrees). Keep movements conservative (max 2mm translation, max 5 degrees rotation). Return ONLY a JSON array like: [{"fdi":13,"tx":0.5,"ty":0,"tz":0,"rx":0,"ry":0,"rz":3}]. No explanations.\n\nTooth positions: ${JSON.stringify(toothSummary)}`
          }]
        }),
      });
      if (!res.ok) throw new Error("AI request failed");
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          chunk.split("\n").forEach(line => {
            if (line.startsWith("data: ") && !line.includes("[DONE]")) {
              try {
                const data = JSON.parse(line.slice(6));
                fullText += data.choices?.[0]?.delta?.content ?? "";
              } catch { /* skip */ }
            }
          });
        }
      }
      const jsonMatch = fullText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("Could not parse AI response");
      const suggestions: { fdi: number; tx: number; ty: number; tz: number; rx: number; ry: number; rz: number }[] = JSON.parse(jsonMatch[0]);
      let applied = 0;
      suggestions.forEach(s => {
        if (!transforms.has(s.fdi)) return;
        const current = transforms.get(s.fdi)!;
        setTransforms(prev => new Map(prev).set(s.fdi, {
          ...current,
          tx: Math.max(-6, Math.min(6, s.tx || 0)),
          ty: Math.max(-5, Math.min(5, s.ty || 0)),
          tz: Math.max(-5, Math.min(5, s.tz || 0)),
          rx: Math.max(-10, Math.min(10, s.rx || 0)),
          ry: Math.max(-10, Math.min(10, s.ry || 0)),
          rz: Math.max(-45, Math.min(45, s.rz || 0)),
        }));
        applied++;
      });
      toast({ title: `AI plan applied`, description: `${applied} teeth have suggested movements. Review and refine as needed.` });
    } catch (err) {
      toast({ title: "AI plan failed", description: String(err), variant: "destructive" });
    }
    setAutoPlanning(false);
  };

  const handleSendToStaging = () => {
    const movedTransforms = Array.from(transforms.values()).filter(t =>
      Object.entries(t).some(([k, v]) => k !== "fdiNumber" && Math.abs(v as number) > 0.05)
    );
    if (movedTransforms.length === 0) {
      toast({ title: "No movements to stage", description: "Move at least one tooth before sending to staging.", variant: "destructive" });
      return;
    }
    saveTreatmentPlanToStorage(scanId, Array.from(transforms.values()));
    toast({ title: "Plan sent to Aligner Staging", description: `${movedTransforms.length} tooth movements saved.` });
    navigate(`/aligner-staging/${scanId}`);
  };

  const fetchAiSafety = async () => {
    if (!collisionReport || collisionReport.collisionCount === 0) return;
    setAiSafetyLoading(true);
    setAiSafetyText("");
    setActivePanel("safety");

    const collisions = Array.from(collisionReport.states.values())
      .filter(s => s.worstSeverity !== "safe")
      .map(s => ({ fdi: s.fdiNumber, severity: s.worstSeverity, pairs: s.pairs.length }));

    try {
      const res = await fetch("/api/ai-copilot/collision-safety", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ collisions, scanId }),
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim().startsWith("data: ")) continue;
          try {
            const d = JSON.parse(line.trim().slice(6)) as { content?: string; done?: boolean };
            if (d.content) { fullText += d.content; setAiSafetyText(fullText); }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      setAiSafetyText("Failed to get AI safety analysis. Please try again.");
    } finally {
      setAiSafetyLoading(false);
    }
  };

  const selectedTransform = selectedFdi ? (transforms.get(selectedFdi) ?? makeDefaultTransform(selectedFdi)) : null;
  const selectedConstraints = selectedFdi ? getConstraints(selectedFdi) : null;
  const selectedCollisionState = selectedFdi ? collisionReport?.states.get(selectedFdi) : null;

  return (
    <div className="flex flex-col h-screen w-full bg-[#080c14] text-zinc-100 overflow-hidden">
      {/* Header */}
      <header className="h-12 shrink-0 flex items-center justify-between px-4 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur z-20">
        <div className="flex items-center gap-3">
          <Link href={scanData?.caseId ? `/cases/${scanData.caseId}` : "/cases"}>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-400 hover:text-white hover:bg-zinc-800">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <Layers className="h-4 w-4 text-violet-400" />
          <span className="font-semibold text-sm">Treatment Planner</span>
          {scanData && <span className="text-zinc-500 text-xs">/ {scanData.originalName || scanData.fileName}</span>}
          {status === "ready" && (
            <Badge className="bg-violet-500/20 text-violet-400 border-violet-500/30 text-xs">{segments.length} teeth</Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7 text-xs text-zinc-400 hover:text-white gap-1" onClick={() => setShowIndicators(v => !v)}>
            <Eye className="h-3 w-3" />{showIndicators ? "Hide" : "Show"} Zones
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-400 hover:text-white disabled:opacity-30" onClick={handleUndo} disabled={!canUndo} title="Undo">
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-400 hover:text-white disabled:opacity-30" onClick={handleRedo} disabled={!canRedo} title="Redo">
            <Redo2 className="h-4 w-4" />
          </Button>
          <Separator orientation="vertical" className="h-5 bg-zinc-700" />
          <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 gap-1" onClick={handleAutoGeneratePlan} disabled={status !== "ready" || autoPlanning}>
            {autoPlanning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}AI Plan
          </Button>
          <Button size="sm" className="h-7 text-xs bg-violet-600 hover:bg-violet-700 gap-1" onClick={handleSavePlan} disabled={status !== "ready"}>
            <Download className="h-3 w-3" />Save Plan
          </Button>
          <Button size="sm" className="h-7 text-xs bg-cyan-600 hover:bg-cyan-700 gap-1" onClick={handleSendToStaging} disabled={status !== "ready"}>
            <Cpu className="h-3 w-3" />Stage Aligners
          </Button>
          {status !== "ready" && (
            <Button size="sm" className="h-7 text-xs bg-cyan-600 hover:bg-cyan-700 gap-1" onClick={loadAndBuild} disabled={!scanData || status === "loading"}>
              {status === "loading" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />}
              {status === "loading" ? `Loading ${progress}%` : "Load Scan"}
            </Button>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Tooth List */}
        <div className="w-[210px] shrink-0 border-r border-zinc-800 bg-zinc-950/60 flex flex-col">
          <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Teeth</span>
            <div className="flex items-center gap-1">
              {collisionReport && (
                <span className="text-xs text-red-400 font-bold">{collisionReport.collisionCount} coll.</span>
              )}
              <button
                onClick={() => setShowToothChart(v => !v)}
                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${showToothChart ? "border-violet-500/50 text-violet-300 bg-violet-600/20" : "border-zinc-700 text-zinc-500 hover:text-zinc-300"}`}
                title="Toggle tooth chart"
              >
                {showToothChart ? "List" : "Chart"}
              </button>
            </div>
          </div>
          {showToothChart ? (
            <ScrollArea className="flex-1">
              <div className="p-2">
                <ToothChart
                  selectedFdi={selectedFdi}
                  activeFdis={segments.map(s => s.fdiNumber)}
                  onSelect={setSelectedFdi}
                />
              </div>
            </ScrollArea>
          ) : null}
          <ScrollArea className={showToothChart ? "hidden" : "flex-1"}>
            <div className="p-1.5 space-y-0.5">
              {segments.length === 0 && (
                <div className="p-4 text-center text-xs text-zinc-500">Load a scan to begin</div>
              )}
              {segments.map(seg => {
                const state = collisionReport?.states.get(seg.fdiNumber);
                const severity = state?.worstSeverity ?? "safe";
                const hasMove = transforms.get(seg.fdiNumber) && Object.entries(transforms.get(seg.fdiNumber)!).some(([k, v]) => k !== "fdiNumber" && Math.abs(v as number) > 0.05);
                return (
                  <button
                    key={seg.fdiNumber}
                    onClick={() => setSelectedFdi(seg.fdiNumber)}
                    className={`w-full text-left px-2.5 py-2 rounded-md flex items-center gap-2 transition-all text-xs ${selectedFdi === seg.fdiNumber ? "bg-violet-600/30 border border-violet-500/50" : "hover:bg-zinc-800/60"}`}
                  >
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: SEVERITY_COLOR[severity] }} />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-zinc-200">{seg.fdiNumber}</div>
                      <div className="text-zinc-500 truncate">{FDI_NAMES[seg.fdiNumber] ?? "—"}</div>
                    </div>
                    {hasMove && <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 flex-shrink-0" title="Modified" />}
                    {state?.isRootAtRisk && <ShieldAlert className="h-3 w-3 text-orange-400 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </ScrollArea>

          {/* Keyboard shortcut hints */}
          <div className="px-3 py-1.5 border-t border-zinc-800 flex flex-wrap gap-x-2 gap-y-0.5">
            {[["Ctrl+Z", "Undo"], ["Ctrl+Y", "Redo"], ["R", "Reset view"], ["←/→", "Switch tooth"]].map(([k, label]) => (
              <span key={k} className="text-[9px] text-zinc-600 flex items-center gap-0.5">
                <kbd className="bg-zinc-800 border border-zinc-700 rounded px-0.5 text-zinc-400">{k}</kbd> {label}
              </span>
            ))}
          </div>
          {/* Collision Summary */}
          {collisionReport && (
            <div className="border-t border-zinc-800 p-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">Collisions</span>
                <span className={collisionReport.collisionCount > 0 ? "text-red-400 font-bold" : "text-green-400"}>{collisionReport.collisionCount}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">Risk zones</span>
                <span className={collisionReport.riskCount > 0 ? "text-yellow-400 font-bold" : "text-zinc-400"}>{collisionReport.riskCount}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">Occlusal</span>
                <span className={collisionReport.hasOcclusalInterference ? "text-orange-400" : "text-green-400"}>{collisionReport.hasOcclusalInterference ? "Interference" : "Clear"}</span>
              </div>
              {collisionReport.collisionCount > 0 && (
                <Button size="sm" variant="outline" className="w-full h-6 text-xs border-zinc-700 text-orange-400 hover:bg-orange-500/10 mt-1" onClick={fetchAiSafety}>
                  <Brain className="h-3 w-3 mr-1" />AI Safety
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Center: 3D Viewport */}
        <div className="flex-1 relative overflow-hidden">
          <div ref={mountRef} className="w-full h-full" />

          {status === "idle" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-400">
              <Layers className="h-14 w-14 mb-4 opacity-20" />
              <p className="text-base font-semibold">Treatment Planner</p>
              <p className="text-sm mt-1 text-zinc-500">Click "Load Scan" to begin</p>
              <Button className="mt-4 bg-violet-600 hover:bg-violet-700" onClick={loadAndBuild} disabled={!scanData}>
                <Brain className="h-4 w-4 mr-2" />Load Scan
              </Button>
            </div>
          )}

          {status === "loading" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/70">
              <Loader2 className="h-10 w-10 animate-spin text-violet-400 mb-3" />
              <p className="text-sm text-zinc-300">Loading & segmenting... {progress}%</p>
              <div className="w-48 h-1.5 bg-zinc-800 rounded-full mt-3 overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {/* Selected tooth overlay */}
          {selectedFdi && status === "ready" && (
            <div className="absolute top-3 left-3 bg-zinc-900/90 border border-zinc-700 rounded-lg px-3 py-2 text-xs">
              <span className="text-zinc-400">Selected: </span>
              <span className="text-violet-300 font-bold">{selectedFdi}</span>
              <span className="text-zinc-500 ml-1">{FDI_NAMES[selectedFdi]}</span>
              {selectedCollisionState?.worstSeverity !== "safe" && (
                <span className="ml-2 font-bold" style={{ color: SEVERITY_COLOR[selectedCollisionState!.worstSeverity] }}>
                  ⚠ {selectedCollisionState!.worstSeverity}
                </span>
              )}
            </div>
          )}

          {/* Legend */}
          <div className="absolute bottom-3 left-3 flex items-center gap-3 text-xs text-zinc-500 bg-zinc-900/80 rounded-lg px-3 py-1.5 border border-zinc-800">
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500" />Collision</div>
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-yellow-400" />Risk</div>
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500" />Safe</div>
            <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />Modified</div>
          </div>
        </div>

        {/* Right: Control Panel */}
        <div className="w-[300px] shrink-0 border-l border-zinc-800 bg-zinc-950/60 flex flex-col">
          {/* Panel Tabs */}
          <div className="flex border-b border-zinc-800">
            {[
              { id: "controls", icon: Settings2, label: "Controls" },
              { id: "history", icon: History, label: "History" },
              { id: "safety", icon: ShieldAlert, label: "Safety" },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActivePanel(tab.id as typeof activePanel)}
                className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs font-semibold transition-colors ${activePanel === tab.id ? "text-violet-400 border-b-2 border-violet-400" : "text-zinc-500 hover:text-zinc-300"}`}
              >
                <tab.icon className="h-3 w-3" />{tab.label}
              </button>
            ))}
          </div>

          {/* CONTROLS PANEL */}
          {activePanel === "controls" && (
            <div className="flex-1 overflow-hidden flex flex-col">
              {!selectedFdi ? (
                <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 text-sm">
                  <Move className="h-8 w-8 mb-2 opacity-20" />
                  <p>Click a tooth to select</p>
                  <p className="text-xs mt-1 text-zinc-600">Then use sliders to move it</p>
                </div>
              ) : selectedTransform && selectedConstraints ? (
                <ScrollArea className="flex-1">
                  <div className="p-3 space-y-4">
                    {/* Tooth info */}
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-bold text-violet-300">Tooth {selectedFdi}</div>
                        <div className="text-xs text-zinc-500">{FDI_NAMES[selectedFdi]}</div>
                      </div>
                      <Button size="sm" variant="outline" className="h-6 text-xs border-zinc-700 text-zinc-400 hover:text-white" onClick={handleResetTooth}>
                        <RotateCcw className="h-3 w-3 mr-1" />Reset
                      </Button>
                    </div>

                    {/* Warnings */}
                    {warnings.length > 0 && (
                      <div className="space-y-1">
                        {warnings.map((w, i) => (
                          <div key={i} className={`flex items-start gap-2 rounded p-2 text-xs ${w.level === "danger" ? "bg-red-500/10 text-red-400" : "bg-yellow-500/10 text-yellow-400"}`}>
                            <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                            <span>{w.message}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Sliders grouped */}
                    {(["translation", "rotation", "orthodontic"] as const).map(group => {
                      const sliders = makeSliders(selectedConstraints).filter(s => s.group === group);
                      const groupLabel = group === "translation" ? "Translation" : group === "rotation" ? "General Rotation" : "Orthodontic";
                      const groupIcon = group === "translation" ? <Move className="h-3 w-3" /> : group === "rotation" ? <RotateCw className="h-3 w-3" /> : <Brain className="h-3 w-3" />;

                      return (
                        <div key={group}>
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">
                            {groupIcon}{groupLabel}
                          </div>
                          <div className="space-y-3">
                            {sliders.map(slider => {
                              const val = selectedTransform[slider.field] as number;
                              const pct = Math.abs(val) / Math.abs(slider.max) * 100;
                              const isWarning = pct >= 75;
                              const isDanger = pct >= 100;
                              return (
                                <div key={slider.field}>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs text-zinc-400">{slider.label}</span>
                                    <span className={`text-xs font-mono font-bold tabular-nums ${isDanger ? "text-red-400" : isWarning ? "text-yellow-400" : "text-zinc-300"}`}>
                                      {val >= 0 ? "+" : ""}{val.toFixed(1)}{slider.unit}
                                    </span>
                                  </div>
                                  <Slider
                                    min={slider.min}
                                    max={slider.max}
                                    step={slider.step}
                                    value={[val]}
                                    onValueChange={([v]) => handleSliderChange(slider.field, v)}
                                    onValueCommit={([v]) => handleSliderCommit(slider.field, v)}
                                    className={isDanger ? "[&_[role=slider]]:bg-red-400 [&_.relative]:bg-red-900/30" : isWarning ? "[&_[role=slider]]:bg-yellow-400" : ""}
                                  />
                                  <div className="flex justify-between text-[10px] text-zinc-600 mt-0.5">
                                    <span>{slider.min}{slider.unit}</span>
                                    <span className="text-zinc-500">max safe: ±{Math.abs(slider.max)}{slider.unit}</span>
                                    <span>{slider.max}{slider.unit}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}

                    {/* Collision state for selected tooth */}
                    {selectedCollisionState && (
                      <div>
                        <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Collision Status</div>
                        <div className={`rounded-lg p-3 text-xs ${selectedCollisionState.worstSeverity === "collision" ? "bg-red-500/10 border border-red-500/30" : selectedCollisionState.worstSeverity === "risk" ? "bg-yellow-500/10 border border-yellow-500/30" : "bg-green-500/10 border border-green-500/30"}`}>
                          <div className="flex items-center gap-2 font-bold mb-2" style={{ color: SEVERITY_COLOR[selectedCollisionState.worstSeverity] }}>
                            {selectedCollisionState.worstSeverity === "collision" ? <XCircle className="h-3 w-3" /> : selectedCollisionState.worstSeverity === "risk" ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle className="h-3 w-3" />}
                            {selectedCollisionState.worstSeverity.toUpperCase()}
                          </div>
                          {selectedCollisionState.pairs.filter(p => p.severity !== "safe").slice(0, 3).map((p, i) => (
                            <div key={i} className="text-zinc-400 flex items-center gap-1 mb-1">
                              <ChevronRight className="h-2.5 w-2.5 flex-shrink-0" />
                              <span>{p.type} w/ tooth {p.toothA === selectedFdi ? p.toothB : p.toothA}: {p.distance.toFixed(1)}mm</span>
                            </div>
                          ))}
                          {selectedCollisionState.isRootAtRisk && (
                            <div className="flex items-start gap-1 mt-2 text-orange-400">
                              <ShieldAlert className="h-3 w-3 mt-0.5 flex-shrink-0" />
                              <span>{selectedCollisionState.rootRiskReason}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              ) : null}
            </div>
          )}

          {/* HISTORY PANEL */}
          {activePanel === "history" && (
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
                <span className="text-xs text-zinc-400">{historyEntries.length} actions</span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-5 w-5 text-zinc-500 hover:text-white" onClick={handleUndo} disabled={!canUndo} title="Undo"><Undo2 className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-5 w-5 text-zinc-500 hover:text-white" onClick={handleRedo} disabled={!canRedo} title="Redo"><Redo2 className="h-3 w-3" /></Button>
                </div>
              </div>
              <ScrollArea className="flex-1">
                {historyEntries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-zinc-500 text-xs">
                    <History className="h-6 w-6 mb-1 opacity-20" />No movements yet
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {historyEntries.map((entry, i) => (
                      <div key={entry.id} className={`rounded-md p-2.5 text-xs border ${i === 0 ? "border-violet-500/40 bg-violet-500/10" : "border-zinc-800 bg-zinc-900/40"}`}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />
                          <span className="font-semibold text-zinc-200">{entry.label}</span>
                        </div>
                        <div className="text-zinc-500">{entry.timestamp.toLocaleTimeString()}</div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          )}

          {/* SAFETY PANEL */}
          {activePanel === "safety" && (
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-400">AI Safety Analysis</span>
                <Button variant="ghost" size="sm" className="h-5 text-xs text-violet-400 hover:text-violet-300" onClick={fetchAiSafety} disabled={aiSafetyLoading}>
                  {aiSafetyLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />}
                </Button>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-3 space-y-3">
                  {collisionReport && (
                    <div className={`rounded-lg p-3 text-xs border ${collisionReport.collisionCount > 0 ? "border-red-500/30 bg-red-500/5" : "border-green-500/30 bg-green-500/5"}`}>
                      <div className="font-bold mb-2" style={{ color: collisionReport.collisionCount > 0 ? "#ef4444" : "#22c55e" }}>
                        {collisionReport.collisionCount > 0 ? `${collisionReport.collisionCount} Active Collision${collisionReport.collisionCount > 1 ? "s" : ""}` : "No Collisions Detected"}
                      </div>
                      <div className="space-y-1 text-zinc-400">
                        <div className="flex justify-between"><span>Risk zones</span><span className="text-yellow-400">{collisionReport.riskCount}</span></div>
                        <div className="flex justify-between"><span>Worst dist.</span><span>{collisionReport.worstDistance.toFixed(1)} mm</span></div>
                        <div className="flex justify-between"><span>Occlusal</span><span className={collisionReport.hasOcclusalInterference ? "text-orange-400" : "text-green-400"}>{collisionReport.hasOcclusalInterference ? "Interference" : "Clear"}</span></div>
                      </div>
                    </div>
                  )}

                  {aiSafetyLoading && (
                    <div className="flex items-center gap-2 text-xs text-violet-400">
                      <Loader2 className="h-3 w-3 animate-spin" />Analyzing safety...
                    </div>
                  )}

                  {aiSafetyText && (
                    <div className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap bg-zinc-900/60 rounded-lg p-3 border border-zinc-800">
                      {aiSafetyText}
                    </div>
                  )}

                  {!aiSafetyText && !aiSafetyLoading && collisionReport && collisionReport.collisionCount > 0 && (
                    <Button className="w-full h-7 text-xs bg-violet-600 hover:bg-violet-700" onClick={fetchAiSafety}>
                      <Brain className="h-3 w-3 mr-1" />Get AI Safety Analysis
                    </Button>
                  )}

                  {!aiSafetyText && !aiSafetyLoading && (!collisionReport || collisionReport.collisionCount === 0) && (
                    <div className="flex flex-col items-center text-xs text-zinc-500 py-6">
                      <CheckCircle className="h-6 w-6 mb-2 text-green-500 opacity-60" />
                      Move teeth to simulate — AI safety analysis activates when collisions are detected.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Bottom status bar */}
          <div className="border-t border-zinc-800 px-3 py-2 flex items-center justify-between text-xs text-zinc-500">
            <span>{records.filter(r => {
              const t = r.currentTransform;
              return Object.entries(t).some(([k, v]) => k !== "fdiNumber" && Math.abs(v as number) > 0.05);
            }).length} teeth modified</span>
            <span className={warnings.some(w => w.level === "danger") ? "text-red-400" : warnings.length > 0 ? "text-yellow-400" : "text-green-400"}>
              {warnings.some(w => w.level === "danger") ? "⚠ Danger" : warnings.length > 0 ? "⚠ Warning" : "✓ Safe"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
