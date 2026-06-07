import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { RotateCcw, Info, AlertTriangle, Download } from "lucide-react";
import { ToothChart } from "@/components/tooth-chart";

const MAX_IPR_PER_SURFACE = 0.5;
const MAX_IPR_PER_CONTACT = 0.8;

interface ContactPoint {
  id: string;
  label: string;
  teeth: [number, number];
  crowding: number;
  prescribed: number;
}

const CONTACT_POINTS: Omit<ContactPoint, "crowding" | "prescribed">[] = [
  { id: "18-17", label: "18-17", teeth: [18, 17] },
  { id: "17-16", label: "17-16", teeth: [17, 16] },
  { id: "16-15", label: "16-15", teeth: [16, 15] },
  { id: "15-14", label: "15-14", teeth: [15, 14] },
  { id: "14-13", label: "14-13", teeth: [14, 13] },
  { id: "13-12", label: "13-12", teeth: [13, 12] },
  { id: "12-11", label: "12-11", teeth: [12, 11] },
  { id: "11-21", label: "11-21", teeth: [11, 21] },
  { id: "21-22", label: "21-22", teeth: [21, 22] },
  { id: "22-23", label: "22-23", teeth: [22, 23] },
  { id: "23-24", label: "23-24", teeth: [23, 24] },
  { id: "24-25", label: "24-25", teeth: [24, 25] },
  { id: "25-26", label: "25-26", teeth: [25, 26] },
  { id: "26-27", label: "26-27", teeth: [26, 27] },
  { id: "27-28", label: "27-28", teeth: [27, 28] },
  { id: "48-47", label: "48-47", teeth: [48, 47] },
  { id: "47-46", label: "47-46", teeth: [47, 46] },
  { id: "46-45", label: "46-45", teeth: [46, 45] },
  { id: "45-44", label: "45-44", teeth: [45, 44] },
  { id: "44-43", label: "44-43", teeth: [44, 43] },
  { id: "43-42", label: "43-42", teeth: [43, 42] },
  { id: "42-41", label: "42-41", teeth: [42, 41] },
  { id: "41-31", label: "41-31", teeth: [41, 31] },
  { id: "31-32", label: "31-32", teeth: [31, 32] },
  { id: "32-33", label: "32-33", teeth: [32, 33] },
  { id: "33-34", label: "33-34", teeth: [33, 34] },
  { id: "34-35", label: "34-35", teeth: [34, 35] },
  { id: "35-36", label: "35-36", teeth: [35, 36] },
  { id: "36-37", label: "36-37", teeth: [36, 37] },
  { id: "37-38", label: "37-38", teeth: [37, 38] },
];

function initPoints(): ContactPoint[] {
  return CONTACT_POINTS.map(cp => ({ ...cp, crowding: 0, prescribed: 0 }));
}

export default function IPRCalculator() {
  const [points, setPoints] = useState<ContactPoint[]>(initPoints);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFdi, setSelectedFdi] = useState<number | null>(null);

  const totalPrescribed = points.reduce((acc, p) => acc + p.prescribed, 0);
  const totalCrowding = points.reduce((acc, p) => acc + p.crowding, 0);
  const flagged = points.filter(p => p.prescribed > MAX_IPR_PER_CONTACT);
  const hasWarning = flagged.length > 0;

  const setPoint = (id: string, field: "crowding" | "prescribed", val: number) => {
    setPoints(prev => prev.map(p => p.id === id ? { ...p, [field]: val } : p));
  };

  const autoPrescribe = () => {
    setPoints(prev => prev.map(p => ({
      ...p,
      prescribed: Math.min(p.crowding, MAX_IPR_PER_CONTACT),
    })));
  };

  const reset = () => setPoints(initPoints());

  const activePoints = points.filter(p => p.crowding > 0 || p.prescribed > 0);

  const highlightedFdis: Record<number, string> = {};
  points.forEach(p => {
    if (p.prescribed > 0) {
      const color = p.prescribed > MAX_IPR_PER_CONTACT ? "#ef4444" : p.prescribed > 0.4 ? "#f59e0b" : "#22c55e";
      p.teeth.forEach(fdi => { highlightedFdis[fdi] = color; });
    }
  });

  const exportCSV = () => {
    const rows = [["Contact Point", "Crowding (mm)", "IPR Prescribed (mm)", "Status"]];
    points.filter(p => p.prescribed > 0).forEach(p => {
      const status = p.prescribed > MAX_IPR_PER_CONTACT ? "EXCEEDS LIMIT" : p.prescribed > 0.4 ? "Moderate" : "Safe";
      rows.push([p.label, p.crowding.toString(), p.prescribed.toString(), status]);
    });
    rows.push(["TOTAL", totalCrowding.toFixed(2), totalPrescribed.toFixed(2), ""]);
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "ipr-plan.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Layout>
      <div className="space-y-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">IPR Calculator</h1>
            <p className="text-muted-foreground">Interproximal Reduction planner — prescribe enamel reduction at contact points.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={autoPrescribe} className="gap-2">
              Auto Prescribe
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={reset} className="gap-2">
              <RotateCcw className="h-4 w-4" /> Reset
            </Button>
          </div>
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm">
            Maximum safe IPR: <strong>0.5mm per surface (0.8mm per contact point)</strong>. Enamel thickness varies — avoid exceeding these limits without clinical assessment.
          </AlertDescription>
        </Alert>

        {hasWarning && (
          <Alert className="border-red-500/50 bg-red-500/10">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <AlertDescription className="text-red-400 text-sm">
              {flagged.length} contact point(s) exceed the safe limit: {flagged.map(p => p.label).join(", ")}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total crowding</span>
                  <span className="font-mono">{totalCrowding.toFixed(2)} mm</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total prescribed</span>
                  <span className="font-mono font-semibold text-primary">{totalPrescribed.toFixed(2)} mm</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Active contacts</span>
                  <span className="font-mono">{activePoints.length}</span>
                </div>
                <div className="h-px bg-border" />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Remaining crowding</span>
                  <span className={`font-mono ${totalCrowding - totalPrescribed > 0.5 ? "text-amber-400" : "text-emerald-400"}`}>
                    {Math.max(0, totalCrowding - totalPrescribed).toFixed(2)} mm
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Dental Chart</CardTitle>
                <CardDescription className="text-xs">Green = safe · Yellow = moderate · Red = exceeds limit</CardDescription>
              </CardHeader>
              <CardContent>
                <ToothChart
                  selectedFdi={selectedFdi}
                  onSelect={setSelectedFdi}
                  highlightedFdis={highlightedFdis}
                />
              </CardContent>
            </Card>
          </div>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm">Contact Point Details</CardTitle>
              <CardDescription>Enter crowding at each contact, then prescribe IPR amount</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                {points.map(p => (
                  <div
                    key={p.id}
                    className={`border rounded-lg p-3 space-y-2 transition-colors ${selectedId === p.id ? "border-primary/50 bg-primary/5" : "border-border hover:border-border/80"}`}
                    onClick={() => setSelectedId(p.id)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium font-mono">{p.label}</span>
                      <div className="flex items-center gap-2">
                        {p.prescribed > 0 && (
                          <Badge className={`text-xs ${p.prescribed > MAX_IPR_PER_CONTACT ? "bg-red-500/20 text-red-400" : p.prescribed > 0.4 ? "bg-amber-500/20 text-amber-400" : "bg-emerald-500/20 text-emerald-400"}`}>
                            {p.prescribed.toFixed(2)} mm IPR
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Crowding (mm)</Label>
                        <Input
                          type="number"
                          value={p.crowding || ""}
                          onChange={e => setPoint(p.id, "crowding", Math.max(0, parseFloat(e.target.value) || 0))}
                          className="h-7 text-xs font-mono"
                          step="0.1" min="0" max="5"
                          placeholder="0.0"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground flex justify-between">
                          <span>Prescribed (mm)</span>
                          <span className="text-muted-foreground/60">max {MAX_IPR_PER_CONTACT}</span>
                        </Label>
                        <Input
                          type="number"
                          value={p.prescribed || ""}
                          onChange={e => setPoint(p.id, "prescribed", Math.max(0, parseFloat(e.target.value) || 0))}
                          className="h-7 text-xs font-mono"
                          step="0.05" min="0" max="0.8"
                          placeholder="0.0"
                        />
                      </div>
                    </div>
                    {p.crowding > 0 && (
                      <div className="space-y-1">
                        <Slider
                          value={[p.prescribed]}
                          onValueChange={([v]) => setPoint(p.id, "prescribed", v)}
                          min={0} max={Math.min(p.crowding, MAX_IPR_PER_CONTACT)} step={0.05}
                          className="h-4"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
