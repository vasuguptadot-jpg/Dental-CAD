import { useState, useMemo } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, RotateCcw, Info } from "lucide-react";
import { ToothChart } from "@/components/tooth-chart";

const ANTERIOR_IDEAL = 0.7718;
const OVERALL_IDEAL = 0.9132;

const ANTERIOR_LOWER = [31, 32, 33, 41, 42, 43];
const ANTERIOR_UPPER = [11, 12, 13, 21, 22, 23];
const POSTERIOR_LOWER = [34, 35, 36, 44, 45, 46];
const POSTERIOR_UPPER = [14, 15, 16, 24, 25, 26];

const ALL_LOWER = [...ANTERIOR_LOWER, ...POSTERIOR_LOWER];
const ALL_UPPER = [...ANTERIOR_UPPER, ...POSTERIOR_UPPER];

const ALL_TEETH = [...ALL_UPPER, ...ALL_LOWER];

type ToothWidths = Record<number, string>;

const DEFAULT_WIDTHS: ToothWidths = {
  11: "8.6", 12: "6.5", 13: "7.5", 21: "8.6", 22: "6.5", 23: "7.5",
  14: "7.0", 15: "6.5", 16: "10.2", 24: "7.0", 25: "6.5", 26: "10.2",
  31: "5.4", 32: "5.9", 33: "6.8", 41: "5.4", 42: "5.9", 43: "6.8",
  34: "7.1", 35: "7.6", 36: "11.2", 44: "7.1", 45: "7.6", 46: "11.2",
};

function sum(fdis: number[], widths: ToothWidths): number {
  return fdis.reduce((acc, fdi) => acc + (parseFloat(widths[fdi] ?? "0") || 0), 0);
}

function getRatioStatus(ratio: number, ideal: number, tolerance = 0.02): "ideal" | "excess_lower" | "excess_upper" {
  if (ratio < ideal - tolerance) return "excess_upper";
  if (ratio > ideal + tolerance) return "excess_lower";
  return "ideal";
}

export default function BoltonAnalysis() {
  const [widths, setWidths] = useState<ToothWidths>(DEFAULT_WIDTHS);
  const [selectedFdi, setSelectedFdi] = useState<number | null>(null);

  const anteriorLower = sum(ANTERIOR_LOWER, widths);
  const anteriorUpper = sum(ANTERIOR_UPPER, widths);
  const overallLower = sum(ALL_LOWER, widths);
  const overallUpper = sum(ALL_UPPER, widths);

  const anteriorRatio = anteriorUpper > 0 ? anteriorLower / anteriorUpper : 0;
  const overallRatio = overallUpper > 0 ? overallLower / overallUpper : 0;

  const anteriorStatus = getRatioStatus(anteriorRatio, ANTERIOR_IDEAL);
  const overallStatus = getRatioStatus(overallRatio, OVERALL_IDEAL);

  const anteriorDiscrepancy = useMemo(() => {
    const idealLower = anteriorUpper * ANTERIOR_IDEAL;
    return anteriorLower - idealLower;
  }, [anteriorLower, anteriorUpper]);

  const overallDiscrepancy = useMemo(() => {
    const idealLower = overallUpper * OVERALL_IDEAL;
    return overallLower - idealLower;
  }, [overallLower, overallUpper]);

  const setWidth = (fdi: number, val: string) => {
    setWidths(prev => ({ ...prev, [fdi]: val }));
  };

  const reset = () => setWidths(DEFAULT_WIDTHS);

  const getStatusBadge = (status: ReturnType<typeof getRatioStatus>, ratio: number) => {
    if (status === "ideal") return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Ideal ({(ratio * 100).toFixed(1)}%)</Badge>;
    if (status === "excess_lower") return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Excess Lower ({(ratio * 100).toFixed(1)}%)</Badge>;
    return <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30">Excess Upper ({(ratio * 100).toFixed(1)}%)</Badge>;
  };

  const highlightedFdis: Record<number, string> = {};
  ALL_UPPER.forEach(fdi => { highlightedFdis[fdi] = "#818cf8"; });
  ALL_LOWER.forEach(fdi => { highlightedFdis[fdi] = "#34d399"; });

  return (
    <Layout>
      <div className="space-y-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Bolton Analysis</h1>
            <p className="text-muted-foreground">Tooth size discrepancy calculator — anterior and overall arch ratio analysis.</p>
          </div>
          <Button variant="outline" size="sm" onClick={reset} className="gap-2">
            <RotateCcw className="h-4 w-4" /> Reset to Typical
          </Button>
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm">
            Enter mesiodistal widths (mm) for each tooth. <strong>Ideal anterior ratio: 77.2%</strong> — <strong>Ideal overall ratio: 91.3%</strong> (Bolton 1958). Click a tooth in the chart to jump to its input.
          </AlertDescription>
        </Alert>

        {/* Results */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className={anteriorStatus === "ideal" ? "border-emerald-500/30" : "border-amber-500/30"}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Anterior Ratio</CardTitle>
                {getStatusBadge(anteriorStatus, anteriorRatio)}
              </div>
              <CardDescription>Lower 6 anterior / Upper 6 anterior</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Upper 6 sum</span>
                <span className="font-mono font-medium">{anteriorUpper.toFixed(1)} mm</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Lower 6 sum</span>
                <span className="font-mono font-medium">{anteriorLower.toFixed(1)} mm</span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Discrepancy</span>
                <span className={`font-mono font-semibold ${Math.abs(anteriorDiscrepancy) < 0.5 ? "text-emerald-400" : "text-amber-400"}`}>
                  {anteriorDiscrepancy > 0 ? "+" : ""}{anteriorDiscrepancy.toFixed(2)} mm
                </span>
              </div>
              {anteriorStatus !== "ideal" && (
                <div className="text-xs text-muted-foreground bg-muted/40 rounded p-2">
                  {anteriorStatus === "excess_lower"
                    ? `Lower teeth are ${Math.abs(anteriorDiscrepancy).toFixed(2)}mm wider than ideal. Consider IPR on lower anteriors.`
                    : `Upper teeth are ${Math.abs(anteriorDiscrepancy).toFixed(2)}mm wider than ideal. Consider IPR on upper anteriors.`}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className={overallStatus === "ideal" ? "border-emerald-500/30" : "border-amber-500/30"}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Overall Ratio</CardTitle>
                {getStatusBadge(overallStatus, overallRatio)}
              </div>
              <CardDescription>Lower 12 / Upper 12 (excl. 2nd/3rd molars)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Upper 12 sum</span>
                <span className="font-mono font-medium">{overallUpper.toFixed(1)} mm</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Lower 12 sum</span>
                <span className="font-mono font-medium">{overallLower.toFixed(1)} mm</span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Discrepancy</span>
                <span className={`font-mono font-semibold ${Math.abs(overallDiscrepancy) < 0.5 ? "text-emerald-400" : "text-amber-400"}`}>
                  {overallDiscrepancy > 0 ? "+" : ""}{overallDiscrepancy.toFixed(2)} mm
                </span>
              </div>
              {overallStatus !== "ideal" && (
                <div className="text-xs text-muted-foreground bg-muted/40 rounded p-2">
                  {overallStatus === "excess_lower"
                    ? `Overall lower arch is ${Math.abs(overallDiscrepancy).toFixed(2)}mm wider. Evaluate posterior IPR or expansion.`
                    : `Overall upper arch is ${Math.abs(overallDiscrepancy).toFixed(2)}mm wider. Evaluate upper arch expansion.`}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Tooth Chart */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-sm">Dental Chart</CardTitle>
              <CardDescription className="text-xs">Click a tooth to jump to its measurement</CardDescription>
            </CardHeader>
            <CardContent>
              <ToothChart
                selectedFdi={selectedFdi}
                activeFdis={ALL_TEETH}
                onSelect={setSelectedFdi}
                highlightedFdis={highlightedFdis}
              />
            </CardContent>
          </Card>

          {/* Width inputs */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm">Mesiodistal Widths (mm)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-xs font-semibold text-violet-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-violet-400 inline-block" /> Upper Teeth
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {ALL_UPPER.map(fdi => (
                      <div key={fdi} id={`tooth-${fdi}`} className={`space-y-0.5 ${selectedFdi === fdi ? "ring-1 ring-primary rounded" : ""}`}>
                        <Label className="text-xs text-muted-foreground">{fdi}</Label>
                        <Input
                          type="number"
                          value={widths[fdi] ?? ""}
                          onChange={e => setWidth(fdi, e.target.value)}
                          className="h-7 text-xs font-mono"
                          step="0.1"
                          min="0"
                          max="20"
                          onFocus={() => setSelectedFdi(fdi)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Lower Teeth
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {ALL_LOWER.map(fdi => (
                      <div key={fdi} id={`tooth-${fdi}`} className={`space-y-0.5 ${selectedFdi === fdi ? "ring-1 ring-primary rounded" : ""}`}>
                        <Label className="text-xs text-muted-foreground">{fdi}</Label>
                        <Input
                          type="number"
                          value={widths[fdi] ?? ""}
                          onChange={e => setWidth(fdi, e.target.value)}
                          className="h-7 text-xs font-mono"
                          step="0.1"
                          min="0"
                          max="20"
                          onFocus={() => setSelectedFdi(fdi)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
