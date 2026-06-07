import { useState, useRef } from "react";
import { useRoute, Link } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Upload, CheckCircle2, TrendingUp, TrendingDown, Minus, Calendar, FileText, Camera } from "lucide-react";
import { useListScans, useGetCase } from "@workspace/api-client-react";
import { ToothChart } from "@/components/tooth-chart";

interface VisitRecord {
  id: string;
  date: string;
  stage: number;
  compliance: number;
  notes: string;
  movements: Record<number, { planned: number; achieved: number }>;
}

const MOCK_VISITS: VisitRecord[] = [
  {
    id: "v1",
    date: "2026-03-15",
    stage: 4,
    compliance: 92,
    notes: "Good cooperation. Patient wearing aligners 22h/day.",
    movements: {
      11: { planned: 1.2, achieved: 1.1 },
      21: { planned: 1.2, achieved: 1.0 },
      12: { planned: 0.8, achieved: 0.8 },
      22: { planned: 0.8, achieved: 0.7 },
      13: { planned: 0.5, achieved: 0.5 },
    },
  },
  {
    id: "v2",
    date: "2026-04-20",
    stage: 8,
    compliance: 78,
    notes: "Slight tracking issue on UR2. Prescribed attachment refinement.",
    movements: {
      11: { planned: 2.4, achieved: 2.1 },
      21: { planned: 2.4, achieved: 2.2 },
      12: { planned: 1.6, achieved: 1.3 },
      22: { planned: 1.6, achieved: 1.4 },
      13: { planned: 1.0, achieved: 0.9 },
      14: { planned: 0.5, achieved: 0.4 },
    },
  },
];

function ComplianceBadge({ pct }: { pct: number }) {
  if (pct >= 85) return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">{pct}% Compliant</Badge>;
  if (pct >= 70) return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">{pct}% Moderate</Badge>;
  return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">{pct}% Low Compliance</Badge>;
}

function MovementDiff({ planned, achieved }: { planned: number; achieved: number }) {
  const diff = achieved - planned;
  const pct = planned > 0 ? (achieved / planned) * 100 : 100;
  if (diff >= 0) return (
    <div className="flex items-center gap-1 text-emerald-400 text-xs">
      <CheckCircle2 className="h-3.5 w-3.5" /> {achieved.toFixed(1)}/{planned.toFixed(1)}mm ({pct.toFixed(0)}%)
    </div>
  );
  return (
    <div className="flex items-center gap-1 text-amber-400 text-xs">
      <TrendingDown className="h-3.5 w-3.5" /> {achieved.toFixed(1)}/{planned.toFixed(1)}mm ({pct.toFixed(0)}%)
    </div>
  );
}

export default function ProgressTracker() {
  const [, params] = useRoute("/progress/:caseId");
  const caseId = params?.caseId ? parseInt(params.caseId, 10) : 0;

  const { data: caseData } = useGetCase(caseId, { query: { enabled: !!caseId } });
  const { data: scans } = useListScans(caseId, { query: { enabled: !!caseId } });

  const [selectedVisit, setSelectedVisit] = useState<VisitRecord | null>(MOCK_VISITS[1]);
  const [selectedFdi, setSelectedFdi] = useState<number | null>(null);
  const [showAddVisit, setShowAddVisit] = useState(false);
  const [newNotes, setNewNotes] = useState("");
  const [newCompliance, setNewCompliance] = useState("90");
  const [newStage, setNewStage] = useState("1");

  const highlightedFdis: Record<number, string> = {};
  if (selectedVisit) {
    Object.entries(selectedVisit.movements).forEach(([fdiStr, mov]) => {
      const fdi = parseInt(fdiStr);
      const pct = mov.planned > 0 ? mov.achieved / mov.planned : 1;
      highlightedFdis[fdi] = pct >= 0.9 ? "#22c55e" : pct >= 0.7 ? "#f59e0b" : "#ef4444";
    });
  }

  return (
    <Layout>
      <div className="space-y-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-4">
          {caseId ? (
            <Link href={`/cases/${caseId}`}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
          ) : null}
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Treatment Progress</h1>
            <p className="text-muted-foreground">
              {caseData ? `${caseData.title} — ${caseData.patientName}` : "Track actual vs planned tooth movements per visit."}
            </p>
          </div>
          <div className="flex-1" />
          <Button size="sm" onClick={() => setShowAddVisit(true)} className="gap-2">
            <Camera className="h-4 w-4" /> Log Visit
          </Button>
        </div>

        <Alert>
          <AlertDescription className="text-sm">
            Color coding: <span className="text-emerald-400 font-medium">Green ≥90%</span> planned movement achieved · <span className="text-amber-400 font-medium">Yellow 70-89%</span> slight tracking issue · <span className="text-red-400 font-medium">Red &lt;70%</span> tracking failure — consider refinement.
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Visit list */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Follow-up Visits</p>
            {MOCK_VISITS.map(visit => (
              <Card
                key={visit.id}
                className={`cursor-pointer transition-all ${selectedVisit?.id === visit.id ? "border-primary/50 bg-primary/5" : "hover:border-border/80"}`}
                onClick={() => setSelectedVisit(visit)}
              >
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      {new Date(visit.date).toLocaleDateString()}
                    </div>
                    <Badge variant="outline" className="font-mono text-xs">Stage {visit.stage}</Badge>
                  </div>
                  <ComplianceBadge pct={visit.compliance} />
                  <Progress value={visit.compliance} className="h-1.5" />
                </CardContent>
              </Card>
            ))}

            {showAddVisit && (
              <Card className="border-primary/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">New Visit</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Stage</Label>
                      <input type="number" value={newStage} onChange={e => setNewStage(e.target.value)} className="w-full h-7 text-xs border rounded px-2 bg-background" />
                    </div>
                    <div>
                      <Label className="text-xs">Compliance %</Label>
                      <input type="number" value={newCompliance} onChange={e => setNewCompliance(e.target.value)} className="w-full h-7 text-xs border rounded px-2 bg-background" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Clinical Notes</Label>
                    <Textarea value={newNotes} onChange={e => setNewNotes(e.target.value)} className="text-xs h-16 resize-none" placeholder="Observations…" />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 text-xs" onClick={() => setShowAddVisit(false)}>Save Visit</Button>
                    <Button size="sm" variant="ghost" className="text-xs" onClick={() => setShowAddVisit(false)}>Cancel</Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Visit detail */}
          <div className="lg:col-span-2 space-y-4">
            {selectedVisit ? (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold text-primary">Stage {selectedVisit.stage}</p>
                      <p className="text-xs text-muted-foreground">Current aligner</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold">{selectedVisit.compliance}%</p>
                      <p className="text-xs text-muted-foreground">Compliance</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold">
                        {Object.values(selectedVisit.movements).filter(m => m.achieved / m.planned >= 0.9).length}/
                        {Object.keys(selectedVisit.movements).length}
                      </p>
                      <p className="text-xs text-muted-foreground">Teeth on track</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Movement Accuracy</CardTitle>
                    <CardDescription className="text-xs">Planned vs achieved movements per tooth</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ToothChart
                      selectedFdi={selectedFdi}
                      activeFdis={Object.keys(selectedVisit.movements).map(Number)}
                      onSelect={setSelectedFdi}
                      highlightedFdis={highlightedFdis}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Per-Tooth Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {Object.entries(selectedVisit.movements).map(([fdiStr, mov]) => {
                        const fdi = parseInt(fdiStr);
                        const pct = mov.planned > 0 ? (mov.achieved / mov.planned) * 100 : 100;
                        return (
                          <div key={fdi} className="flex items-center gap-3">
                            <span className="text-xs font-mono w-8 text-muted-foreground">{fdi}</span>
                            <div className="flex-1">
                              <Progress
                                value={Math.min(100, pct)}
                                className={`h-2 ${pct >= 90 ? "[&>div]:bg-emerald-500" : pct >= 70 ? "[&>div]:bg-amber-500" : "[&>div]:bg-red-500"}`}
                              />
                            </div>
                            <MovementDiff planned={mov.planned} achieved={mov.achieved} />
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                {selectedVisit.notes && (
                  <Card>
                    <CardContent className="p-4 flex items-start gap-3">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      <p className="text-sm text-muted-foreground">{selectedVisit.notes}</p>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-60 text-muted-foreground text-sm">
                Select a visit to view details
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
