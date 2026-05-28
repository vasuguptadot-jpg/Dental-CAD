import { 
  useGetCase, 
  useUpdateCaseStatus, 
  useDeleteCase, 
  OrthoCaseStatus,
  type Scan
} from "@workspace/api-client-react";
import { MainLayout } from "@/components/layout/main-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { Loader2, ArrowLeft, Trash2, CheckCircle2, User, FileText, AlignLeft, Box, Brain, MapPin, Zap, Sparkles } from "lucide-react";
import { getGetCaseQueryKey, getListCasesQueryKey, getListScansQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { StatusBadge, statusLabels } from "@/components/ui/status-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { ScanList } from "@/components/scan-viewer/ScanList";
import { ScanUpload } from "@/components/scan-viewer/ScanUpload";
import { ScanViewer } from "@/components/scan-viewer/ScanViewer";
import { SegmentationViewer } from "@/components/segmentation/SegmentationViewer";
import type { ToothSegmentData } from "@/components/segmentation/types";
import { LandmarkViewer } from "@/components/landmarks/LandmarkViewer";
import type { ToothLandmark } from "@/components/landmarks/types";
import { AnalysisViewer } from "@/components/analysis/AnalysisViewer";
import type { OrthoAnalysis } from "@/components/analysis/types";
import { AICopilotPanel } from "@/components/ai-copilot/AICopilotPanel";

const STATUS_ORDER: OrthoCaseStatus[] = [
  "new",
  "scan_uploaded",
  "analysis_completed",
  "treatment_planning",
  "approved",
  "manufacturing"
];

export default function CaseDetail({ params }: { params: { id: string } }) {
  const caseId = parseInt(params.id, 10);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedScan, setSelectedScan] = useState<Scan | null>(null);
  const [scanViewTab, setScanViewTab] = useState<"viewer" | "segmentation" | "landmarks" | "analysis" | "ai-copilot">("viewer");
  const [segmentSaving, setSegmentSaving] = useState(false);
  const [savedSegmentsByScan, setSavedSegmentsByScan] = useState<Record<number, ToothSegmentData[]>>({});
  const [landmarkSaving, setLandmarkSaving] = useState(false);
  const [savedLandmarksByScan, setSavedLandmarksByScan] = useState<Record<number, ToothLandmark[]>>({});
  const [analysisSaving, setAnalysisSaving] = useState(false);
  const [savedAnalysisByScan, setSavedAnalysisByScan] = useState<Record<number, OrthoAnalysis | null>>({});

  const { data: orthoCase, isLoading } = useGetCase(caseId, {
    query: { enabled: !!caseId, queryKey: getGetCaseQueryKey(caseId) }
  });

  const deleteCase = useDeleteCase();
  const updateStatus = useUpdateCaseStatus();

  const handleDelete = () => {
    deleteCase.mutate({ id: caseId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCasesQueryKey() });
        if (orthoCase?.patientId) {
          setLocation(`/patients/${orthoCase.patientId}`);
        } else {
          setLocation("/cases");
        }
      }
    });
  };

  const handleStatusAdvance = (nextStatus: OrthoCaseStatus) => {
    updateStatus.mutate(
      { id: caseId, data: { status: nextStatus } },
      {
        onSuccess: (data) => {
          queryClient.setQueryData(getGetCaseQueryKey(caseId), data);
        }
      }
    );
  };

  const handleScanUploadSuccess = () => {
    queryClient.invalidateQueries({ queryKey: getListScansQueryKey({ caseId }) });
    if (orthoCase?.status === "new") {
      handleStatusAdvance("scan_uploaded");
    }
  };

  const handleSaveSegmentation = async (scanId: number, segments: ToothSegmentData[]) => {
    setSegmentSaving(true);
    try {
      const res = await fetch(`/api/scans/${scanId}/segments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ segments }),
      });
      if (!res.ok) throw new Error("Save failed");
      setSavedSegmentsByScan((prev) => ({ ...prev, [scanId]: segments }));
      toast({ title: "Segmentation saved", description: `${segments.length} tooth segments stored.` });
    } catch {
      toast({ title: "Save failed", description: "Could not save segmentation data.", variant: "destructive" });
    } finally {
      setSegmentSaving(false);
    }
  };

  const loadSegmentsForScan = async (scanId: number) => {
    if (savedSegmentsByScan[scanId] !== undefined) return;
    try {
      const res = await fetch(`/api/scans/${scanId}/segments`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setSavedSegmentsByScan((prev) => ({
          ...prev,
          [scanId]: Array.isArray(data) ? data : [],
        }));
      }
    } catch { /* ignore */ }
  };

  const loadLandmarksForScan = async (scanId: number) => {
    if (savedLandmarksByScan[scanId] !== undefined) return;
    try {
      const res = await fetch(`/api/scans/${scanId}/landmarks`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setSavedLandmarksByScan((prev) => ({
          ...prev,
          [scanId]: Array.isArray(data)
            ? data.map((row: Record<string, unknown>) => ({
                id: `${row.toothId}_${row.type}`,
                toothId: row.toothId as number,
                type: row.type as ToothLandmark["type"],
                position: row.position as ToothLandmark["position"],
                confidence: (row.confidence as number) ?? 100,
                isManual: !!(row.isManual),
              }))
            : [],
        }));
      }
    } catch { /* ignore */ }
  };

  const handleSaveLandmarks = async (scanId: number, landmarks: ToothLandmark[]) => {
    setLandmarkSaving(true);
    try {
      const res = await fetch(`/api/scans/${scanId}/landmarks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ landmarks }),
      });
      if (!res.ok) throw new Error("Save failed");
      setSavedLandmarksByScan((prev) => ({ ...prev, [scanId]: landmarks }));
      toast({ title: "Landmarks saved", description: `${landmarks.length} landmarks stored for this scan.` });
    } catch {
      toast({ title: "Save failed", description: "Could not save landmark data.", variant: "destructive" });
    } finally {
      setLandmarkSaving(false);
    }
  };

  const loadAnalysisForScan = async (scanId: number) => {
    if (savedAnalysisByScan[scanId] !== undefined) return;
    try {
      const res = await fetch(`/api/scans/${scanId}/analysis`, { credentials: "include" });
      if (res.ok) {
        const row = await res.json() as {
          findings: OrthoAnalysis["findings"];
          complexityScore: number;
          complexityLabel: OrthoAnalysis["complexityLabel"];
          summary: string;
          analyzedAt: string;
        };
        const analysis: OrthoAnalysis = {
          findings: row.findings,
          complexityScore: row.complexityScore,
          complexityLabel: row.complexityLabel,
          summary: row.summary,
          toothHealthMap: {},
          affectedToothCount: 0,
          analyzedAt: row.analyzedAt,
        };
        setSavedAnalysisByScan((prev) => ({ ...prev, [scanId]: analysis }));
      } else {
        setSavedAnalysisByScan((prev) => ({ ...prev, [scanId]: null }));
      }
    } catch {
      setSavedAnalysisByScan((prev) => ({ ...prev, [scanId]: null }));
    }
  };

  const handleSaveAnalysis = async (scanId: number, analysis: OrthoAnalysis) => {
    setAnalysisSaving(true);
    try {
      const res = await fetch(`/api/scans/${scanId}/analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          findings: analysis.findings,
          complexityScore: Math.round(analysis.complexityScore),
          complexityLabel: analysis.complexityLabel,
          summary: analysis.summary,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      setSavedAnalysisByScan((prev) => ({ ...prev, [scanId]: analysis }));
      toast({ title: "Analysis saved", description: `${analysis.findings.length} findings stored for this scan.` });
    } catch {
      toast({ title: "Save failed", description: "Could not save analysis.", variant: "destructive" });
    } finally {
      setAnalysisSaving(false);
    }
  };

  const handleSelectScan = (scan: Scan | null) => {
    setSelectedScan(scan);
    setScanViewTab("viewer");
    if (scan) {
      loadSegmentsForScan(scan.id);
      loadLandmarksForScan(scan.id);
      loadAnalysisForScan(scan.id);
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  if (!orthoCase) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold">Case not found</h2>
          <Button variant="link" onClick={() => setLocation("/cases")} className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Cases
          </Button>
        </div>
      </MainLayout>
    );
  }

  const currentStatusIndex = STATUS_ORDER.indexOf(orthoCase.status as OrthoCaseStatus);
  const nextStatus = currentStatusIndex < STATUS_ORDER.length - 1 ? STATUS_ORDER[currentStatusIndex + 1] : null;

  return (
    <MainLayout>
      <div className="space-y-6 pb-12">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{orthoCase.title || 'Untitled Case'}</h1>
              <StatusBadge status={orthoCase.status as OrthoCaseStatus} />
            </div>
            <p className="text-muted-foreground mt-1 flex items-center gap-2">
              <span className="font-mono text-sm px-2 py-0.5 bg-muted rounded-md">{orthoCase.caseCode}</span>
              <span>•</span>
              <span>Created {format(new Date(orthoCase.createdAt), "MMMM d, yyyy")}</span>
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive hover:text-destructive-foreground">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete this case record. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={deleteCase.isPending}
                  >
                    {deleteCase.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete Case"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            
            {nextStatus && (
              <Button 
                onClick={() => handleStatusAdvance(nextStatus)}
                disabled={updateStatus.isPending}
                className="bg-primary hover:bg-primary/90"
              >
                {updateStatus.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Advance to {statusLabels[nextStatus]}
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Card className="col-span-2">
            <CardHeader>
              <CardTitle>Case Progression</CardTitle>
              <CardDescription>Track treatment lifecycle stages</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative border-l border-muted-foreground/30 ml-4 pl-8 py-2 space-y-12">
                {STATUS_ORDER.map((status, index) => {
                  const isCompleted = index < currentStatusIndex;
                  const isCurrent = index === currentStatusIndex;
                  const isPending = index > currentStatusIndex;

                  return (
                    <div key={status} className="relative">
                      {/* Timeline dot */}
                      <div className={`absolute -left-[41px] top-1 h-5 w-5 rounded-full border-2 bg-background flex items-center justify-center
                        ${isCompleted ? 'border-primary bg-primary' : ''}
                        ${isCurrent ? 'border-primary border-4 shadow-sm' : ''}
                        ${isPending ? 'border-muted-foreground/30' : ''}
                      `}>
                        {isCompleted && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                      </div>
                      
                      <div>
                        <h4 className={`text-base font-semibold ${isPending ? 'text-muted-foreground' : 'text-foreground'}`}>
                          {statusLabels[status]}
                        </h4>
                        {isCurrent && (
                          <p className="text-sm text-muted-foreground mt-1">
                            Current active stage. {nextStatus ? `Ready to advance when complete.` : `Treatment plan finalized.`}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Patient Info</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium leading-none">
                      <Link href={`/patients/${orthoCase.patientId}`} className="hover:underline">
                        {orthoCase.patientName || `Patient #${orthoCase.patientId}`}
                      </Link>
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">View patient details</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Clinical Notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {orthoCase.description && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      Description
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap pl-6">
                      {orthoCase.description}
                    </p>
                  </div>
                )}
                
                {orthoCase.notes ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <AlignLeft className="h-4 w-4 text-muted-foreground" />
                      Notes
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap pl-6">
                      {orthoCase.notes}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No clinical notes recorded.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* 3D Scans Section */}
        <div className="space-y-4 mt-8 pt-8 border-t">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Box className="h-6 w-6 text-primary" />
              <h2 className="text-2xl font-bold tracking-tight">3D Scans</h2>
            </div>
            <ScanUpload 
              caseId={caseId} 
              patientId={orthoCase.patientId} 
              onSuccess={handleScanUploadSuccess} 
            />
          </div>

          <ScanList 
            caseId={caseId} 
            patientId={orthoCase.patientId} 
            selectedScanId={selectedScan?.id}
            onSelectScan={handleSelectScan} 
          />

          {selectedScan && (
            <Card className="overflow-hidden mt-6 shadow-md border-primary/20">
              <CardHeader className="bg-muted/30 pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {selectedScan.originalName ?? selectedScan.filename}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {selectedScan.jawType !== "unknown" && (
                        <span className="capitalize mr-2">{selectedScan.jawType} jaw •</span>
                      )}
                      Uploaded {format(new Date(selectedScan.createdAt), "MMMM d, yyyy")}
                    </CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleSelectScan(null)}>
                    Close
                  </Button>
                </div>

                <Tabs value={scanViewTab} onValueChange={(v) => setScanViewTab(v as "viewer" | "segmentation" | "landmarks" | "analysis" | "ai-copilot")} className="mt-3">
                  <TabsList className="h-8">
                    <TabsTrigger value="viewer" className="h-7 text-xs px-3 gap-1.5">
                      <Box className="h-3.5 w-3.5" />
                      3D Viewer
                    </TabsTrigger>
                    <TabsTrigger value="segmentation" className="h-7 text-xs px-3 gap-1.5">
                      <Brain className="h-3.5 w-3.5" />
                      AI Segmentation
                      {savedSegmentsByScan[selectedScan.id]?.length > 0 && (
                        <span className="ml-1 px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[10px] font-mono">
                          {savedSegmentsByScan[selectedScan.id].length}
                        </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="landmarks" className="h-7 text-xs px-3 gap-1.5">
                      <MapPin className="h-3.5 w-3.5" />
                      Landmarks
                      {savedLandmarksByScan[selectedScan.id]?.length > 0 && (
                        <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500 text-[10px] font-mono">
                          {savedLandmarksByScan[selectedScan.id].length}
                        </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="analysis" className="h-7 text-xs px-3 gap-1.5">
                      <Zap className="h-3.5 w-3.5" />
                      Analysis
                      {savedAnalysisByScan[selectedScan.id] != null && (
                        <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-mono ${
                          savedAnalysisByScan[selectedScan.id]!.complexityLabel === "low"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : savedAnalysisByScan[selectedScan.id]!.complexityLabel === "moderate"
                            ? "bg-amber-500/20 text-amber-400"
                            : "bg-rose-500/20 text-rose-400"
                        }`}>
                          {savedAnalysisByScan[selectedScan.id]!.complexityLabel}
                        </span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="ai-copilot" className="h-7 text-xs px-3 gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      AI Copilot
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </CardHeader>
              <CardContent className="p-0">
                {scanViewTab === "viewer" ? (
                  <ScanViewer
                    fileUrl={`/api/scans/${selectedScan.id}/file`}
                    fileType={selectedScan.fileType || selectedScan.filename.split('.').pop()?.toLowerCase() || 'stl'}
                  />
                ) : scanViewTab === "segmentation" ? (
                  <SegmentationViewer
                    key={selectedScan.id}
                    fileUrl={`/api/scans/${selectedScan.id}/file`}
                    fileType={selectedScan.fileType || selectedScan.filename.split('.').pop()?.toLowerCase() || 'stl'}
                    scanId={selectedScan.id}
                    jawType={selectedScan.jawType ?? "unknown"}
                    initialSegments={savedSegmentsByScan[selectedScan.id]?.length > 0 ? savedSegmentsByScan[selectedScan.id] : undefined}
                    onSave={(segments) => handleSaveSegmentation(selectedScan.id, segments)}
                    isSaving={segmentSaving}
                    hasSavedResults={(savedSegmentsByScan[selectedScan.id]?.length ?? 0) > 0}
                  />
                ) : scanViewTab === "landmarks" ? (
                  <div className="p-4">
                    <LandmarkViewer
                      key={`lm-${selectedScan.id}`}
                      fileUrl={`/api/scans/${selectedScan.id}/file`}
                      fileType={selectedScan.fileType || selectedScan.filename.split('.').pop()?.toLowerCase() || 'stl'}
                      scanId={selectedScan.id}
                      jawType={selectedScan.jawType ?? "unknown"}
                      scanName={selectedScan.originalName ?? selectedScan.filename}
                      segments={savedSegmentsByScan[selectedScan.id] ?? []}
                      initialLandmarks={savedLandmarksByScan[selectedScan.id]?.length > 0 ? savedLandmarksByScan[selectedScan.id] : undefined}
                      onSave={(landmarks) => handleSaveLandmarks(selectedScan.id, landmarks)}
                      isSaving={landmarkSaving}
                      hasSaved={(savedLandmarksByScan[selectedScan.id]?.length ?? 0) > 0}
                    />
                  </div>
                ) : scanViewTab === "analysis" ? (
                  <div className="p-4">
                    <AnalysisViewer
                      key={`analysis-${selectedScan.id}`}
                      fileUrl={`/api/scans/${selectedScan.id}/file`}
                      fileType={selectedScan.fileType || selectedScan.filename.split('.').pop()?.toLowerCase() || 'stl'}
                      scanId={selectedScan.id}
                      jawType={selectedScan.jawType ?? "unknown"}
                      scanName={selectedScan.originalName ?? selectedScan.filename}
                      segments={savedSegmentsByScan[selectedScan.id] ?? []}
                      landmarks={savedLandmarksByScan[selectedScan.id] ?? []}
                      initialAnalysis={savedAnalysisByScan[selectedScan.id] ?? null}
                      onSave={(analysis) => handleSaveAnalysis(selectedScan.id, analysis)}
                      isSaving={analysisSaving}
                      hasSaved={savedAnalysisByScan[selectedScan.id] != null}
                    />
                  </div>
                ) : (
                  <div className="p-4">
                    <AICopilotPanel
                      key={`ai-${caseId}`}
                      caseId={caseId}
                      selectedScan={selectedScan}
                      segments={savedSegmentsByScan[selectedScan.id] ?? []}
                      analysis={savedAnalysisByScan[selectedScan.id] ?? null}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
