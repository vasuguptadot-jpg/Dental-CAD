import { useEffect, useRef, useState, useCallback } from "react";
import { useRoute, Link } from "wouter";
import { ScanPicker } from "@/components/scan-picker";
import * as THREE from "three";
import { OrbitControls, STLLoader, OBJLoader, PLYLoader } from "three-stdlib";
import JSZip from "jszip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, Download, FileBox, Loader2, CheckCircle2, AlertTriangle,
  XCircle, Package, PackageCheck, Printer, Truck, Clock, Archive,
  BarChart3, Layers, RefreshCw, Info
} from "lucide-react";
import { generateStages } from "@/lib/aligner-staging-engine";
import type { AlignerStage } from "@/lib/aligner-staging-engine";
import type { ToothTransform } from "@/lib/tooth-movement-engine";
import {
  validateGeometry, geometryToSTLBuffer, geometryToOBJString, downloadBlob,
  loadProductionRecords, saveProductionRecords,
} from "@/lib/mesh-validation";
import type { ValidationResult, StageManufacturingRecord, ProductionStatus } from "@/lib/mesh-validation";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Types ────────────────────────────────────────────────────────────────────

type LoadState = "idle" | "loading" | "ready" | "error";

interface ScanMeta { id: number; fileName: string; fileType: string; originalName: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadTransformsFromStorage(scanId: number): ToothTransform[] | null {
  try {
    const raw = localStorage.getItem(`ortho_treatment_plan_${scanId}`);
    return raw ? (JSON.parse(raw) as ToothTransform[]) : null;
  } catch { return null; }
}

async function parseScanGeometry(blob: Blob, fileType: string): Promise<THREE.BufferGeometry> {
  const url = URL.createObjectURL(blob);
  try {
    if (fileType === "stl") {
      const loader = new STLLoader();
      return await new Promise<THREE.BufferGeometry>((res, rej) =>
        loader.load(url, res, undefined, rej));
    }
    if (fileType === "obj") {
      const loader = new OBJLoader();
      return await new Promise<THREE.BufferGeometry>((res, rej) =>
        loader.load(url, g => {
          const first = g.children[0] as THREE.Mesh;
          res((first?.geometry as THREE.BufferGeometry) ?? new THREE.BufferGeometry());
        }, undefined, rej));
    }
    if (fileType === "ply") {
      const loader = new PLYLoader();
      return await new Promise<THREE.BufferGeometry>((res, rej) =>
        loader.load(url, res, undefined, rej));
    }
    throw new Error("Unsupported file type: " + fileType);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ─── Stage Stats Helper ───────────────────────────────────────────────────────

function stageStats(stage: AlignerStage) {
  const RAD2DEG = 180 / Math.PI;
  const maxMm = stage.transforms.reduce((mx, t) => {
    const mm = Math.sqrt((t.tx ?? 0) ** 2 + (t.ty ?? 0) ** 2 + (t.tz ?? 0) ** 2);
    return Math.max(mx, mm);
  }, 0);
  const maxDeg = stage.transforms.reduce((mx, t) => {
    const deg = Math.max(Math.abs(t.rx ?? 0), Math.abs(t.ry ?? 0), Math.abs(t.rz ?? 0)) * RAD2DEG;
    return Math.max(mx, deg);
  }, 0);
  const phase: string = stage.progress < 0.33 ? "initial" : stage.progress < 0.67 ? "refinement" : "finishing";
  return {
    maxMovementMm: maxMm,
    maxRotationDeg: maxDeg,
    teethMoved: stage.activeTeeth.length,
    weeksWear: 2,
    phase,
  };
}

// ─── Status Display Config ────────────────────────────────────────────────────

const PRODUCTION_CONFIG: Record<ProductionStatus, { label: string; icon: React.ElementType; color: string; bg: string; }> = {
  planned:   { label: "Planned",   icon: Clock,        color: "text-zinc-400",    bg: "bg-zinc-500/10 border-zinc-500/30" },
  queued:    { label: "Queued",    icon: Package,       color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/30" },
  printing:  { label: "Printing",  icon: Printer,       color: "text-violet-400",  bg: "bg-violet-500/10 border-violet-500/30" },
  formed:    { label: "Formed",    icon: PackageCheck,  color: "text-cyan-400",    bg: "bg-cyan-500/10 border-cyan-500/30" },
  delivered: { label: "Delivered", icon: Truck,         color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" },
};
const PRODUCTION_ORDER: ProductionStatus[] = ["planned", "queued", "printing", "formed", "delivered"];

function QualityBadge({ v }: { v?: ValidationResult }) {
  if (!v) return <Badge variant="outline" className="text-[10px] text-zinc-500">Not validated</Badge>;
  const cfg = v.qualityGrade === "excellent" ? { cls: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10", icon: CheckCircle2 }
    : v.qualityGrade === "good" ? { cls: "text-cyan-400 border-cyan-500/30 bg-cyan-500/10", icon: CheckCircle2 }
    : v.qualityGrade === "acceptable" ? { cls: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10", icon: AlertTriangle }
    : { cls: "text-red-400 border-red-500/30 bg-red-500/10", icon: XCircle };
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`text-[10px] flex items-center gap-1 ${cfg.cls}`}>
      <Icon className="h-2.5 w-2.5" />
      {v.qualityScore}/100
    </Badge>
  );
}

function QualityGauge({ score }: { score: number }) {
  const r = 28, circumference = 2 * Math.PI * r;
  const dash = (score / 100) * circumference;
  const color = score >= 90 ? "#10b981" : score >= 70 ? "#06b6d4" : score >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex items-center justify-center">
      <svg width="72" height="72" className="-rotate-90">
        <circle cx="36" cy="36" r={r} fill="none" stroke="#27272a" strokeWidth="6" />
        <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${dash} ${circumference}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.5s ease" }} />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-lg font-bold" style={{ color }}>{score}</span>
        <span className="text-[9px] text-zinc-400">score</span>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Manufacturing() {
  const [, params] = useRoute("/manufacturing/:scanId");
  const scanId = params?.scanId ? parseInt(params.scanId, 10) : 0;

  if (!scanId) return (
    <ScanPicker
      targetPath="/manufacturing"
      title="Manufacturing"
      description="Aligner manufacturing pipeline, mesh validation, and export"
      Icon={Printer}
    />
  );

  // Load state
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [scanMeta, setScanMeta] = useState<ScanMeta | null>(null);
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [stages, setStages] = useState<AlignerStage[]>([]);
  const [noplan, setNoPlan] = useState(false);

  // Dashboard state
  const [selectedStage, setSelectedStage] = useState(1);
  const [validations, setValidations] = useState<Map<number, ValidationResult>>(new Map());
  const [production, setProduction] = useState<Map<number, StageManufacturingRecord>>(new Map());
  const [exportingStage, setExportingStage] = useState<number | null>(null);
  const [batchExporting, setBatchExporting] = useState(false);
  const [validatingAll, setValidatingAll] = useState(false);

  // Three.js refs
  const canvasRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const animFrameRef = useRef<number>(0);

  // ── Load scan on mount ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!scanId) return;
    setLoadState("loading");

    (async () => {
      try {
        // 1. Fetch scan metadata
        const metaRes = await fetch(`${BASE}/api/scans/${scanId}`, { credentials: "include" });
        if (!metaRes.ok) throw new Error("Could not fetch scan metadata");
        const meta: ScanMeta = await metaRes.json();
        setScanMeta(meta);

        // 2. Load scan file
        const fileRes = await fetch(`${BASE}/api/scans/${scanId}/file`, { credentials: "include" });
        if (!fileRes.ok) throw new Error("Could not fetch scan file");
        const blob = await fileRes.blob();
        const geo = await parseScanGeometry(blob, meta.fileType);

        if (!geo.attributes.normal) geo.computeVertexNormals();
        geo.center();
        setGeometry(geo);

        // 3. Load treatment plan
        const transforms = loadTransformsFromStorage(scanId);
        if (!transforms || transforms.length === 0) {
          setNoPlan(true);
          setLoadState("ready");
          return;
        }

        // 4. Generate stages
        const generated = generateStages(transforms);
        setStages(generated);

        // 5. Load production records
        const recs = loadProductionRecords(scanId);
        // Init any missing stages as "planned"
        const updated = new Map(recs);
        for (const st of generated) {
          if (!updated.has(st.stageNumber)) {
            updated.set(st.stageNumber, { stageNumber: st.stageNumber, productionStatus: "planned" });
          }
        }
        setProduction(updated);
        saveProductionRecords(scanId, updated);

        setLoadState("ready");
      } catch (err) {
        console.error(err);
        setLoadState("error");
      }
    })();
  }, [scanId]);

  // ── Validate a single stage ─────────────────────────────────────────────────

  const validateStage = useCallback((stageNum: number) => {
    if (!geometry) return;
    const result = validateGeometry(geometry);
    setValidations(prev => new Map(prev).set(stageNum, result));
  }, [geometry]);

  const validateAllStages = useCallback(async () => {
    if (!geometry || stages.length === 0) return;
    setValidatingAll(true);
    await new Promise(r => setTimeout(r, 50));
    const result = validateGeometry(geometry);
    const map = new Map<number, ValidationResult>();
    stages.forEach(s => map.set(s.stageNumber, result));
    setValidations(map);
    setValidatingAll(false);
  }, [geometry, stages]);

  // ── Export helpers ──────────────────────────────────────────────────────────

  const buildMetadataJSON = (stage: AlignerStage, scanName: string): string => {
    const ss = stageStats(stage);
    return JSON.stringify({
      generator: "OrthoVision Manufacturing Engine",
      generatedAt: new Date().toISOString(),
      scanFile: scanName,
      stageNumber: stage.stageNumber,
      totalStages: stages.length,
      phase: ss.phase,
      weeksWear: ss.weeksWear,
      teethMoved: ss.teethMoved,
      maxMovementMm: ss.maxMovementMm,
      maxRotationDeg: ss.maxRotationDeg,
      printingSpec: {
        material: "Dental-Grade Clear Resin",
        layerHeight: "0.05mm",
        infill: "100%",
        thermoformTemp: "75–85°C",
        sheetThickness: "0.75mm",
        notes: "Print inverted (gingival margin up) for best accuracy",
      },
      thermoforming: {
        cycle: `Stage ${stage.stageNumber} of ${stages.length}`,
        wearDuration: `${ss.weeksWear} weeks`,
        nextStage: stage.stageNumber < stages.length ? stage.stageNumber + 1 : null,
      },
    }, null, 2);
  };

  const exportStageSTL = useCallback(async (stageNum: number) => {
    if (!geometry) return;
    setExportingStage(stageNum);
    await new Promise(r => setTimeout(r, 80));
    try {
      const buf = geometryToSTLBuffer(geometry);
      const name = `${scanMeta?.originalName ?? "scan"}_stage_${String(stageNum).padStart(2, "0")}.stl`;
      downloadBlob(buf, name, "application/octet-stream");
    } finally { setExportingStage(null); }
  }, [geometry, scanMeta]);

  const exportStageOBJ = useCallback(async (stageNum: number) => {
    if (!geometry) return;
    setExportingStage(stageNum);
    await new Promise(r => setTimeout(r, 80));
    try {
      const objName = `stage_${String(stageNum).padStart(2, "0")}_model`;
      const text = geometryToOBJString(geometry, objName);
      const name = `${scanMeta?.originalName ?? "scan"}_${objName}.obj`;
      downloadBlob(text, name, "text/plain");
    } finally { setExportingStage(null); }
  }, [geometry, scanMeta]);

  const exportStageZIP = useCallback(async (stageNum: number) => {
    if (!geometry) return;
    const stage = stages.find(s => s.stageNumber === stageNum);
    if (!stage) return;
    setExportingStage(stageNum);
    try {
      const zip = new JSZip();
      const prefix = `stage_${String(stageNum).padStart(2, "0")}`;

      zip.file(`${prefix}_model.stl`, geometryToSTLBuffer(geometry));
      zip.file(`${prefix}_model.obj`, geometryToOBJString(geometry, `${prefix}_model`));
      zip.file(`${prefix}_metadata.json`, buildMetadataJSON(stage, scanMeta?.originalName ?? "scan"));

      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      downloadBlob(blob instanceof ArrayBuffer ? blob : await blob.arrayBuffer(), `${prefix}_package.zip`, "application/zip");
    } finally { setExportingStage(null); }
  }, [geometry, stages, scanMeta]);

  const exportAllStages = useCallback(async () => {
    if (!geometry || stages.length === 0) return;
    setBatchExporting(true);
    try {
      const zip = new JSZip();
      for (const stage of stages) {
        const prefix = `stage_${String(stage.stageNumber).padStart(2, "0")}`;
        zip.file(`${prefix}/${prefix}_model.stl`, geometryToSTLBuffer(geometry));
        zip.file(`${prefix}/${prefix}_model.obj`, geometryToOBJString(geometry, `${prefix}_model`));
        zip.file(`${prefix}/${prefix}_metadata.json`, buildMetadataJSON(stage, scanMeta?.originalName ?? "scan"));
      }
      zip.file("README.txt", [
        "OrthoVision Manufacturing Package",
        `Generated: ${new Date().toISOString()}`,
        `Scan: ${scanMeta?.originalName ?? "scan"}`,
        `Total Stages: ${stages.length}`,
        "",
        "Each stage folder contains:",
        "  - STL file (for 3D printing thermoforming model)",
        "  - OBJ file (alternative format)",
        "  - JSON metadata (stage info, tooth movements, print spec)",
        "",
        "Print Settings:",
        "  Material: Dental-Grade Clear Resin",
        "  Layer Height: 0.05mm | Infill: 100%",
        "  Thermoform Sheet: 0.75mm clear aligner material",
        "  Thermoform Temp: 75-85°C",
      ].join("\n"));

      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      downloadBlob(blob instanceof ArrayBuffer ? blob : await blob.arrayBuffer(),
        `aligners_all_${stages.length}_stages.zip`, "application/zip");
    } finally { setBatchExporting(false); }
  }, [geometry, stages, scanMeta]);

  // ── Update production status ────────────────────────────────────────────────

  const updateStatus = useCallback((stageNum: number, status: ProductionStatus) => {
    setProduction(prev => {
      const next = new Map(prev);
      const existing = next.get(stageNum) ?? { stageNumber: stageNum, productionStatus: "planned" };
      const now = new Date().toISOString();
      const updated: StageManufacturingRecord = {
        ...existing, productionStatus: status,
        ...(status === "queued" && { queuedAt: now }),
        ...(status === "printing" && { printedAt: now }),
        ...(status === "formed" && { formedAt: now }),
        ...(status === "delivered" && { deliveredAt: now }),
      };
      next.set(stageNum, updated);
      saveProductionRecords(scanId, next);
      return next;
    });
  }, [scanId]);

  // ── Three.js Setup ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!canvasRef.current || !geometry) return;
    const el = canvasRef.current;
    const w = el.clientWidth, h = el.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f0f12);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
    camera.position.set(0, 40, 100);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
    el.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controlsRef.current = controls;

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(50, 80, 60);
    scene.add(dir);
    const dir2 = new THREE.DirectionalLight(0x80aaff, 0.5);
    dir2.position.set(-50, -20, -60);
    scene.add(dir2);

    // Grid
    const grid = new THREE.GridHelper(200, 30, 0x222244, 0x1a1a2e);
    grid.position.y = -20;
    scene.add(grid);

    // Mesh
    const mat = new THREE.MeshStandardMaterial({ color: 0xe8d5b0, roughness: 0.4, metalness: 0.1 });
    const mesh = new THREE.Mesh(geometry, mat);
    scene.add(mesh);
    meshRef.current = mesh;

    // Fit camera
    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    camera.position.copy(center.clone().add(new THREE.Vector3(0, size * 0.3, size * 1.2)));
    controls.target.copy(center);
    controls.update();

    // Animate
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize
    const onResize = () => {
      const nw = el.clientWidth, nh = el.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [geometry]);

  // ── Computed Values ─────────────────────────────────────────────────────────

  const selectedStageData = stages.find(s => s.stageNumber === selectedStage);
  const selectedValidation = validations.get(selectedStage);
  const selectedRecord = production.get(selectedStage);
  const prodStatusCounts = PRODUCTION_ORDER.reduce((acc, s) => {
    acc[s] = Array.from(production.values()).filter(r => r.productionStatus === s).length;
    return acc;
  }, {} as Record<ProductionStatus, number>);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-[#0c0c0f] text-foreground overflow-hidden">

      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-card/50 backdrop-blur flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link href={scanMeta ? `/aligner-staging/${scanId}` : "/cases"}>
            <Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-sm font-bold flex items-center gap-2">
              <Printer className="h-4 w-4 text-cyan-400" />
              Aligner Manufacturing
            </h1>
            <p className="text-xs text-muted-foreground">
              {scanMeta?.originalName ?? "Loading scan..."} — {stages.length} stage{stages.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {stages.length > 0 && (
            <>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8"
                onClick={validateAllStages} disabled={!geometry || validatingAll}>
                {validatingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Validate All
              </Button>
              <Button size="sm" className="gap-1.5 text-xs h-8 bg-cyan-600 hover:bg-cyan-500"
                onClick={exportAllStages} disabled={batchExporting || !geometry}>
                {batchExporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Archive className="h-3 w-3" />}
                {batchExporting ? "Packing..." : `Export All ${stages.length} Stages`}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Loading ── */}
      {loadState === "loading" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-cyan-400" />
          <p className="text-sm text-muted-foreground">Loading scan and preparing manufacturing dashboard…</p>
        </div>
      )}

      {loadState === "error" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <XCircle className="h-10 w-10 text-red-400" />
          <p className="text-sm text-muted-foreground">Failed to load scan. Check that the scan ID is valid.</p>
          <Link href="/cases"><Button variant="outline" size="sm">← Back to Cases</Button></Link>
        </div>
      )}

      {loadState === "ready" && noplan && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
          <Info className="h-12 w-12 text-yellow-400 opacity-60" />
          <h2 className="text-lg font-semibold">No Treatment Plan Found</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            A saved treatment plan is required before manufacturing. Open the Treatment Planner,
            configure tooth movements, and click "Stage Aligners" to generate the plan.
          </p>
          <Link href={`/treatment-planner/${scanId}`}>
            <Button className="gap-2"><Layers className="h-4 w-4" /> Open Treatment Planner</Button>
          </Link>
        </div>
      )}

      {loadState === "ready" && !noplan && stages.length > 0 && (
        <div className="flex flex-1 overflow-hidden">

          {/* ── Left: Stage List ── */}
          <div className="w-[220px] flex-shrink-0 border-r border-border/50 flex flex-col bg-card/30">
            {/* Summary stats */}
            <div className="p-3 border-b border-border/50">
              <div className="grid grid-cols-2 gap-2 text-center">
                {PRODUCTION_ORDER.slice(0, 4).map(status => {
                  const cfg = PRODUCTION_CONFIG[status];
                  const Icon = cfg.icon;
                  return (
                    <div key={status} className={`rounded-md p-1.5 border ${cfg.bg}`}>
                      <div className="flex items-center justify-center gap-1">
                        <Icon className={`h-3 w-3 ${cfg.color}`} />
                        <span className={`text-xs font-bold ${cfg.color}`}>{prodStatusCounts[status]}</span>
                      </div>
                      <p className="text-[9px] text-muted-foreground mt-0.5">{cfg.label}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {stages.map(stage => {
                  const rec = production.get(stage.stageNumber);
                  const val = validations.get(stage.stageNumber);
                  const pCfg = PRODUCTION_CONFIG[rec?.productionStatus ?? "planned"];
                  const PIcon = pCfg.icon;
                  const isSelected = stage.stageNumber === selectedStage;

                  return (
                    <button key={stage.stageNumber}
                      onClick={() => {
                        setSelectedStage(stage.stageNumber);
                        if (!val) validateStage(stage.stageNumber);
                      }}
                      className={`w-full text-left rounded-md p-2.5 transition-all border ${
                        isSelected
                          ? "bg-cyan-500/10 border-cyan-500/40 text-cyan-300"
                          : "border-transparent hover:border-border/60 hover:bg-muted/30 text-muted-foreground hover:text-foreground"
                      }`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold">Stage {stage.stageNumber}</span>
                        <PIcon className={`h-3 w-3 ${pCfg.color}`} />
                      </div>
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border ${pCfg.bg} ${pCfg.color} font-medium`}>
                          {pCfg.label}
                        </span>
                        {val && (
                          <span className={`text-[9px] font-bold ${
                            val.qualityScore >= 90 ? "text-emerald-400" :
                            val.qualityScore >= 70 ? "text-cyan-400" :
                            val.qualityScore >= 50 ? "text-yellow-400" : "text-red-400"
                          }`}>{val.qualityScore}%</span>
                        )}
                      </div>
                      <div className="flex gap-0.5 mt-1.5">
                        {Array.from({ length: 5 }, (_, i) => (
                          <div key={i} className={`h-1 flex-1 rounded-full ${
                            i < PRODUCTION_ORDER.indexOf(rec?.productionStatus ?? "planned") + 1
                              ? "bg-cyan-500" : "bg-zinc-700"
                          }`} />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {/* ── Center: 3D Preview ── */}
          <div className="flex-1 relative overflow-hidden">
            <div ref={canvasRef} className="absolute inset-0" />

            {/* Stage overlay */}
            <div className="absolute top-4 left-4 bg-black/60 backdrop-blur rounded-lg px-3 py-2 pointer-events-none">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-sm font-semibold text-cyan-300">Stage {selectedStage} of {stages.length}</span>
              </div>
              {selectedStageData && (() => {
                const ss = stageStats(selectedStageData);
                return (
                  <div className="text-xs text-zinc-400 mt-1 space-y-0.5">
                    <div>Phase: <span className="text-zinc-200 capitalize">{ss.phase}</span></div>
                    <div>Teeth moved: <span className="text-zinc-200">{ss.teethMoved}</span></div>
                    <div>Max movement: <span className="text-zinc-200">{ss.maxMovementMm.toFixed(2)}mm</span></div>
                  </div>
                );
              })()}
            </div>

            {/* Validation overlay */}
            {selectedValidation && (
              <div className="absolute top-4 right-4 bg-black/60 backdrop-blur rounded-lg px-3 py-2 pointer-events-none max-w-[200px]">
                <div className="text-xs font-semibold text-zinc-200 mb-1.5">Mesh Quality</div>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <QualityGauge score={selectedValidation.qualityScore} />
                  </div>
                  <div className="text-xs space-y-0.5 text-zinc-400">
                    <div>Vertices: <span className="text-zinc-200">{selectedValidation.vertexCount.toLocaleString()}</span></div>
                    <div>Faces: <span className="text-zinc-200">{selectedValidation.faceCount.toLocaleString()}</span></div>
                    <div>Closed: <span className={selectedValidation.isClosed ? "text-emerald-400" : "text-yellow-400"}>{selectedValidation.isClosed ? "Yes" : "No"}</span></div>
                  </div>
                </div>
                {selectedValidation.issues.length > 0 && (
                  <div className="mt-1.5 text-[10px] text-red-400">
                    {selectedValidation.issues[0]}
                  </div>
                )}
              </div>
            )}

            {/* Bottom controls hint */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-zinc-600 pointer-events-none">
              Drag to rotate · Scroll to zoom · Right-drag to pan
            </div>
          </div>

          {/* ── Right: Detail Panel ── */}
          <div className="w-[280px] flex-shrink-0 border-l border-border/50 flex flex-col bg-card/30">
            <Tabs defaultValue="export" className="flex-1 flex flex-col">
              <TabsList className="w-full rounded-none border-b border-border/50 bg-transparent h-10 px-2 gap-1">
                <TabsTrigger value="export" className="flex-1 text-xs h-8 gap-1"><Download className="h-3 w-3" />Export</TabsTrigger>
                <TabsTrigger value="production" className="flex-1 text-xs h-8 gap-1"><Printer className="h-3 w-3" />Production</TabsTrigger>
                <TabsTrigger value="details" className="flex-1 text-xs h-8 gap-1"><BarChart3 className="h-3 w-3" />Details</TabsTrigger>
              </TabsList>

              {/* Export Tab */}
              <TabsContent value="export" className="flex-1 overflow-auto p-3 space-y-4">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Stage {selectedStage} — Single Export</p>

                  <div className="space-y-2">
                    <Button variant="outline" size="sm" className="w-full justify-start gap-2 text-xs h-9"
                      onClick={() => exportStageSTL(selectedStage)}
                      disabled={!geometry || exportingStage === selectedStage}>
                      {exportingStage === selectedStage ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileBox className="h-3 w-3 text-cyan-400" />}
                      Export STL
                      <span className="ml-auto text-muted-foreground">3D Print</span>
                    </Button>

                    <Button variant="outline" size="sm" className="w-full justify-start gap-2 text-xs h-9"
                      onClick={() => exportStageOBJ(selectedStage)}
                      disabled={!geometry || exportingStage === selectedStage}>
                      {exportingStage === selectedStage ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileBox className="h-3 w-3 text-violet-400" />}
                      Export OBJ
                      <span className="ml-auto text-muted-foreground">CAD/CAM</span>
                    </Button>

                    <Button variant="outline" size="sm" className="w-full justify-start gap-2 text-xs h-9"
                      onClick={() => exportStageZIP(selectedStage)}
                      disabled={!geometry || exportingStage === selectedStage}>
                      {exportingStage === selectedStage ? <Loader2 className="h-3 w-3 animate-spin" /> : <Package className="h-3 w-3 text-emerald-400" />}
                      Export Package
                      <span className="ml-auto text-muted-foreground">STL+OBJ+JSON</span>
                    </Button>
                  </div>
                </div>

                <div className="border-t border-border/50 pt-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Batch Export</p>
                  <Button size="sm" className="w-full gap-2 text-xs bg-cyan-600 hover:bg-cyan-500"
                    onClick={exportAllStages} disabled={batchExporting || !geometry}>
                    {batchExporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Archive className="h-3 w-3" />}
                    {batchExporting ? "Generating ZIP…" : `All ${stages.length} Stages as ZIP`}
                  </Button>
                  <p className="text-[10px] text-muted-foreground mt-2 text-center">
                    Each stage folder contains STL, OBJ, and metadata.json
                  </p>
                </div>

                <div className="border-t border-border/50 pt-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Mesh Validation</p>
                  <div className="flex items-center justify-between">
                    <QualityBadge v={selectedValidation} />
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1"
                      onClick={() => validateStage(selectedStage)} disabled={!geometry}>
                      <RefreshCw className="h-3 w-3" /> Run
                    </Button>
                  </div>
                  {selectedValidation && (
                    <div className="mt-2 space-y-1">
                      {selectedValidation.issues.map((iss, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-[10px] text-red-400">
                          <XCircle className="h-2.5 w-2.5 mt-0.5 flex-shrink-0" />{iss}
                        </div>
                      ))}
                      {selectedValidation.warnings.map((w, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-[10px] text-yellow-400">
                          <AlertTriangle className="h-2.5 w-2.5 mt-0.5 flex-shrink-0" />{w}
                        </div>
                      ))}
                      {selectedValidation.issues.length === 0 && selectedValidation.warnings.length === 0 && (
                        <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
                          <CheckCircle2 className="h-2.5 w-2.5 flex-shrink-0" />Model ready for manufacturing
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Print spec */}
                <div className="border-t border-border/50 pt-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Print Specification</p>
                  <div className="space-y-1.5 text-[10px] text-muted-foreground">
                    {[
                      ["Material", "Dental-Grade Clear Resin"],
                      ["Layer Height", "0.05 mm"],
                      ["Infill", "100% (solid)"],
                      ["Sheet Thickness", "0.75 mm clear aligner"],
                      ["Thermoform Temp", "75 – 85°C"],
                      ["Orientation", "Gingival margin facing up"],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <span>{k}</span><span className="text-zinc-300">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              {/* Production Tab */}
              <TabsContent value="production" className="flex-1 overflow-auto p-3 space-y-4">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Stage {selectedStage} Status
                  </p>
                  <div className="space-y-2">
                    {PRODUCTION_ORDER.map((status, i) => {
                      const cfg = PRODUCTION_CONFIG[status];
                      const Icon = cfg.icon;
                      const isActive = selectedRecord?.productionStatus === status;
                      const currentIdx = PRODUCTION_ORDER.indexOf(selectedRecord?.productionStatus ?? "planned");
                      const isPast = i < currentIdx;

                      return (
                        <button key={status} onClick={() => updateStatus(selectedStage, status)}
                          className={`w-full flex items-center gap-3 p-2.5 rounded-lg border transition-all text-left ${
                            isActive ? `${cfg.bg} border-current` : isPast ? "border-border/30 bg-muted/10 opacity-60" : "border-border/40 hover:bg-muted/20"
                          }`}>
                          <div className={`p-1.5 rounded-md ${isActive ? cfg.bg : "bg-muted/30"}`}>
                            <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                          </div>
                          <div className="flex-1">
                            <p className={`text-xs font-medium ${isActive ? cfg.color : "text-foreground"}`}>{cfg.label}</p>
                            {isActive && selectedRecord && (
                              <p className="text-[10px] text-muted-foreground">Current status</p>
                            )}
                          </div>
                          {isActive && <CheckCircle2 className={`h-3.5 w-3.5 ${cfg.color}`} />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t border-border/50 pt-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">All Stages Overview</p>
                  <div className="space-y-1.5">
                    {PRODUCTION_ORDER.map(status => {
                      const cfg = PRODUCTION_CONFIG[status];
                      const count = prodStatusCounts[status];
                      const pct = stages.length > 0 ? Math.round((count / stages.length) * 100) : 0;
                      return (
                        <div key={status}>
                          <div className="flex justify-between text-[10px] mb-0.5">
                            <span className={cfg.color}>{cfg.label}</span>
                            <span className="text-muted-foreground">{count}/{stages.length}</span>
                          </div>
                          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all`} style={{ width: `${pct}%`, background: cfg.color.replace("text-", "") === cfg.color ? "#06b6d4" : "#06b6d4" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </TabsContent>

              {/* Details Tab */}
              <TabsContent value="details" className="flex-1 overflow-auto p-3 space-y-3">
                {selectedStageData ? (
                  <>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Stage Details</p>
                      <div className="space-y-1.5 text-xs">
                        {(() => {
                          const ss = stageStats(selectedStageData);
                          return [
                            ["Stage", `${selectedStageData.stageNumber} of ${stages.length}`],
                            ["Phase", ss.phase],
                            ["Wear Duration", `${ss.weeksWear} weeks`],
                            ["Teeth Moved", String(ss.teethMoved)],
                            ["Max Translation", `${ss.maxMovementMm.toFixed(2)} mm`],
                            ["Max Rotation", `${ss.maxRotationDeg.toFixed(1)}°`],
                          ];
                        })().map(([k, v]) => (
                          <div key={k} className="flex justify-between">
                            <span className="text-muted-foreground">{k}</span>
                            <span className="font-medium capitalize">{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {selectedValidation && (
                      <div className="border-t border-border/50 pt-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Geometry Stats</p>
                        <div className="flex items-center gap-3 mb-3">
                          <div className="relative">
                            <QualityGauge score={selectedValidation.qualityScore} />
                          </div>
                          <div>
                            <p className="text-xs font-bold capitalize">{selectedValidation.qualityGrade}</p>
                            <p className="text-[10px] text-muted-foreground">{selectedValidation.isValid ? "✓ Valid for export" : "⚠ Issues found"}</p>
                          </div>
                        </div>
                        <div className="space-y-1 text-xs">
                          {[
                            ["Vertices", selectedValidation.vertexCount.toLocaleString()],
                            ["Faces (triangles)", selectedValidation.faceCount.toLocaleString()],
                            ["Unique Edges", selectedValidation.edgeCount.toLocaleString()],
                            ["Boundary Edges", String(selectedValidation.boundaryEdges)],
                            ["Non-Manifold Edges", String(selectedValidation.nonManifoldEdges)],
                            ["Closed Mesh", selectedValidation.isClosed ? "Yes" : "No"],
                          ].map(([k, v]) => (
                            <div key={k} className="flex justify-between">
                              <span className="text-muted-foreground">{k}</span><span className="font-medium">{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="border-t border-border/50 pt-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Thermoforming Prep</p>
                      <div className="space-y-1.5 text-[10px] text-muted-foreground">
                        <div className="p-2 rounded bg-muted/20 border border-border/40">
                          <p className="text-zinc-300 font-medium mb-1">Readiness Checklist</p>
                          {[
                            [selectedValidation ? selectedValidation.isValid : null, "Mesh validated"],
                            [!!selectedValidation?.hasNormals, "Vertex normals present"],
                            [selectedValidation ? selectedValidation.faceCount > 1000 : null, "Sufficient polygon density"],
                            [selectedValidation ? selectedValidation.boundaryEdges < 50 : null, "No major holes"],
                          ].map(([ok, label], i) => (
                            <div key={i} className={`flex items-center gap-1.5 ${ok === null ? "text-zinc-500" : ok ? "text-emerald-400" : "text-yellow-400"}`}>
                              {ok === null ? "○" : ok ? "✓" : "⚠"} {label as string}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-8">Select a stage to view details</p>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}
    </div>
  );
}
