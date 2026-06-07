import { useEffect, useRef, useState, useCallback } from "react";
import { useRoute, Link, useLocation } from "wouter";
import * as THREE from "three";
import { OrbitControls } from "three-stdlib";
import { STLLoader, OBJLoader, PLYLoader } from "three-stdlib";
import { useGetScan, useGetScanAnalysis } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Brain, AlertTriangle, CheckCircle, Download, FileText,
  Loader2, Activity, ChevronRight, ZapIcon, ShieldAlert, BarChart3, Bot
} from "lucide-react";
import { runOrthoAnalysis, getSeverityBadgeClass, getSeverityColor, type OrthoAnalysisResult, type OrthoCondition, type Severity } from "@/lib/ortho-analysis-engine";
import { generateOrthoReportHTML } from "@/lib/ortho-report-generator";
import { runSegmentation, type ToothSegment } from "@/lib/segmentation-engine";
import { calculateMeasurements, type MeasurementSet } from "@/lib/measurement-engine";

const FDI_NAMES: Record<number, string> = {
  11:"UR Central", 12:"UR Lateral", 13:"UR Canine", 14:"UR 1st PM", 15:"UR 2nd PM", 16:"UR 1st Molar",
  21:"UL Central", 22:"UL Lateral", 23:"UL Canine", 24:"UL 1st PM", 25:"UL 2nd PM", 26:"UL 1st Molar",
  31:"LL Central", 32:"LL Lateral", 33:"LL Canine", 34:"LL 1st PM", 35:"LL 2nd PM", 36:"LL 1st Molar",
  41:"LR Central", 42:"LR Lateral", 43:"LR Canine", 44:"LR 1st PM", 45:"LR 2nd PM", 46:"LR 1st Molar",
};

function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${getSeverityBadgeClass(severity)}`}>
      {severity.toUpperCase()}
    </span>
  );
}

function ScoreMeter({ score, color }: { score: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-bold tabular-nums w-8" style={{ color }}>{score}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${(score / 10) * 100}%`, background: color }} />
      </div>
      <span className="text-xs text-muted-foreground">/10</span>
    </div>
  );
}

function ConditionCard({ condition, isSelected, onClick }: { condition: OrthoCondition; isSelected: boolean; onClick: () => void }) {
  const color = getSeverityColor(condition.severity);
  return (
    <div
      className={`cursor-pointer rounded-lg border p-3 transition-all ${isSelected ? "border-primary bg-primary/10" : "border-border hover:border-muted-foreground/50"}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-sm">{condition.name}</span>
        <SeverityBadge severity={condition.severity} />
      </div>
      <ScoreMeter score={condition.score} color={color} />
    </div>
  );
}

export default function OrthoAnalysis() {
  const [, params] = useRoute("/ortho-analysis/:scanId");
  const [, setLocation] = useLocation();
  const scanId = params?.scanId ? parseInt(params.scanId, 10) : 0;

  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const toothMeshesRef = useRef<THREE.Mesh[]>([]);
  const indicatorGroupRef = useRef<THREE.Group | null>(null);

  const { toast } = useToast();
  const [status, setStatus] = useState<"idle" | "loading" | "segmenting" | "analyzing" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [segments, setSegments] = useState<ToothSegment[]>([]);
  const [measurements, setMeasurements] = useState<MeasurementSet | null>(null);
  const [analysis, setAnalysis] = useState<OrthoAnalysisResult | null>(null);
  const [selectedCondition, setSelectedCondition] = useState<OrthoCondition | null>(null);
  const [activeTab, setActiveTab] = useState("summary");

  const { data: scanData } = useGetScan(scanId, { query: { enabled: !!scanId } });
  const { data: analysisData } = useGetScanAnalysis(scanId, { query: { enabled: !!scanId } });

  // Setup Three.js
  useEffect(() => {
    if (!mountRef.current) return;
    let animFrameId: number;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#080c14");
    sceneRef.current = scene;

    const w = mountRef.current.clientWidth;
    const h = mountRef.current.clientHeight;
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 2000);
    camera.position.set(0, 0, 150);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.innerHTML = "";
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const d1 = new THREE.DirectionalLight(0xffffff, 1);
    d1.position.set(1, 2, 2);
    scene.add(d1);
    const d2 = new THREE.DirectionalLight(0x8ecfff, 0.4);
    d2.position.set(-1, -1, -1);
    scene.add(d2);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    const handleResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    const animate = () => {
      animFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animFrameId);
      renderer.dispose();
    };
  }, []);

  // Restore from existing analysis
  useEffect(() => {
    if (analysisData?.status === "completed" && status === "idle") {
      const segs = analysisData.segmentationData as unknown as ToothSegment[];
      const meas = analysisData.measurementsData as unknown as MeasurementSet;
      if (segs && meas) {
        setSegments(segs);
        setMeasurements(meas);
        const result = runOrthoAnalysis(segs, meas);
        setAnalysis(result);
        setStatus("done");
      }
    }
  }, [analysisData, status]);

  const loadGeometry = async (): Promise<THREE.BufferGeometry> => {
    const response = await fetch(`/api/scans/${scanId}/file`, { credentials: "include" });
    if (!response.ok) throw new Error("Failed to load scan file");
    const buf = await response.arrayBuffer();
    let geo: THREE.BufferGeometry | null = null;
    if (scanData?.fileType === "stl") {
      geo = new STLLoader().parse(buf);
    } else if (scanData?.fileType === "obj") {
      const text = new TextDecoder().decode(buf);
      new OBJLoader().parse(text).traverse(c => { if (c instanceof THREE.Mesh && !geo) geo = c.geometry; });
    } else if (scanData?.fileType === "ply") {
      geo = new PLYLoader().parse(buf);
    }
    if (!geo) throw new Error("Cannot parse geometry");
    (geo as THREE.BufferGeometry).computeVertexNormals();
    (geo as THREE.BufferGeometry).center();
    return geo as THREE.BufferGeometry;
  };

  const handleRunAnalysis = async () => {
    if (!scanData) return;
    try {
      setStatus("loading");
      setProgress(5);
      setAnalysis(null);
      setSelectedCondition(null);

      // Clear scene
      const scene = sceneRef.current!;
      toothMeshesRef.current.forEach(m => scene.remove(m));
      toothMeshesRef.current = [];
      if (indicatorGroupRef.current) scene.remove(indicatorGroupRef.current);

      setStatus("segmenting");
      setProgress(10);
      const geo = await loadGeometry();

      const camera = cameraRef.current!;
      geo.computeBoundingSphere();
      const sphere = geo.boundingSphere!;
      camera.position.set(sphere.center.x, sphere.center.y, sphere.center.z + sphere.radius * 2.5);
      camera.lookAt(sphere.center);
      controlsRef.current?.target.copy(sphere.center);

      const segs = await runSegmentation(geo, (scanData.jawType as "upper" | "lower" | "both") ?? "both", p => setProgress(10 + p * 0.5));
      setSegments(segs);
      setProgress(65);

      // Render segmented teeth
      for (const seg of segs) {
        if (!seg.geometry) continue;
        const mat = new THREE.MeshPhongMaterial({ color: new THREE.Color(seg.color), transparent: true, opacity: 0.9, shininess: 60 });
        const mesh = new THREE.Mesh(seg.geometry, mat);
        mesh.userData.fdiNumber = seg.fdiNumber;
        scene.add(mesh);
        toothMeshesRef.current.push(mesh);
      }

      setStatus("analyzing");
      setProgress(75);

      const meas = calculateMeasurements(segs, []);
      setMeasurements(meas);
      setProgress(85);

      const result = runOrthoAnalysis(segs, meas);
      setAnalysis(result);

      // Add 3D visual indicators
      addVisualIndicators(result, segs, scene);

      setProgress(100);
      setStatus("done");
      toast({ title: "Analysis complete", description: `${result.conditions.filter(c => c.severity !== "none").length} conditions identified.` });
    } catch (err) {
      setStatus("error");
      toast({ title: "Analysis failed", description: (err as Error).message, variant: "destructive" });
    }
  };

  const addVisualIndicators = (result: OrthoAnalysisResult, segs: ToothSegment[], scene: THREE.Scene) => {
    const group = new THREE.Group();

    for (const condition of result.conditions) {
      if (condition.severity === "none" || condition.affectedTeeth.length === 0) continue;

      for (const fdi of condition.affectedTeeth) {
        const seg = segs.find(s => s.fdiNumber === fdi);
        if (!seg) continue;

        const color = new THREE.Color(condition.color);

        // Pulsing sphere indicator above tooth
        const sphereGeo = new THREE.SphereGeometry(1.5, 12, 12);
        const sphereMat = new THREE.MeshPhongMaterial({
          color,
          transparent: true,
          opacity: 0.6,
          emissive: color,
          emissiveIntensity: 0.3,
        });
        const sphere = new THREE.Mesh(sphereGeo, sphereMat);
        sphere.position.set(seg.centroidX, seg.centroidY + 8, seg.centroidZ);
        group.add(sphere);

        // Ring around tooth
        const ringGeo = new THREE.TorusGeometry(4, 0.4, 8, 24);
        const ringMat = new THREE.MeshPhongMaterial({ color, transparent: true, opacity: 0.5 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(seg.centroidX, seg.centroidY, seg.centroidZ);
        ring.rotation.x = Math.PI / 2;
        group.add(ring);
      }
    }

    indicatorGroupRef.current = group;
    scene.add(group);
  };

  const highlightCondition = useCallback((condition: OrthoCondition | null) => {
    setSelectedCondition(condition);
    toothMeshesRef.current.forEach(mesh => {
      const mat = mesh.material as THREE.MeshPhongMaterial;
      const fdi = mesh.userData.fdiNumber as number;
      if (!condition || condition.affectedTeeth.includes(fdi)) {
        mat.opacity = 0.9;
        mat.emissive.setHex(condition && condition.affectedTeeth.includes(fdi) ? 0x333333 : 0x000000);
      } else {
        mat.opacity = 0.15;
        mat.emissive.setHex(0x000000);
      }
    });
  }, []);

  const handleDownloadPDF = () => {
    if (!analysis || !measurements) return;
    const html = generateOrthoReportHTML({
      patientName: scanData?.fileName ? "Patient" : undefined,
      scanFileName: scanData?.fileName ?? "scan",
      jawType: (scanData?.jawType ?? "both"),
      segments,
      measurements,
      analysis,
      generatedAt: analysis.generatedAt,
    });
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ortho-analysis-${scanId}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeConditions = analysis?.conditions.filter(c => c.severity !== "none") ?? [];
  const severeCount = analysis?.conditions.filter(c => c.severity === "severe").length ?? 0;
  const moderateCount = analysis?.conditions.filter(c => c.severity === "moderate").length ?? 0;

  return (
    <Layout>
      <div className="flex flex-col h-[calc(100vh-4rem)] gap-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href={scanId ? `/cases` : `/cases`}><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Brain className="h-6 w-6 text-primary" /> Orthodontic Analysis
              </h1>
              <p className="text-muted-foreground text-sm">9-Point Clinical Assessment Engine</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {analysis && (
              <>
                <Button variant="outline" size="sm" onClick={handleDownloadPDF}>
                  <Download className="h-4 w-4 mr-1" /> PDF Report
                </Button>
                <Button size="sm" onClick={() => setLocation(`/ai-copilot/${scanId}`)}>
                  <Bot className="h-4 w-4 mr-1" /> AI Copilot
                </Button>
              </>
            )}
            <Button onClick={handleRunAnalysis} disabled={status === "loading" || status === "segmenting" || status === "analyzing" || !scanData}>
              {(status === "loading" || status === "segmenting" || status === "analyzing")
                ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />{status === "loading" ? "Loading..." : status === "segmenting" ? "Segmenting..." : "Analyzing..."}</>
                : <><Brain className="h-4 w-4 mr-1" />Run Analysis</>
              }
            </Button>
          </div>
        </div>

        {/* Progress */}
        {(status === "loading" || status === "segmenting" || status === "analyzing") && (
          <div className="mb-4 flex-shrink-0">
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {status === "loading" && "Loading 3D scan..."}
              {status === "segmenting" && `Segmenting teeth... ${progress}%`}
              {status === "analyzing" && "Running orthodontic analysis..."}
            </p>
          </div>
        )}

        {/* Main Layout */}
        <div className="flex gap-4 flex-1 min-h-0">
          {/* 3D Viewer */}
          <div className="w-1/2 flex flex-col gap-2">
            <div ref={mountRef} className="flex-1 rounded-xl border border-border overflow-hidden relative">
              {status === "idle" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                  <Brain className="h-12 w-12 mb-3 opacity-20" />
                  <p className="text-sm">Click "Run Analysis" to begin</p>
                  <p className="text-xs mt-1 opacity-60">9-point orthodontic assessment</p>
                </div>
              )}
            </div>
            {analysis && (
              <div className="grid grid-cols-3 gap-2">
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground">Severity</div>
                  <div className="font-bold text-lg" style={{ color: getSeverityColor(analysis.overallSeverity) }}>
                    {analysis.overallSeverity.toUpperCase()}
                  </div>
                </Card>
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground">Complexity</div>
                  <div className="font-bold text-sm capitalize">{analysis.treatmentComplexity.replace("_", " ")}</div>
                </Card>
                <Card className="p-3">
                  <div className="text-xs text-muted-foreground">Score</div>
                  <div className="font-bold text-lg">{analysis.complexityScore}<span className="text-xs text-muted-foreground">/10</span></div>
                </Card>
              </div>
            )}
          </div>

          {/* Analysis Panel */}
          <div className="w-1/2 flex flex-col min-h-0">
            {!analysis ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Activity className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Analysis results will appear here</p>
                </div>
              </div>
            ) : (
              <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
                <TabsList className="grid grid-cols-3 flex-shrink-0">
                  <TabsTrigger value="summary"><BarChart3 className="h-3 w-3 mr-1" />Summary</TabsTrigger>
                  <TabsTrigger value="conditions"><AlertTriangle className="h-3 w-3 mr-1" />Conditions</TabsTrigger>
                  <TabsTrigger value="complexity"><ZapIcon className="h-3 w-3 mr-1" />Complexity</TabsTrigger>
                </TabsList>

                {/* SUMMARY TAB */}
                <TabsContent value="summary" className="flex-1 overflow-hidden mt-2">
                  <ScrollArea className="h-full pr-2">
                    <div className="space-y-3">
                      <Card>
                        <CardContent className="p-4">
                          <p className="text-sm text-muted-foreground leading-relaxed">{analysis.summary}</p>
                        </CardContent>
                      </Card>

                      {/* KPI grid */}
                      <div className="grid grid-cols-2 gap-2">
                        <Card className="p-3 text-center">
                          <div className="text-2xl font-bold text-red-400">{severeCount}</div>
                          <div className="text-xs text-muted-foreground">Severe Conditions</div>
                        </Card>
                        <Card className="p-3 text-center">
                          <div className="text-2xl font-bold text-orange-400">{moderateCount}</div>
                          <div className="text-xs text-muted-foreground">Moderate Conditions</div>
                        </Card>
                        <Card className="p-3 text-center">
                          <div className="text-2xl font-bold text-primary">{activeConditions.length}</div>
                          <div className="text-xs text-muted-foreground">Active Issues</div>
                        </Card>
                        <Card className="p-3 text-center">
                          <div className="text-2xl font-bold text-green-400">{analysis.conditions.filter(c => c.severity === "none").length}</div>
                          <div className="text-xs text-muted-foreground">Normal</div>
                        </Card>
                      </div>

                      {/* Quick condition overview */}
                      <Card>
                        <CardHeader className="pb-2 pt-3 px-4">
                          <CardTitle className="text-sm">All Conditions</CardTitle>
                        </CardHeader>
                        <CardContent className="px-4 pb-3">
                          <div className="space-y-2">
                            {analysis.conditions.map(c => (
                              <div key={c.id} className="flex items-center justify-between">
                                <span className="text-sm">{c.name}</span>
                                <div className="flex items-center gap-2">
                                  <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div className="h-full rounded-full" style={{ width: `${c.score * 10}%`, background: getSeverityColor(c.severity) }} />
                                  </div>
                                  <SeverityBadge severity={c.severity} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* CONDITIONS TAB */}
                <TabsContent value="conditions" className="flex-1 overflow-hidden mt-2">
                  <div className="flex gap-3 h-full">
                    {/* Condition list */}
                    <div className="w-44 flex-shrink-0">
                      <ScrollArea className="h-full">
                        <div className="space-y-2 pr-1">
                          {analysis.conditions.map(c => (
                            <ConditionCard
                              key={c.id}
                              condition={c}
                              isSelected={selectedCondition?.id === c.id}
                              onClick={() => {
                                const next = selectedCondition?.id === c.id ? null : c;
                                highlightCondition(next);
                              }}
                            />
                          ))}
                        </div>
                      </ScrollArea>
                    </div>

                    {/* Detail panel */}
                    <div className="flex-1 min-w-0">
                      <ScrollArea className="h-full">
                        {selectedCondition ? (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <h3 className="font-bold text-lg">{selectedCondition.name}</h3>
                              <SeverityBadge severity={selectedCondition.severity} />
                            </div>

                            <ScoreMeter score={selectedCondition.score} color={getSeverityColor(selectedCondition.severity)} />

                            <Card>
                              <CardHeader className="pb-2 pt-3 px-4">
                                <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Clinical Findings</CardTitle>
                              </CardHeader>
                              <CardContent className="px-4 pb-3">
                                <p className="text-sm leading-relaxed">{selectedCondition.explanation}</p>
                              </CardContent>
                            </Card>

                            <Card className="border-orange-500/30 bg-orange-500/5">
                              <CardHeader className="pb-2 pt-3 px-4">
                                <CardTitle className="text-xs uppercase tracking-wide text-orange-400 flex items-center gap-1">
                                  <ShieldAlert className="h-3 w-3" /> Clinical Significance
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="px-4 pb-3">
                                <p className="text-sm leading-relaxed">{selectedCondition.clinicalSignificance}</p>
                              </CardContent>
                            </Card>

                            {selectedCondition.affectedTeeth.length > 0 && (
                              <Card>
                                <CardHeader className="pb-2 pt-3 px-4">
                                  <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Affected Teeth</CardTitle>
                                </CardHeader>
                                <CardContent className="px-4 pb-3">
                                  <div className="flex flex-wrap gap-1.5">
                                    {selectedCondition.affectedTeeth.slice(0, 12).map(fdi => (
                                      <span key={fdi} className="px-2 py-0.5 bg-primary/20 text-primary rounded text-xs font-bold">
                                        {fdi} <span className="text-muted-foreground font-normal">{FDI_NAMES[fdi] ? `· ${FDI_NAMES[fdi]}` : ""}</span>
                                      </span>
                                    ))}
                                  </div>
                                </CardContent>
                              </Card>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                            <CheckCircle className="h-8 w-8 mb-2 opacity-20" />
                            <p className="text-sm">Select a condition to view details</p>
                            <p className="text-xs mt-1 opacity-60">Click any condition card on the left</p>
                          </div>
                        )}
                      </ScrollArea>
                    </div>
                  </div>
                </TabsContent>

                {/* COMPLEXITY TAB */}
                <TabsContent value="complexity" className="flex-1 overflow-hidden mt-2">
                  <ScrollArea className="h-full pr-2">
                    <div className="space-y-3">
                      <Card>
                        <CardContent className="p-4 text-center">
                          <div className="text-4xl font-black mb-1" style={{ color: analysis.treatmentComplexity === "very_complex" ? "#ef4444" : analysis.treatmentComplexity === "complex" ? "#f97316" : analysis.treatmentComplexity === "moderate" ? "#eab308" : "#22c55e" }}>
                            {analysis.treatmentComplexity.replace("_", " ").toUpperCase()}
                          </div>
                          <div className="text-sm text-muted-foreground">Treatment Complexity</div>
                          <div className="mt-3">
                            <ScoreMeter score={analysis.complexityScore} color={getSeverityColor(analysis.overallSeverity)} />
                          </div>
                        </CardContent>
                      </Card>

                      {severeCount > 0 && (
                        <Card className="border-red-500/30 bg-red-500/5">
                          <CardHeader className="pb-2 pt-3 px-4">
                            <CardTitle className="text-sm text-red-400 flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4" /> Priority Issues (Severe)
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="px-4 pb-3 space-y-2">
                            {analysis.conditions.filter(c => c.severity === "severe").map(c => (
                              <div key={c.id} className="flex items-start gap-2">
                                <ChevronRight className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                                <div>
                                  <div className="text-sm font-semibold">{c.name}</div>
                                  <div className="text-xs text-muted-foreground">{c.clinicalSignificance.slice(0, 100)}...</div>
                                </div>
                              </div>
                            ))}
                          </CardContent>
                        </Card>
                      )}

                      {moderateCount > 0 && (
                        <Card className="border-orange-500/30 bg-orange-500/5">
                          <CardHeader className="pb-2 pt-3 px-4">
                            <CardTitle className="text-sm text-orange-400 flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4" /> Secondary Issues (Moderate)
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="px-4 pb-3 space-y-2">
                            {analysis.conditions.filter(c => c.severity === "moderate").map(c => (
                              <div key={c.id} className="flex items-start gap-2">
                                <ChevronRight className="h-4 w-4 text-orange-400 mt-0.5 flex-shrink-0" />
                                <div>
                                  <div className="text-sm font-semibold">{c.name}</div>
                                  <div className="text-xs text-muted-foreground">{c.clinicalSignificance.slice(0, 100)}...</div>
                                </div>
                              </div>
                            ))}
                          </CardContent>
                        </Card>
                      )}

                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-2">
                            <FileText className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              AI analysis is a clinical decision-support tool. Always confirm findings with physical examination, radiographs, and study models before initiating treatment.
                            </p>
                          </div>
                        </CardContent>
                      </Card>

                      <Button className="w-full" onClick={() => setLocation(`/ai-copilot/${scanId}`)}>
                        <Bot className="h-4 w-4 mr-2" /> Open AI Copilot for Treatment Planning
                      </Button>
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
