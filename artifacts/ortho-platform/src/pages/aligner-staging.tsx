import { useEffect, useRef, useState, useCallback } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { ScanPicker } from "@/components/scan-picker";
import { generateAlignerPDF, type AlignerStageData } from "@/lib/pdf-booklet";
import * as THREE from "three";
import { OrbitControls } from "three-stdlib";
import { STLLoader, OBJLoader, PLYLoader } from "three-stdlib";
import { useGetScan, useGetScanAnalysis } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Brain, Loader2, RotateCcw, Play, Pause,
  Download, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  AlertTriangle, CheckCircle, Layers, BarChart3, Cpu,
  Eye, EyeOff, Zap, Clock, TrendingUp, Award, FileText,
  SplitSquareHorizontal, Activity
} from "lucide-react";

import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { runSegmentation, type ToothSegment } from "@/lib/segmentation-engine";
import {
  applyTransformToGroup, type ToothTransform
} from "@/lib/tooth-movement-engine";
import {
  generateStages, computeTreatmentPrediction, generateAlignerReport,
  lerpTransform, loadTreatmentPlanFromStorage, generateDemoTransforms,
  saveTreatmentPlanToStorage,
  type AlignerStage, type TreatmentPrediction, type AlignerReport
} from "@/lib/aligner-staging-engine";

const FDI_NAMES: Record<number, string> = {
  11:"UR Central",12:"UR Lateral",13:"UR Canine",14:"UR 1st PM",15:"UR 2nd PM",16:"UR 1st Molar",17:"UR 2nd Molar",
  21:"UL Central",22:"UL Lateral",23:"UL Canine",24:"UL 1st PM",25:"UL 2nd PM",26:"UL 1st Molar",27:"UL 2nd Molar",
  31:"LL Central",32:"LL Lateral",33:"LL Canine",34:"LL 1st PM",35:"LL 2nd PM",36:"LL 1st Molar",37:"LL 2nd Molar",
  41:"LR Central",42:"LR Lateral",43:"LR Canine",44:"LR 1st PM",45:"LR 2nd PM",46:"LR 1st Molar",47:"LR 2nd Molar",
};

const COMPLEXITY_COLOR: Record<string, string> = {
  minimal: "#22c55e", mild: "#86efac", moderate: "#f59e0b", complex: "#ef4444"
};

const SPEED_OPTIONS = [
  { label: "Slow", ms: 1200 },
  { label: "Normal", ms: 600 },
  { label: "Fast", ms: 200 },
];

export default function AlignerStaging() {
  const [, params] = useRoute("/aligner-staging/:scanId");
  const [, navigate] = useLocation();
  const scanId = params?.scanId ? parseInt(params.scanId, 10) : 0;

  if (!scanId) return (
    <ScanPicker
      targetPath="/aligner-staging"
      title="Aligner Staging"
      description="Stage-by-stage aligner sequence planning and movement simulation"
      Icon={Cpu}
    />
  );

  const { toast } = useToast();

  // Three.js refs
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const toothGroupsRef = useRef<Map<number, THREE.Group>>(new Map());
  const ghostGroupsRef = useRef<Map<number, THREE.Group>>(new Map());
  const initialPosRef = useRef<Map<number, THREE.Vector3>>(new Map());
  const initialRotRef = useRef<Map<number, THREE.Euler>>(new Map());
  const animIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // State
  const [loadStatus, setLoadStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [loadProgress, setLoadProgress] = useState(0);
  const [segments, setSegments] = useState<ToothSegment[]>([]);
  const [finalTransforms, setFinalTransforms] = useState<ToothTransform[]>([]);
  const [stages, setStages] = useState<AlignerStage[]>([]);
  const [prediction, setPrediction] = useState<TreatmentPrediction | null>(null);
  const [report, setReport] = useState<AlignerReport | null>(null);
  const [currentStage, setCurrentStage] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);
  const [showGhosts, setShowGhosts] = useState(true);
  const [compareMode, setCompareMode] = useState(false);
  const [activePanel, setActivePanel] = useState<"stages" | "report" | "ai">("stages");
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [hasPlan, setHasPlan] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);

  const { data: scanData } = useGetScan(scanId, { query: { enabled: !!scanId } });
  const { data: analysisData } = useGetScanAnalysis(scanId, { query: { enabled: !!scanId } });

  // ─── Three.js Setup ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!mountRef.current) return;
    let animId: number;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#06080f");
    sceneRef.current = scene;

    const w = mountRef.current.clientWidth, h = mountRef.current.clientHeight;
    const cam = new THREE.PerspectiveCamera(42, w / h, 0.1, 2000);
    cam.position.set(0, 25, 160);
    cameraRef.current = cam;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    mountRef.current.innerHTML = "";
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const d1 = new THREE.DirectionalLight(0xffffff, 1.1); d1.position.set(2, 4, 2); scene.add(d1);
    const d2 = new THREE.DirectionalLight(0x8ed8ff, 0.35); d2.position.set(-2, -1, -2); scene.add(d2);
    scene.add(new THREE.HemisphereLight(0x1a3a6a, 0x06080f, 0.45));

    // Grid
    const grid = new THREE.GridHelper(200, 40, 0x1a2a4a, 0x0d1625);
    grid.position.y = -32; scene.add(grid);

    const controls = new OrbitControls(cam, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.06;
    controlsRef.current = controls;

    const handleResize = () => {
      if (!mountRef.current) return;
      cam.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      cam.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    window.addEventListener("resize", handleResize);

    const animate = () => { animId = requestAnimationFrame(animate); controls.update(); renderer.render(scene, cam); };
    animate();

    return () => { window.removeEventListener("resize", handleResize); cancelAnimationFrame(animId); renderer.dispose(); };
  }, []);

  // ─── Load Scene ───────────────────────────────────────────────────────────

  const loadScene = useCallback(async (transforms: ToothTransform[], isDemo = false) => {
    if (!scanData) return;
    const scene = sceneRef.current!;

    // Clear previous
    toothGroupsRef.current.forEach(g => scene.remove(g));
    ghostGroupsRef.current.forEach(g => scene.remove(g));
    toothGroupsRef.current.clear();
    ghostGroupsRef.current.clear();
    initialPosRef.current.clear();
    initialRotRef.current.clear();

    setLoadStatus("loading");
    setLoadProgress(5);

    try {
      const response = await fetch(`/api/scans/${scanId}/file`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load scan file");
      const buf = await response.arrayBuffer();

      let geo: THREE.BufferGeometry | null = null;
      const ft = scanData.fileType;
      if (ft === "stl") { geo = new STLLoader().parse(buf); }
      else if (ft === "obj") {
        const txt = new TextDecoder().decode(buf);
        new OBJLoader().parse(txt).traverse(c => { if (c instanceof THREE.Mesh && !geo) geo = c.geometry; });
      } else if (ft === "ply") { geo = new PLYLoader().parse(buf); }
      if (!geo) throw new Error("Cannot parse geometry");
      (geo as THREE.BufferGeometry).computeVertexNormals();
      (geo as THREE.BufferGeometry).center();
      setLoadProgress(20);

      const segs = await runSegmentation(
        geo as THREE.BufferGeometry,
        (scanData.jawType as "upper" | "lower" | "both") ?? "both",
        p => setLoadProgress(20 + p * 0.65)
      );
      setSegments(segs);
      setLoadProgress(88);

      // Fit camera
      (geo as THREE.BufferGeometry).computeBoundingSphere();
      const sphere = (geo as THREE.BufferGeometry).boundingSphere!;
      cameraRef.current!.position.set(sphere.center.x, sphere.center.y + 15, sphere.center.z + sphere.radius * 2.8);
      controlsRef.current?.target.copy(sphere.center);

      // Build tooth groups + ghost groups
      for (const seg of segs) {
        if (!seg.geometry) continue;

        // Real tooth group
        const group = new THREE.Group();
        group.name = `tooth_${seg.fdiNumber}`;
        group.userData.fdiNumber = seg.fdiNumber;
        const mat = new THREE.MeshPhongMaterial({
          color: new THREE.Color(seg.color), specular: 0x224466,
          shininess: 55, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
        });
        group.add(new THREE.Mesh(seg.geometry, mat));
        scene.add(group);
        toothGroupsRef.current.set(seg.fdiNumber, group);
        initialPosRef.current.set(seg.fdiNumber, group.position.clone());
        initialRotRef.current.set(seg.fdiNumber, group.rotation.clone());

        // Ghost group (final position)
        const hasFinalTransform = transforms.find(t => t.fdiNumber === seg.fdiNumber);
        if (hasFinalTransform) {
          const ghostGroup = new THREE.Group();
          ghostGroup.name = `ghost_${seg.fdiNumber}`;
          const ghostMat = new THREE.MeshPhongMaterial({
            color: 0x60a5fa, wireframe: false,
            transparent: true, opacity: 0.18,
            side: THREE.DoubleSide, depthWrite: false,
          });
          ghostGroup.add(new THREE.Mesh(seg.geometry, ghostMat));
          const initPos = group.position.clone();
          const initRot = group.rotation.clone();
          applyTransformToGroup(ghostGroup, hasFinalTransform, initPos, initRot);
          scene.add(ghostGroup);
          ghostGroupsRef.current.set(seg.fdiNumber, ghostGroup);
        }
      }

      // Generate stages
      const movedTransforms = transforms.filter(t =>
        Object.entries(t).some(([k, v]) => k !== "fdiNumber" && Math.abs(v as number) > 0.05)
      );
      const generatedStages = generateStages(movedTransforms.length > 0 ? transforms : generateDemoTransforms());
      const pred = computeTreatmentPrediction(movedTransforms.length > 0 ? transforms : generateDemoTransforms());
      const rep = generateAlignerReport(transforms, pred);

      setFinalTransforms(transforms);
      setStages(generatedStages);
      setPrediction(pred);
      setReport(rep);
      setCurrentStage(0);
      setLoadProgress(100);
      setLoadStatus("ready");
      setIsDemoMode(isDemo);

      toast({
        title: isDemo ? "Demo Mode — Staging Engine" : "Aligner Staging Ready",
        description: `${generatedStages.length - 1} aligners generated${isDemo ? " (demo data)" : ""}`,
      });
    } catch (err) {
      setLoadStatus("error");
      toast({ title: "Load failed", description: (err as Error).message, variant: "destructive" });
    }
  }, [scanData, scanId, toast]);

  // ─── Apply Stage to 3D ────────────────────────────────────────────────────

  const applyStage = useCallback((stageIdx: number) => {
    if (stages.length === 0) return;
    const stage = stages[Math.max(0, Math.min(stageIdx, stages.length - 1))];

    for (const stageTransform of stage.transforms) {
      const group = toothGroupsRef.current.get(stageTransform.fdiNumber);
      const initPos = initialPosRef.current.get(stageTransform.fdiNumber);
      const initRot = initialRotRef.current.get(stageTransform.fdiNumber);
      if (!group || !initPos || !initRot) continue;
      applyTransformToGroup(group, stageTransform, initPos, initRot);
    }
  }, [stages]);

  useEffect(() => { applyStage(currentStage); }, [currentStage, applyStage]);

  // Ghost visibility
  useEffect(() => {
    ghostGroupsRef.current.forEach(g => { g.visible = showGhosts; });
  }, [showGhosts]);

  // Compare mode: show stage 0 vs final
  useEffect(() => {
    if (!compareMode) return;
    setCurrentStage(stages.length > 0 ? stages.length - 1 : 0);
  }, [compareMode, stages.length]);

  // ─── Animation ────────────────────────────────────────────────────────────

  const stopAnimation = useCallback(() => {
    if (animIntervalRef.current) { clearInterval(animIntervalRef.current); animIntervalRef.current = null; }
    setIsPlaying(false);
  }, []);

  const startAnimation = useCallback(() => {
    if (stages.length === 0) return;
    stopAnimation();
    setIsPlaying(true);
    const speed = SPEED_OPTIONS[speedIdx].ms;
    animIntervalRef.current = setInterval(() => {
      setCurrentStage(prev => {
        if (prev >= stages.length - 1) {
          stopAnimation();
          return prev;
        }
        return prev + 1;
      });
    }, speed);
  }, [stages.length, speedIdx, stopAnimation]);

  const togglePlay = useCallback(() => {
    if (isPlaying) { stopAnimation(); return; }
    if (currentStage >= stages.length - 1) setCurrentStage(0);
    startAnimation();
  }, [isPlaying, currentStage, stages.length, stopAnimation, startAnimation]);

  const handleResetView = () => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(0, 25, 160);
      controlsRef.current.reset();
    }
  };

  useKeyboardShortcuts({
    enabled: loadStatus === "ready",
    onPlayPause: togglePlay,
    onResetView: handleResetView,
    onNextTooth: () => { stopAnimation(); setCurrentStage(s => Math.min(stages.length - 1, s + 1)); },
    onPrevTooth: () => { stopAnimation(); setCurrentStage(s => Math.max(0, s - 1)); },
  });

  useEffect(() => { return () => { if (animIntervalRef.current) clearInterval(animIntervalRef.current); }; }, []);

  // ─── Initial load check ───────────────────────────────────────────────────

  useEffect(() => {
    if (!scanData) return;
    const stored = loadTreatmentPlanFromStorage(scanId);
    if (stored && stored.transforms.length > 0) {
      setHasPlan(true);
    }
  }, [scanData, scanId]);

  const handleLoadPlan = useCallback(() => {
    const stored = loadTreatmentPlanFromStorage(scanId);
    const transforms = stored?.transforms ?? [];
    loadScene(transforms, transforms.length === 0);
  }, [scanId, loadScene]);

  const handleDemoMode = useCallback(() => {
    const demo = generateDemoTransforms();
    saveTreatmentPlanToStorage(scanId, demo);
    loadScene(demo, true);
  }, [scanId, loadScene]);

  // ─── AI Analysis ─────────────────────────────────────────────────────────

  const fetchAiAnalysis = async () => {
    if (!prediction) return;
    setAiLoading(true);
    setAiText("");
    setActivePanel("ai");

    try {
      const res = await fetch("/api/ai-copilot/treatment-simulation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          totalStages: prediction.totalStages,
          estimatedMonths: prediction.estimatedMonths,
          overallComplexity: prediction.overallComplexity,
          successProbability: prediction.successProbability,
          refinementLikelihood: prediction.refinementLikelihood,
          totalTeethMoved: prediction.totalTeethMoved,
          difficultMovements: prediction.movementSummaries.filter(s => s.complexity === "complex" || s.complexity === "moderate").map(s => ({ fdi: s.fdiNumber, label: s.toothLabel, factors: s.difficultFactors })),
          phases: prediction.phases.map(p => ({ label: p.label, stages: `${p.startStage}–${p.endStage}`, movement: p.primaryMovement })),
        }),
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "", full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim().startsWith("data: ")) continue;
          try {
            const d = JSON.parse(line.trim().slice(6)) as { content?: string };
            if (d.content) { full += d.content; setAiText(full); }
          } catch { /* skip */ }
        }
      }
    } catch { setAiText("Failed to get AI analysis. Please try again."); }
    finally { setAiLoading(false); }
  };

  // ─── Download report ──────────────────────────────────────────────────────

  const downloadReport = () => {
    if (!report) return;
    const lines = [
      "ORTHOVISION — ALIGNER STAGING REPORT",
      "=====================================",
      `Generated: ${new Date(report.generatedAt).toLocaleString()}`,
      `Scan ID: ${scanId}`,
      "",
      "TREATMENT SUMMARY",
      "-----------------",
      `Total Aligners: ${report.totalAligners}`,
      `Estimated Duration: ${report.estimatedDurationWeeks} weeks (~${report.estimatedDurationMonths} months)`,
      `Success Probability: ${report.successProbability}%`,
      `Refinement Likelihood: ${report.refinementLikelihood}%`,
      `Complexity: ${report.complexity.toUpperCase()}`,
      `Teeth Moved: ${report.teethMoved}`,
      "",
      "TREATMENT PHASES",
      "----------------",
      ...report.phases.map(p => `  ${p.label} (Stages ${p.startStage}–${p.endStage}): ${p.description}`),
      "",
      "PER-TOOTH SUMMARY",
      "-----------------",
      ...report.perToothSummary.map(t =>
        `  Tooth ${t.fdiNumber} (${t.toothLabel}): ${t.complexity.toUpperCase()} | Trans: ${t.totalTranslationMm}mm | Rot: ${t.maxRotationDeg}° | Active stages: ${t.firstActiveStage}–${t.lastActiveStage}`
      ),
      "",
      "CLINICAL NOTES",
      "--------------",
      ...report.clinicalNotes.map(n => `  • ${n}`),
      "",
      "DISCLAIMER: This report is advisory only. All treatment decisions require professional clinical judgment.",
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `aligner-report-scan-${scanId}.txt`;
    a.click(); URL.revokeObjectURL(url);
    toast({ title: "Report downloaded" });
  };

  const totalStages = stages.length > 0 ? stages.length - 1 : 0;
  const currentStageData = stages[currentStage];

  return (
    <div className="flex flex-col h-screen w-full bg-[#06080f] text-zinc-100 overflow-hidden">

      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <header className="h-12 shrink-0 flex items-center justify-between px-4 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur z-20">
        <div className="flex items-center gap-3">
          <Link href={scanData?.caseId ? `/cases/${scanData.caseId}` : "/cases"}>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-400 hover:text-white hover:bg-zinc-800">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <Cpu className="h-4 w-4 text-cyan-400" />
          <span className="font-semibold text-sm">Aligner Staging Engine</span>
          {scanData && <span className="text-zinc-600 text-xs">/ {scanData.originalName || scanData.fileName}</span>}
          {isDemoMode && <Badge className="text-[10px] bg-amber-500/20 text-amber-400 border-amber-500/30">DEMO</Badge>}
          {loadStatus === "ready" && <Badge className="text-[10px] bg-cyan-500/20 text-cyan-400 border-cyan-500/30">{totalStages} aligners</Badge>}
        </div>

        {/* Animation Controls */}
        {loadStatus === "ready" && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg px-1 py-0.5">
              <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-white" onClick={() => { stopAnimation(); setCurrentStage(0); }} title="First Stage">
                <ChevronsLeft className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-white" onClick={() => { stopAnimation(); setCurrentStage(s => Math.max(0, s - 1)); }}>
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10" onClick={togglePlay} title={isPlaying ? "Pause" : "Play"}>
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-white" onClick={() => { stopAnimation(); setCurrentStage(s => Math.min(totalStages, s + 1)); }}>
                <ChevronRight className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-400 hover:text-white" onClick={() => { stopAnimation(); setCurrentStage(totalStages); }} title="Final Stage">
                <ChevronsRight className="h-3 w-3" />
              </Button>
            </div>
            {/* Speed */}
            <div className="flex items-center gap-1">
              {SPEED_OPTIONS.map((opt, i) => (
                <button key={opt.label} onClick={() => { setSpeedIdx(i); if (isPlaying) { stopAnimation(); setTimeout(startAnimation, 0); } }}
                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${speedIdx === i ? "bg-cyan-500/20 text-cyan-400" : "text-zinc-500 hover:text-zinc-300"}`}>
                  {opt.label}
                </button>
              ))}
            </div>
            <Separator orientation="vertical" className="h-5 bg-zinc-800" />
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-zinc-400 hover:text-white" onClick={() => setShowGhosts(v => !v)}>
              {showGhosts ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              Ghost
            </Button>
            <Button size="sm" variant="ghost" className={`h-7 text-xs gap-1 ${compareMode ? "text-cyan-400 bg-cyan-500/10" : "text-zinc-400 hover:text-white"}`} onClick={() => setCompareMode(v => !v)}>
              <SplitSquareHorizontal className="h-3 w-3" />Compare
            </Button>
            <Button size="sm" className="h-7 text-xs gap-1 bg-zinc-800 hover:bg-zinc-700" onClick={downloadReport} disabled={!report}>
              <Download className="h-3 w-3" />Report
            </Button>
          </div>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* ─── Left Panel: Predictions ─────────────────────────────────── */}
        <div className="w-[200px] shrink-0 border-r border-zinc-800 bg-zinc-950/50 flex flex-col">
          <div className="px-3 py-2 border-b border-zinc-800">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Predictions</span>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-3">
              {!prediction && (
                <div className="text-xs text-zinc-500 text-center py-4">Load a treatment plan to see predictions</div>
              )}
              {prediction && (
                <>
                  {/* Key Metrics */}
                  {[
                    { icon: Layers, label: "Aligners", value: prediction.totalStages.toString(), color: "text-cyan-400" },
                    { icon: Clock, label: "Duration", value: `~${prediction.estimatedMonths}mo`, color: "text-violet-400" },
                    { icon: Award, label: "Success", value: `${prediction.successProbability}%`, color: prediction.successProbability >= 85 ? "text-green-400" : "text-yellow-400" },
                    { icon: TrendingUp, label: "Refinement", value: `${prediction.refinementLikelihood}%`, color: prediction.refinementLikelihood > 40 ? "text-red-400" : "text-green-400" },
                    { icon: Activity, label: "Complexity", value: prediction.overallComplexity, color: COMPLEXITY_COLOR[prediction.overallComplexity] ?? "text-zinc-400" },
                    { icon: Cpu, label: "Teeth moved", value: prediction.totalTeethMoved.toString(), color: "text-zinc-300" },
                  ].map(({ icon: Icon, label, value, color }) => (
                    <div key={label} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                        <Icon className="h-3 w-3" />{label}
                      </div>
                      <span className={`text-xs font-bold capitalize ${color}`}>{value}</span>
                    </div>
                  ))}

                  <Separator className="bg-zinc-800" />

                  {/* Phase Summary */}
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">Phases</div>
                  {prediction.phases.map((phase, i) => (
                    <div key={i} className={`rounded-md px-2 py-1.5 text-xs border transition-colors ${currentStage >= phase.startStage && currentStage <= phase.endStage ? "border-cyan-500/40 bg-cyan-500/10" : "border-zinc-800 bg-zinc-900/30"}`}>
                      <div className="font-semibold text-zinc-300 truncate" title={phase.label}>{phase.label.split("—")[0].trim()}</div>
                      <div className="text-zinc-500 text-[10px]">Stages {phase.startStage}–{phase.endStage}</div>
                      <div className="text-cyan-400/70 text-[10px] truncate">{phase.primaryMovement}</div>
                    </div>
                  ))}

                  <Button
                    className="w-full h-7 text-xs bg-violet-700 hover:bg-violet-600 gap-1 mt-1"
                    onClick={fetchAiAnalysis}
                    disabled={aiLoading}
                  >
                    {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />}
                    AI Analysis
                  </Button>
                </>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* ─── Center: 3D Viewport ─────────────────────────────────────── */}
        <div className="flex-1 relative overflow-hidden flex flex-col">
          <div ref={mountRef} className="flex-1" />

          {/* Idle / Loading overlay */}
          {loadStatus === "idle" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-950/90">
              <Cpu className="h-14 w-14 text-cyan-500/30" />
              <div className="text-center">
                <p className="text-base font-semibold text-zinc-200">Aligner Staging Engine</p>
                <p className="text-sm text-zinc-500 mt-1">
                  {hasPlan ? "Treatment plan detected from Treatment Planner" : "No treatment plan found for this scan"}
                </p>
              </div>
              <div className="flex gap-3">
                {hasPlan && (
                  <Button className="bg-cyan-600 hover:bg-cyan-700 gap-2" onClick={handleLoadPlan} disabled={!scanData}>
                    <Layers className="h-4 w-4" />Load Treatment Plan
                  </Button>
                )}
                <Button variant="outline" className="border-zinc-700 text-zinc-300 gap-2" onClick={handleDemoMode} disabled={!scanData}>
                  <Zap className="h-4 w-4" />Demo Mode
                </Button>
                {!hasPlan && (
                  <Button variant="ghost" className="text-zinc-500 gap-1 text-sm" onClick={() => navigate(`/treatment-planner/${scanId}`)}>
                    <ArrowLeft className="h-3 w-3" />Go to Treatment Planner
                  </Button>
                )}
              </div>
              {!hasPlan && (
                <p className="text-xs text-zinc-600 max-w-sm text-center">
                  Create a treatment plan in the Treatment Planner first, then click "Send to Staging" to populate this engine.
                </p>
              )}
            </div>
          )}

          {loadStatus === "loading" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/80">
              <Loader2 className="h-10 w-10 animate-spin text-cyan-400 mb-3" />
              <p className="text-sm text-zinc-300">Loading & generating stages... {loadProgress}%</p>
              <div className="w-52 h-1.5 bg-zinc-800 rounded-full mt-3 overflow-hidden">
                <div className="h-full bg-cyan-500 rounded-full transition-all" style={{ width: `${loadProgress}%` }} />
              </div>
            </div>
          )}

          {/* Stage info overlay */}
          {loadStatus === "ready" && (
            <div className="absolute top-3 left-3 bg-zinc-900/90 border border-zinc-700/80 rounded-lg px-3 py-2 text-xs pointer-events-none">
              <div className="flex items-center gap-2">
                <div className="font-bold text-cyan-400">Stage {currentStage}</div>
                <div className="text-zinc-500">of {totalStages}</div>
                {currentStage === 0 && <Badge className="text-[9px] bg-zinc-700 text-zinc-300">Initial</Badge>}
                {currentStage === totalStages && <Badge className="text-[9px] bg-green-500/20 text-green-400">Final</Badge>}
              </div>
              {currentStageData?.notes[0] && (
                <div className="text-zinc-500 mt-0.5">{currentStageData.notes[0]}</div>
              )}
              {isDemoMode && <div className="text-amber-400/70 text-[10px] mt-0.5">Demo data — load real plan from Treatment Planner</div>}
            </div>
          )}

          {/* Ghost legend */}
          {loadStatus === "ready" && showGhosts && (
            <div className="absolute top-3 right-3 bg-zinc-900/90 border border-zinc-700/80 rounded-lg px-2.5 py-1.5 text-[10px] text-zinc-500 pointer-events-none">
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-1 rounded-full bg-blue-400 opacity-60" />Final position</div>
              <div className="flex items-center gap-1.5 mt-0.5"><div className="w-2.5 h-1 rounded-full bg-zinc-300 opacity-40" />Current position</div>
            </div>
          )}

          {/* ─── Stage Slider ─────────────────────────────────────────── */}
          {loadStatus === "ready" && (
            <div className="shrink-0 border-t border-zinc-800 bg-zinc-950/90 backdrop-blur px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-500 w-12 text-right font-mono">0</span>
                <div className="flex-1">
                  <Slider
                    min={0}
                    max={totalStages}
                    step={1}
                    value={[currentStage]}
                    onValueChange={([v]) => { stopAnimation(); setCurrentStage(v); }}
                    className="[&_[role=slider]]:bg-cyan-400 [&_[role=slider]]:border-cyan-400"
                  />
                  {/* Phase markers */}
                  {prediction && totalStages > 0 && (
                    <div className="relative mt-1 h-1">
                      {prediction.phases.map((phase, i) => (
                        <div key={i} className={`absolute h-full rounded-full opacity-40 ${i === 0 ? "bg-blue-400" : i === 1 ? "bg-violet-400" : "bg-cyan-400"}`}
                          style={{
                            left: `${(phase.startStage / totalStages) * 100}%`,
                            width: `${((phase.endStage - phase.startStage) / totalStages) * 100}%`,
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-xs text-zinc-500 w-12 font-mono">{totalStages}</span>
                <span className="text-xs font-bold text-cyan-400 font-mono w-14">S{currentStage.toString().padStart(3, "0")}</span>
              </div>
              {/* Per-tooth active indicator */}
              {currentStageData && currentStageData.activeTeeth.length > 0 && (
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="text-[10px] text-zinc-600">Moving:</span>
                  <div className="flex gap-1 flex-wrap">
                    {currentStageData.activeTeeth.slice(0, 10).map(fdi => (
                      <span key={fdi} className="text-[10px] px-1 rounded bg-cyan-500/20 text-cyan-400">{fdi}</span>
                    ))}
                    {currentStageData.activeTeeth.length > 10 && (
                      <span className="text-[10px] text-zinc-500">+{currentStageData.activeTeeth.length - 10} more</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── Right Panel ─────────────────────────────────────────────── */}
        <div className="w-[280px] shrink-0 border-l border-zinc-800 bg-zinc-950/50 flex flex-col">
          {/* Tabs */}
          <div className="flex border-b border-zinc-800">
            {[
              { id: "stages", icon: Layers, label: "Stages" },
              { id: "report", icon: BarChart3, label: "Report" },
              { id: "ai", icon: Brain, label: "AI" },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActivePanel(tab.id as typeof activePanel)}
                className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs font-semibold transition-colors ${activePanel === tab.id ? "text-cyan-400 border-b-2 border-cyan-400" : "text-zinc-500 hover:text-zinc-300"}`}>
                <tab.icon className="h-3 w-3" />{tab.label}
              </button>
            ))}
          </div>

          {/* STAGES PANEL */}
          {activePanel === "stages" && (
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {stages.length === 0 ? (
                  <div className="py-8 text-center text-xs text-zinc-500">Load a treatment plan to see stages</div>
                ) : (
                  stages.map((stage, i) => (
                    <button
                      key={stage.stageNumber}
                      onClick={() => { stopAnimation(); setCurrentStage(i); }}
                      className={`w-full text-left rounded-md px-2.5 py-2 flex items-start gap-2 transition-all text-xs ${currentStage === i ? "bg-cyan-600/20 border border-cyan-500/40" : "hover:bg-zinc-800/60 border border-transparent"}`}
                    >
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 mt-0.5 ${i === 0 ? "bg-zinc-700 text-zinc-300" : i === totalStages ? "bg-green-500/30 text-green-400" : currentStage === i ? "bg-cyan-500/30 text-cyan-400" : "bg-zinc-800 text-zinc-500"}`}>
                        {i}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-zinc-200">{i === 0 ? "Start" : i === totalStages ? "Final" : `Aligner ${i}`}</span>
                          {stage.activeTeeth.length > 0 && <span className="text-[10px] text-cyan-400">{stage.activeTeeth.length}t</span>}
                        </div>
                        <span className="text-zinc-600 text-[10px]">{stage.notes[0] ?? `Progress: ${(stage.progress * 100).toFixed(0)}%`}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          )}

          {/* REPORT PANEL */}
          {activePanel === "report" && (
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-4">
                {!report ? (
                  <div className="py-6 text-center text-xs text-zinc-500">No report yet. Load a treatment plan.</div>
                ) : (
                  <>
                    {/* Summary cards */}
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: "Aligners", value: report.totalAligners, color: "text-cyan-400" },
                        { label: "Duration", value: `${report.estimatedDurationMonths}mo`, color: "text-violet-400" },
                        { label: "Success", value: `${report.successProbability}%`, color: report.successProbability >= 85 ? "text-green-400" : "text-yellow-400" },
                        { label: "Refinement", value: `${report.refinementLikelihood}%`, color: report.refinementLikelihood > 40 ? "text-red-400" : "text-green-400" },
                      ].map(c => (
                        <div key={c.label} className="bg-zinc-900/60 rounded-lg p-2.5 text-center border border-zinc-800">
                          <div className={`text-lg font-bold ${c.color}`}>{c.value}</div>
                          <div className="text-[10px] text-zinc-500">{c.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Success bar */}
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-zinc-400">Success Probability</span>
                        <span className="text-green-400 font-bold">{report.successProbability}%</span>
                      </div>
                      <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all" style={{ width: `${report.successProbability}%` }} />
                      </div>
                    </div>

                    {/* Refinement bar */}
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-zinc-400">Refinement Likelihood</span>
                        <span className={`font-bold ${report.refinementLikelihood > 40 ? "text-red-400" : "text-green-400"}`}>{report.refinementLikelihood}%</span>
                      </div>
                      <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-red-500 transition-all" style={{ width: `${report.refinementLikelihood}%` }} />
                      </div>
                    </div>

                    {/* Per-tooth summary */}
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">Per-Tooth Movements</div>
                      <div className="space-y-1.5">
                        {report.perToothSummary.slice(0, 10).map(t => (
                          <div key={t.fdiNumber} className="flex items-center gap-2">
                            <div className="text-xs font-bold text-zinc-400 w-8">{t.fdiNumber}</div>
                            <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all"
                                style={{
                                  width: `${Math.min(100, (t.complexityScore / 10) * 100)}%`,
                                  background: COMPLEXITY_COLOR[t.complexity] ?? "#6b7280"
                                }} />
                            </div>
                            <div className="text-[10px] text-zinc-600 w-16 text-right">{t.totalTranslationMm}mm {t.maxRotationDeg}°</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Clinical notes */}
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 text-amber-400" />Clinical Notes
                      </div>
                      <div className="space-y-1.5">
                        {report.clinicalNotes.map((note, i) => (
                          <div key={i} className="flex items-start gap-1.5 text-[10px] text-zinc-400">
                            <div className="w-1 h-1 rounded-full bg-amber-400 mt-1 flex-shrink-0" />
                            {note}
                          </div>
                        ))}
                      </div>
                    </div>

                    <Button className="w-full h-7 text-xs bg-zinc-800 hover:bg-zinc-700 gap-1" onClick={downloadReport}>
                      <FileText className="h-3 w-3" />Download Full Report
                    </Button>
                    <Button
                      className="w-full h-7 text-xs bg-rose-900/60 hover:bg-rose-800/80 gap-1 border border-rose-700/40"
                      onClick={() => {
                        try {
                          const totalStages = stages.length;
                          const pdfStages: AlignerStageData[] = stages.map((s, i) => ({
                            stageNumber: i,
                            totalStages,
                            weeksWear: 2,
                            toothMovements: s.transforms.map(t => ({
                              fdi: t.fdiNumber,
                              label: String(t.fdiNumber),
                              tx: t.tx,
                              ty: t.ty,
                              tz: t.tz,
                              rx: t.rx,
                              ry: t.ry,
                              rz: t.rz,
                            })),
                          }));
                          const pdf = generateAlignerPDF(pdfStages);
                          pdf.save(`aligner-booklet-scan-${scanId}.pdf`);
                          toast({ title: "PDF Booklet downloaded" });
                        } catch (e) {
                          toast({ title: "PDF export failed", description: String(e), variant: "destructive" });
                        }
                      }}
                    >
                      <Download className="h-3 w-3" />PDF Booklet
                    </Button>
                  </>
                )}
              </div>
            </ScrollArea>
          )}

          {/* AI PANEL */}
          {activePanel === "ai" && (
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-400">AI Treatment Analysis</span>
                <Button variant="ghost" size="sm" className="h-5 text-xs text-violet-400" onClick={fetchAiAnalysis} disabled={aiLoading || !prediction}>
                  {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />}
                </Button>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-3">
                  {aiLoading && (
                    <div className="flex items-center gap-2 text-xs text-violet-400 mb-3">
                      <Loader2 className="h-3 w-3 animate-spin" />Generating AI analysis...
                    </div>
                  )}
                  {aiText ? (
                    <div className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap bg-zinc-900/60 rounded-lg p-3 border border-zinc-800">
                      {aiText}
                    </div>
                  ) : !aiLoading ? (
                    <div className="py-6 text-center space-y-3">
                      <Brain className="h-8 w-8 mx-auto text-violet-400/30" />
                      <p className="text-xs text-zinc-500">AI will analyze your treatment plan and provide clinical insights, risk assessment, and optimization recommendations.</p>
                      <Button className="w-full h-7 text-xs bg-violet-700 hover:bg-violet-600 gap-1" onClick={fetchAiAnalysis} disabled={!prediction}>
                        <Brain className="h-3 w-3" />Generate AI Analysis
                      </Button>
                    </div>
                  ) : null}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Bottom status */}
          <div className="border-t border-zinc-800 px-3 py-2 flex items-center justify-between text-xs text-zinc-600">
            <span>2 wks / aligner</span>
            {prediction && <span>{prediction.estimatedWeeks}wk estimated</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
