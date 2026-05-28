import { useRef } from "react";
import {
  Dialog, DialogContent, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";
import type { OrthoAnalysis, OrthoFinding, SeverityLabel, ComplexityLabel } from "./types";
import { ANALYSIS_META } from "./types";
import { getFDIName } from "../segmentation/fdiMapping";

interface AnalysisReportProps {
  open: boolean;
  onClose: () => void;
  scanId: number;
  jawType: string;
  scanName?: string;
  analysis: OrthoAnalysis;
}

const SEV_STYLE: Record<SeverityLabel, { bg: string; color: string }> = {
  none:     { bg: "#d1fae5", color: "#065f46" },
  mild:     { bg: "#fef3c7", color: "#92400e" },
  moderate: { bg: "#ffedd5", color: "#9a3412" },
  severe:   { bg: "#fee2e2", color: "#991b1b" },
  critical: { bg: "#fca5a5", color: "#7f1d1d" },
};

const COMPLEXITY_STYLE: Record<ComplexityLabel, { bg: string; color: string }> = {
  low:      { bg: "#d1fae5", color: "#065f46" },
  moderate: { bg: "#fef3c7", color: "#92400e" },
  high:     { bg: "#ffedd5", color: "#9a3412" },
  severe:   { bg: "#fee2e2", color: "#991b1b" },
};

export function AnalysisReport({
  open, onClose, scanId, jawType, scanName, analysis,
}: AnalysisReportProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank", "width=960,height=700");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Orthodontic Analysis Report</title><style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;font-size:11px;color:#1a1a1a;padding:24px}
      h1{font-size:18px;font-weight:bold;margin-bottom:4px}
      h2{font-size:13px;font-weight:bold;margin:18px 0 6px;border-bottom:1px solid #ddd;padding-bottom:4px;color:#333}
      h3{font-size:11px;font-weight:600;margin:10px 0 3px;color:#555}
      table{width:100%;border-collapse:collapse;margin-bottom:8px}
      th{background:#f3f4f6;text-align:left;padding:5px 8px;font-size:10px;font-weight:600;border:1px solid #e5e7eb}
      td{padding:4px 8px;border:1px solid #e5e7eb;vertical-align:top}
      .badge{display:inline-block;padding:1px 7px;border-radius:10px;font-size:9px;font-weight:700}
      .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
      .card{border:1px solid #e5e7eb;border-radius:6px;padding:10px}
      .card-val{font-size:22px;font-weight:bold}
      .finding-box{border:1px solid #e5e7eb;border-radius:6px;padding:10px;margin-bottom:8px}
      .finding-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
      .finding-name{font-weight:bold;font-size:12px}
      .explanation{font-size:10px;color:#555;margin-bottom:4px}
      .significance{font-size:10px;color:#666;background:#f9fafb;padding:6px;border-radius:4px;border-left:3px solid #e5e7eb}
      .footer{margin-top:20px;font-size:9px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:8px}
      @media print{body{padding:12px}}
    </style></head><body>${content.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  };

  const activeFindings = analysis.findings.filter(
    (f) => f.severity >= 0.5 && f.dataStatus === "computed"
  );
  const normalFindings = analysis.findings.filter(
    (f) => f.severity < 0.5 && f.dataStatus === "computed"
  );
  const complexStyle = COMPLEXITY_STYLE[analysis.complexityLabel];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-background z-10">
          <DialogTitle className="text-base">Orthodontic Analysis Report</DialogTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={handlePrint}>
              <Printer className="h-3.5 w-3.5" />
              Print / PDF
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="p-6" ref={printRef}>
          {/* Header */}
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1>Orthodontic Analysis Report</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Scan: <strong>{scanName ?? `Scan #${scanId}`}</strong>
              </p>
              <p className="text-sm text-muted-foreground capitalize">
                Arch: <strong>{jawType}</strong> · Date: <strong>{today}</strong>
              </p>
            </div>
            <div className="text-right text-sm text-muted-foreground">
              <p className="font-semibold text-foreground">OrthoDesk</p>
              <p>AI-Assisted Analysis</p>
              <p className="mt-1">
                <span
                  className="inline-block px-3 py-1 rounded-full text-xs font-bold"
                  style={{ background: complexStyle.bg, color: complexStyle.color }}
                >
                  {analysis.complexityLabel.toUpperCase()} COMPLEXITY
                </span>
              </p>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: "Complexity Score", value: `${analysis.complexityScore}/10`, style: complexStyle },
              { label: "Active Issues", value: activeFindings.length, style: { bg: activeFindings.length > 0 ? "#fee2e2" : "#d1fae5", color: activeFindings.length > 0 ? "#991b1b" : "#065f46" } },
              { label: "Normal Findings", value: normalFindings.length, style: { bg: "#d1fae5", color: "#065f46" } },
              { label: "Affected Teeth", value: analysis.affectedToothCount, style: { bg: "#dbeafe", color: "#1e40af" } },
            ].map((card) => (
              <div key={card.label} className="rounded-lg p-3 text-center" style={{ background: card.style.bg, color: card.style.color }}>
                <p className="text-2xl font-bold">{card.value}</p>
                <p className="text-xs mt-0.5">{card.label}</p>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="mb-6 p-4 bg-muted/40 rounded-lg border">
            <h2 className="text-sm font-semibold mb-2">Clinical Summary</h2>
            <p className="text-sm text-muted-foreground">{analysis.summary}</p>
          </div>

          {/* Active findings */}
          {activeFindings.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold mb-3 pb-1 border-b">Active Findings ({activeFindings.length})</h2>
              {activeFindings
                .sort((a, b) => b.severity - a.severity)
                .map((finding) => {
                  const sev = SEV_STYLE[finding.severityLabel];
                  const meta = ANALYSIS_META[finding.type];
                  return (
                    <div key={finding.id} className="border rounded-lg p-4 mb-3">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-sm">{meta.name}</p>
                          <p className="text-xs text-muted-foreground">{meta.description}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-4">
                          {finding.value != null && (
                            <span className="text-xs font-mono text-muted-foreground">
                              {finding.value} {finding.unit}
                              {finding.normalRange && ` (normal: ${finding.normalRange[0]}–${finding.normalRange[1]})`}
                            </span>
                          )}
                          <div className="flex flex-col items-end gap-1">
                            <span
                              className="text-xs font-bold px-2 py-0.5 rounded-full capitalize"
                              style={{ background: sev.bg, color: sev.color }}
                            >
                              {finding.severityLabel}
                            </span>
                            <span className="text-xs text-muted-foreground font-mono">
                              {finding.severity.toFixed(1)}/10
                            </span>
                          </div>
                        </div>
                      </div>

                      <p className="text-xs text-muted-foreground mb-2">{finding.explanation}</p>

                      <div className="bg-muted/40 rounded p-2.5 border-l-2" style={{ borderColor: sev.color }}>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                          Clinical Significance
                        </p>
                        <p className="text-xs text-muted-foreground">{finding.clinicalSignificance}</p>
                      </div>

                      {finding.affectedTeeth.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {finding.affectedTeeth.slice(0, 16).map((id) => (
                            <span key={id} className="text-[10px] font-mono px-1.5 py-0.5 bg-muted rounded">
                              {id}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}

          {/* Normal findings summary */}
          {normalFindings.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold mb-3 pb-1 border-b">Within Normal Limits</h2>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left py-1.5 px-3 border border-border font-semibold">Parameter</th>
                    <th className="text-left py-1.5 px-3 border border-border font-semibold">Description</th>
                    <th className="text-center py-1.5 px-3 border border-border font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {normalFindings.map((f) => (
                    <tr key={f.id} className="border-b border-border/50">
                      <td className="py-1.5 px-3 border border-border font-medium">{ANALYSIS_META[f.type].name}</td>
                      <td className="py-1.5 px-3 border border-border text-muted-foreground">{ANALYSIS_META[f.type].description}</td>
                      <td className="py-1.5 px-3 border border-border text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: "#d1fae5", color: "#065f46" }}>
                          Normal
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Tooth Health Summary */}
          {analysis.affectedToothCount > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold mb-3 pb-1 border-b">Tooth Problem Summary</h2>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left py-1.5 px-3 border border-border font-semibold">Tooth</th>
                    <th className="text-left py-1.5 px-3 border border-border font-semibold">Name</th>
                    <th className="text-left py-1.5 px-3 border border-border font-semibold">Issues</th>
                    <th className="text-center py-1.5 px-3 border border-border font-semibold">Severity</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(analysis.toothHealthMap)
                    .filter(([, entry]) => entry.severity >= 0.5)
                    .sort(([, a], [, b]) => b.severity - a.severity)
                    .map(([idStr, entry]) => {
                      const id = parseInt(idStr);
                      const sev = SEV_STYLE[entry.severityLabel];
                      return (
                        <tr key={id} className="border-b border-border/50">
                          <td className="py-1.5 px-3 border border-border font-mono font-bold">{id}</td>
                          <td className="py-1.5 px-3 border border-border text-muted-foreground">{getFDIName(id)}</td>
                          <td className="py-1.5 px-3 border border-border">{entry.issues.join(", ")}</td>
                          <td className="py-1.5 px-3 border border-border text-center">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold capitalize" style={{ background: sev.bg, color: sev.color }}>
                              {entry.severityLabel}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer */}
          <div className="text-xs text-muted-foreground border-t pt-4 mt-4">
            <p>
              <strong>Disclaimer:</strong> This report is generated by AI-assisted orthodontic analysis and is
              intended to support qualified dental professionals. All findings must be verified by a licensed
              orthodontist. Normal ranges are population averages and may vary by patient demographics.
            </p>
            <p className="mt-2">Generated by OrthoDesk · {today} · Scan #{scanId}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
