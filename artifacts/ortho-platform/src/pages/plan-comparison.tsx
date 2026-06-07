import { useState } from "react";
import { useRoute, Link } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, CheckCircle2, GitCompare, Layers, Info, Download } from "lucide-react";
import { useListScans, useGetCase } from "@workspace/api-client-react";
import { ToothChart } from "@/components/tooth-chart";

interface TreatmentPlanSummary {
  name: string;
  stages: number;
  totalMovements: number;
  iprTotal: number;
  attachments: number;
  riskLevel: "Low" | "Moderate" | "High";
  notes: string;
  movements: Record<number, { tx: number; ty: number; tz: number; rx: number; ry: number; rz: number }>;
}

const PLAN_A: TreatmentPlanSummary = {
  name: "Plan A — Extraction-based",
  stages: 28,
  totalMovements: 14.2,
  iprTotal: 0,
  attachments: 12,
  riskLevel: "Low",
  notes: "Extract 14 and 24. Retract upper anteriors. Lower arch aligned with mild proclination.",
  movements: {
    11: { tx: -2.1, ty: 0.5, tz: 0, rx: 3, ry: 0, rz: -2 },
    12: { tx: -1.5, ty: 0.2, tz: 0, rx: 2, ry: 0, rz: -1 },
    13: { tx: -3.2, ty: 1.0, tz: 0, rx: 5, ry: 1, rz: -3 },
    21: { tx: -2.0, ty: 0.5, tz: 0, rx: 3, ry: 0, rz: 2 },
    22: { tx: -1.4, ty: 0.2, tz: 0, rx: 2, ry: 0, rz: 1 },
    23: { tx: -3.0, ty: 1.0, tz: 0, rx: 5, ry: -1, rz: 3 },
    31: { tx: 0.5, ty: 0, tz: 0, rx: -2, ry: 0, rz: 1 },
    32: { tx: 0.4, ty: 0, tz: 0, rx: -1, ry: 0, rz: 0.5 },
    41: { tx: 0.5, ty: 0, tz: 0, rx: -2, ry: 0, rz: -1 },
    42: { tx: 0.4, ty: 0, tz: 0, rx: -1, ry: 0, rz: -0.5 },
  },
};

const PLAN_B: TreatmentPlanSummary = {
  name: "Plan B — Non-extraction + IPR",
  stages: 38,
  totalMovements: 18.6,
  iprTotal: 3.2,
  attachments: 18,
  riskLevel: "Moderate",
  notes: "No extractions. Upper arch expanded 4mm. IPR 0.2mm at 8 contacts. Lower arch proclined 5°.",
  movements: {
    11: { tx: 1.0, ty: 0.2, tz: 0, rx: 1, ry: 0, rz: -1 },
    12: { tx: 0.8, ty: 0.1, tz: 0, rx: 1, ry: 0, rz: -0.5 },
    13: { tx: 0.5, ty: 0.5, tz: 0, rx: 2, ry: 0, rz: -1 },
    14: { tx: 2.0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0 },
    15: { tx: 2.0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0 },
    21: { tx: 1.0, ty: 0.2, tz: 0, rx: 1, ry: 0, rz: 1 },
    22: { tx: 0.8, ty: 0.1, tz: 0, rx: 1, ry: 0, rz: 0.5 },
    23: { tx: 0.5, ty: 0.5, tz: 0, rx: 2, ry: 0, rz: 1 },
    24: { tx: 2.0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0 },
    25: { tx: 2.0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0 },
    31: { tx: 0, ty: 0, tz: 0, rx: -5, ry: 0, rz: 1 },
    32: { tx: 0, ty: 0, tz: 0, rx: -4, ry: 0, rz: 0.5 },
    41: { tx: 0, ty: 0, tz: 0, rx: -5, ry: 0, rz: -1 },
    42: { tx: 0, ty: 0, tz: 0, rx: -4, ry: 0, rz: -0.5 },
  },
};

function PlanCard({ plan, selected, onSelect }: { plan: TreatmentPlanSummary; selected: boolean; onSelect: () => void }) {
  const riskColor = { Low: "text-emerald-400", Moderate: "text-amber-400", High: "text-red-400" }[plan.riskLevel];

  const highlightedFdis: Record<number, string> = {};
  Object.keys(plan.movements).forEach(fdi => {
    const mov = plan.movements[parseInt(fdi)];
    const magnitude = Math.sqrt(mov.tx ** 2 + mov.ty ** 2 + mov.tz ** 2 + (mov.rx / 10) ** 2);
    highlightedFdis[parseInt(fdi)] = magnitude > 2 ? "#818cf8" : magnitude > 1 ? "#34d399" : "#94a3b8";
  });

  return (
    <div
      className={`border-2 rounded-xl overflow-hidden transition-all cursor-pointer ${selected ? "border-primary" : "border-border hover:border-border/60"}`}
      onClick={onSelect}
    >
      <div className={`px-4 py-3 ${selected ? "bg-primary/10" : "bg-muted/30"} border-b flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          {selected && <CheckCircle2 className="h-4 w-4 text-primary" />}
          <span className="font-semibold text-sm">{plan.name}</span>
        </div>
        <Badge className={`text-xs ${riskColor} bg-current/10 border-current/30`}>{plan.riskLevel} Risk</Badge>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Stages", value: plan.stages },
            { label: "Total movement", value: `${plan.totalMovements}mm` },
            { label: "IPR required", value: `${plan.iprTotal}mm` },
            { label: "Attachments", value: plan.attachments },
          ].map(({ label, value }) => (
            <div key={label} className="text-center py-2 bg-muted/30 rounded-lg">
              <p className="text-lg font-bold">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        <ToothChart
          selectedFdi={null}
          activeFdis={Object.keys(plan.movements).map(Number)}
          highlightedFdis={highlightedFdis}
        />

        <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 leading-relaxed">{plan.notes}</p>
      </div>
    </div>
  );
}

function DiffRow({ label, a, b, betterLow = true }: { label: string; a: number | string; b: number | string; betterLow?: boolean }) {
  const aNum = typeof a === "number" ? a : null;
  const bNum = typeof b === "number" ? b : null;
  const aWins = aNum !== null && bNum !== null && (betterLow ? aNum < bNum : aNum > bNum);
  const bWins = aNum !== null && bNum !== null && (betterLow ? bNum < aNum : bNum > aNum);

  return (
    <div className="grid grid-cols-3 text-sm py-2 border-b last:border-0">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={`text-center font-mono ${aWins ? "text-emerald-400 font-bold" : ""}`}>{typeof a === "number" ? a.toString() : a}</span>
      <span className={`text-center font-mono ${bWins ? "text-emerald-400 font-bold" : ""}`}>{typeof b === "number" ? b.toString() : b}</span>
    </div>
  );
}

export default function PlanComparison() {
  const [, params] = useRoute("/plan-comparison/:caseId");
  const caseId = params?.caseId ? parseInt(params.caseId, 10) : 0;
  const { data: caseData } = useGetCase(caseId, { query: { enabled: !!caseId } });

  const [selected, setSelected] = useState<"A" | "B" | null>(null);

  const exportDecision = () => {
    const plan = selected === "A" ? PLAN_A : PLAN_B;
    const txt = `Treatment Plan Decision\n${"=".repeat(40)}\nCase: ${caseData?.title ?? "—"}\nApproved Plan: ${plan.name}\n\n${plan.notes}\n\nStages: ${plan.stages}\nTotal Movement: ${plan.totalMovements}mm\nIPR: ${plan.iprTotal}mm\nAttachments: ${plan.attachments}\nRisk: ${plan.riskLevel}`;
    const blob = new Blob([txt], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "plan-decision.txt"; a.click();
    URL.revokeObjectURL(url);
  };

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
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <GitCompare className="h-7 w-7 text-primary" /> Plan Comparison
            </h1>
            <p className="text-muted-foreground">
              {caseData ? `${caseData.title} — ${caseData.patientName}` : "Side-by-side comparison of two treatment approaches."}
            </p>
          </div>
          <div className="flex-1" />
          {selected && (
            <Button size="sm" onClick={exportDecision} className="gap-2">
              <Download className="h-4 w-4" /> Export Decision
            </Button>
          )}
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm">
            Compare two treatment plans side-by-side. Click a plan to select it as the approved approach. <strong>Green highlighted values</strong> indicate the superior metric.
          </AlertDescription>
        </Alert>

        {selected && (
          <div className="flex items-center gap-3 p-3 border border-emerald-500/30 bg-emerald-500/5 rounded-lg">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <p className="text-sm font-medium">{selected === "A" ? PLAN_A.name : PLAN_B.name} selected as the approved treatment plan.</p>
            <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={() => setSelected(null)}>Clear</Button>
          </div>
        )}

        {/* Side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PlanCard plan={PLAN_A} selected={selected === "A"} onSelect={() => setSelected("A")} />
          <PlanCard plan={PLAN_B} selected={selected === "B"} onSelect={() => setSelected("B")} />
        </div>

        {/* Comparison table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="h-4 w-4" /> Head-to-Head Comparison
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider py-2 border-b">
              <span>Metric</span>
              <span className="text-center">Plan A</span>
              <span className="text-center">Plan B</span>
            </div>
            <DiffRow label="Aligner stages" a={PLAN_A.stages} b={PLAN_B.stages} betterLow={true} />
            <DiffRow label="Total tooth movement" a={`${PLAN_A.totalMovements}mm`} b={`${PLAN_B.totalMovements}mm`} />
            <DiffRow label="IPR required" a={`${PLAN_A.iprTotal}mm`} b={`${PLAN_B.iprTotal}mm`} />
            <DiffRow label="Attachments" a={PLAN_A.attachments} b={PLAN_B.attachments} betterLow={true} />
            <DiffRow label="Extractions" a="2 (14, 24)" b="None" />
            <DiffRow label="Risk level" a={PLAN_A.riskLevel} b={PLAN_B.riskLevel} />
            <DiffRow label="Teeth moved" a={Object.keys(PLAN_A.movements).length} b={Object.keys(PLAN_B.movements).length} betterLow={true} />
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
