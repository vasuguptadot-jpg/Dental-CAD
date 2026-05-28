import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Loader2, Save, FileText, ChevronDown, ChevronRight,
  AlertCircle, CheckCircle2, Info, Zap,
} from "lucide-react";
import type { OrthoAnalysis, OrthoFinding, SeverityLabel, ComplexityLabel } from "./types";
import { SEVERITY_COLORS, COMPLEXITY_COLORS, ANALYSIS_META } from "./types";
import { getFDIName } from "../segmentation/fdiMapping";

interface AnalysisPanelProps {
  analysis: OrthoAnalysis | null;
  isSaving: boolean;
  hasSaved: boolean;
  onSave: () => void;
  onReport: () => void;
  onRerun: () => void;
  selectedToothId: number | null;
  onSelectTooth: (id: number | null) => void;
}

const SEV_BADGE: Record<SeverityLabel, string> = {
  none:     "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  mild:     "bg-amber-500/15 text-amber-400 border-amber-500/30",
  moderate: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  severe:   "bg-rose-500/15 text-rose-400 border-rose-500/30",
  critical: "bg-red-600/20 text-red-400 border-red-600/40",
};

const COMPLEXITY_BADGE: Record<ComplexityLabel, string> = {
  low:      "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  moderate: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  high:     "text-orange-400 bg-orange-500/10 border-orange-500/20",
  severe:   "text-rose-400 bg-rose-500/10 border-rose-500/20",
};

function SeverityBar({ severity }: { severity: number }) {
  const pct = Math.min(100, (severity / 10) * 100);
  const color =
    pct < 35 ? "#10b981" : pct < 60 ? "#f59e0b" : pct < 80 ? "#f97316" : "#ef4444";
  return (
    <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden mt-1">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

function ComplexityGauge({ score, label }: { score: number; label: ComplexityLabel }) {
  const pct = Math.min(100, (score / 10) * 100);
  const color = COMPLEXITY_COLORS[label];
  const circumference = 2 * Math.PI * 28;
  const dash = (pct / 100) * circumference;

  return (
    <div className="flex items-center gap-3">
      <div className="relative h-16 w-16 shrink-0">
        <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
          <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
          <circle
            cx="32" cy="32" r="28" fill="none"
            stroke={color} strokeWidth="6"
            strokeDasharray={`${dash} ${circumference}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-white">
          {score.toFixed(1)}
        </span>
      </div>
      <div>
        <p className="text-xs text-white/40 uppercase tracking-wider font-semibold">Treatment Complexity</p>
        <span className={`mt-1 inline-block text-xs font-bold px-2 py-0.5 rounded border capitalize ${COMPLEXITY_BADGE[label]}`}>
          {label}
        </span>
        <p className="text-xs text-white/30 mt-0.5">Score {score.toFixed(1)} / 10</p>
      </div>
    </div>
  );
}

function FindingRow({
  finding,
  expanded,
  onToggle,
}: {
  finding: OrthoFinding;
  expanded: boolean;
  onToggle: () => void;
}) {
  const meta = ANALYSIS_META[finding.type];
  const isInsufficient = finding.dataStatus === "insufficient_data";
  const isNormal = finding.severity < 0.5 && !isInsufficient;

  return (
    <div className="border border-white/8 rounded-lg overflow-hidden mb-1.5">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/5 text-left"
      >
        {isInsufficient ? (
          <Info className="h-3.5 w-3.5 text-sky-400 shrink-0" />
        ) : isNormal ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
        ) : (
          <AlertCircle className="h-3.5 w-3.5 shrink-0" style={{ color: SEVERITY_COLORS[finding.severityLabel] }} />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-white truncate">{meta.name}</span>
            <div className="flex items-center gap-2 shrink-0">
              {finding.value != null && !isInsufficient && (
                <span className="text-[10px] text-white/40 font-mono">
                  {finding.value}{finding.unit ? ` ${finding.unit}` : ""}
                </span>
              )}
              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${SEV_BADGE[finding.severityLabel]}`}>
                {isInsufficient ? "N/A" : finding.severityLabel}
              </span>
            </div>
          </div>
          {!isNormal && !isInsufficient && (
            <SeverityBar severity={finding.severity} />
          )}
        </div>
        {expanded ? <ChevronDown className="h-3 w-3 text-white/30 shrink-0" /> : <ChevronRight className="h-3 w-3 text-white/30 shrink-0" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-white/8 bg-white/[0.02] space-y-2">
          <p className="text-xs text-white/60 mt-2 leading-relaxed">{finding.explanation}</p>
          {!isInsufficient && (
            <div className="bg-white/5 rounded-md p-2">
              <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-1">Clinical Significance</p>
              <p className="text-xs text-white/55 leading-relaxed">{finding.clinicalSignificance}</p>
            </div>
          )}
          {finding.affectedTeeth.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {finding.affectedTeeth.slice(0, 12).map((id) => (
                <span key={id} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-white/60">
                  {id}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AnalysisPanel({
  analysis,
  isSaving,
  hasSaved,
  onSave,
  onReport,
  onRerun,
  selectedToothId,
  onSelectTooth,
}: AnalysisPanelProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showHealthMap, setShowHealthMap] = useState(false);

  const toggleFinding = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (!analysis) {
    return (
      <div className="flex flex-col h-full bg-[#0d1117] border-l border-white/10 w-72 shrink-0 items-center justify-center p-6 text-center">
        <Zap className="h-10 w-10 text-white/20 mb-3" />
        <p className="text-xs text-white/40">Run analysis to see orthodontic findings and treatment complexity score.</p>
      </div>
    );
  }

  const activeFindings = analysis.findings.filter(
    (f) => f.severity >= 0.5 && f.dataStatus === "computed"
  );
  const normalFindings = analysis.findings.filter(
    (f) => f.severity < 0.5 && f.dataStatus === "computed"
  );
  const insufficientFindings = analysis.findings.filter(
    (f) => f.dataStatus === "insufficient_data"
  );

  return (
    <div className="flex flex-col h-full bg-[#0d1117] text-white border-l border-white/10 w-72 shrink-0">
      <div className="p-3 border-b border-white/10 space-y-3">
        <ComplexityGauge score={analysis.complexityScore} label={analysis.complexityLabel} />

        <div className="bg-white/5 rounded-lg p-2.5">
          <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold mb-1">Summary</p>
          <p className="text-xs text-white/65 leading-relaxed">{analysis.summary}</p>
        </div>

        <div className="grid grid-cols-3 gap-1.5 text-center">
          {[
            { label: "Issues", value: activeFindings.length, color: "text-rose-400" },
            { label: "Normal", value: normalFindings.length, color: "text-emerald-400" },
            { label: "Teeth", value: analysis.affectedToothCount, color: "text-amber-400" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white/5 rounded-md py-1.5">
              <p className={`text-base font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-[9px] text-white/40 uppercase tracking-wider">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          {activeFindings.length > 0 && (
            <>
              <p className="text-[10px] text-rose-400/80 font-semibold uppercase tracking-wider px-1 py-1.5">
                {activeFindings.length} Active Finding{activeFindings.length !== 1 ? "s" : ""}
              </p>
              {activeFindings
                .sort((a, b) => b.severity - a.severity)
                .map((f) => (
                  <FindingRow
                    key={f.id}
                    finding={f}
                    expanded={expandedIds.has(f.id)}
                    onToggle={() => toggleFinding(f.id)}
                  />
                ))}
            </>
          )}

          {normalFindings.length > 0 && (
            <>
              <p className="text-[10px] text-emerald-400/80 font-semibold uppercase tracking-wider px-1 py-1.5 mt-1">
                {normalFindings.length} Within Normal
              </p>
              {normalFindings.map((f) => (
                <FindingRow
                  key={f.id}
                  finding={f}
                  expanded={expandedIds.has(f.id)}
                  onToggle={() => toggleFinding(f.id)}
                />
              ))}
            </>
          )}

          {insufficientFindings.length > 0 && (
            <>
              <button
                onClick={() => setShowHealthMap((v) => !v)}
                className="w-full flex items-center justify-between px-1 py-1.5 text-[10px] text-sky-400/70 font-semibold uppercase tracking-wider mt-1 hover:text-sky-300"
              >
                <span>{insufficientFindings.length} Require Full Arch</span>
                {showHealthMap ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
              {showHealthMap && insufficientFindings.map((f) => (
                <FindingRow
                  key={f.id}
                  finding={f}
                  expanded={expandedIds.has(f.id)}
                  onToggle={() => toggleFinding(f.id)}
                />
              ))}
            </>
          )}
        </div>

        {Object.keys(analysis.toothHealthMap).length > 0 && (
          <>
            <Separator className="bg-white/10 mx-2" />
            <div className="p-2 pb-1">
              <p className="text-[10px] text-white/40 font-semibold uppercase tracking-wider px-1 py-1.5">
                Tooth Health Map
              </p>
              <div className="flex flex-wrap gap-1 px-1">
                {Object.entries(analysis.toothHealthMap)
                  .sort(([a], [b]) => parseInt(a) - parseInt(b))
                  .map(([toothIdStr, entry]) => {
                    const toothId = parseInt(toothIdStr);
                    const isSelected = selectedToothId === toothId;
                    return (
                      <TooltipProvider key={toothId} delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => onSelectTooth(isSelected ? null : toothId)}
                              className={`text-[10px] font-mono px-1.5 py-1 rounded border transition-all ${
                                isSelected ? "ring-1 ring-white/40 scale-110" : ""
                              }`}
                              style={{
                                backgroundColor: `${SEVERITY_COLORS[entry.severityLabel]}22`,
                                borderColor: `${SEVERITY_COLORS[entry.severityLabel]}55`,
                                color: SEVERITY_COLORS[entry.severityLabel],
                              }}
                            >
                              {toothId}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs max-w-[180px]">
                            <p className="font-bold mb-0.5">{getFDIName(toothId)}</p>
                            {entry.issues.length > 0
                              ? entry.issues.join(", ")
                              : "No issues detected"}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}
              </div>
            </div>
          </>
        )}
      </ScrollArea>

      <Separator className="bg-white/10" />
      <div className="p-3 space-y-2">
        <Button
          size="sm"
          className="w-full h-8 text-xs gap-1.5 bg-primary hover:bg-primary/90"
          onClick={onSave}
          disabled={isSaving}
        >
          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {isSaving ? "Saving…" : "Save Analysis"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="w-full h-8 text-xs gap-1.5 border-white/15 text-white/70 hover:text-white hover:bg-white/10"
          onClick={onReport}
        >
          <FileText className="h-3.5 w-3.5" />
          Generate Report
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="w-full h-8 text-xs text-white/40 hover:text-white hover:bg-white/10"
          onClick={onRerun}
        >
          Re-run Analysis
        </Button>
      </div>
    </div>
  );
}
