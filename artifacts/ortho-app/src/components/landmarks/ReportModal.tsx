import { useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";
import type { DentalMeasurement, ToothLandmark } from "./types";
import { LANDMARK_LABELS } from "./types";
import { getFDIName } from "../segmentation/fdiMapping";

interface ReportModalProps {
  open: boolean;
  onClose: () => void;
  scanId: number;
  jawType: string;
  landmarks: ToothLandmark[];
  measurements: DentalMeasurement[];
  scanName?: string;
}

const STATUS_STYLE = {
  normal: { bg: "#d1fae5", color: "#065f46", label: "Normal" },
  warning: { bg: "#fef3c7", color: "#92400e", label: "Review" },
  alert: { bg: "#fee2e2", color: "#991b1b", label: "Abnormal" },
  info: { bg: "#dbeafe", color: "#1e40af", label: "Info" },
};

export function ReportModal({
  open,
  onClose,
  scanId,
  jawType,
  landmarks,
  measurements,
  scanName,
}: ReportModalProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const printWin = window.open("", "_blank", "width=900,height=700");
    if (!printWin) return;
    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Dental Measurement Report</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; font-size: 11px; color: #1a1a1a; padding: 24px; }
          h1 { font-size: 18px; color: #1a1a1a; margin-bottom: 4px; }
          h2 { font-size: 13px; color: #444; margin: 16px 0 6px 0; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
          h3 { font-size: 11px; color: #666; margin: 12px 0 4px 0; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
          .meta { font-size: 10px; color: #666; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
          th { background: #f3f4f6; text-align: left; padding: 5px 8px; font-size: 10px; font-weight: 600; color: #374151; border: 1px solid #e5e7eb; }
          td { padding: 4px 8px; border: 1px solid #e5e7eb; vertical-align: middle; }
          .badge { display: inline-block; padding: 1px 6px; border-radius: 10px; font-size: 9px; font-weight: 600; }
          .footer { margin-top: 20px; font-size: 9px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 8px; }
          @media print { body { padding: 12px; } }
        </style>
      </head>
      <body>
        ${content.innerHTML}
      </body>
      </html>
    `);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => { printWin.print(); printWin.close(); }, 400);
  };

  const byTooth = new Map<number, ToothLandmark[]>();
  for (const lm of landmarks) {
    if (!byTooth.has(lm.toothId)) byTooth.set(lm.toothId, []);
    byTooth.get(lm.toothId)!.push(lm);
  }

  const measurementsByGroup: Record<string, DentalMeasurement[]> = {
    "Arch Width & Length": measurements.filter(
      (m) => m.type === "arch_width" || m.type === "arch_length"
    ),
    "Inter-Canine & Inter-Molar": measurements.filter(
      (m) => m.type === "inter_canine" || m.type === "inter_molar"
    ),
    "Individual Tooth Widths": measurements.filter((m) => m.type === "tooth_width"),
    "Midline Analysis": measurements.filter((m) => m.type === "midline_deviation"),
  };

  const alertCount = measurements.filter((m) => m.status === "alert").length;
  const normalCount = measurements.filter((m) => m.status === "normal").length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-background z-10">
          <DialogTitle className="text-base">Dental Measurement Report</DialogTitle>
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
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 style={{ fontSize: 18, fontWeight: "bold", marginBottom: 4 }}>
                Dental Measurement Report
              </h1>
              <p className="text-sm text-muted-foreground">
                Scan: <strong>{scanName ?? `Scan #${scanId}`}</strong>
              </p>
              <p className="text-sm text-muted-foreground capitalize">
                Arch: <strong>{jawType}</strong> · Generated: <strong>{today}</strong>
              </p>
            </div>
            <div className="text-right text-sm text-muted-foreground">
              <p className="font-semibold text-foreground">OrthoDesk</p>
              <p>{landmarks.length} landmarks detected</p>
              <p>{byTooth.size} teeth analyzed</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: "Total Measurements", value: measurements.length, color: "bg-blue-50 text-blue-800" },
              { label: "Normal Values", value: normalCount, color: "bg-green-50 text-green-800" },
              { label: "Needs Review", value: alertCount + measurements.filter((m) => m.status === "warning").length, color: alertCount > 0 ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800" },
            ].map((card) => (
              <div key={card.label} className={`rounded-lg p-4 ${card.color}`}>
                <p className="text-2xl font-bold">{card.value}</p>
                <p className="text-xs mt-1">{card.label}</p>
              </div>
            ))}
          </div>

          {Object.entries(measurementsByGroup).map(([group, items]) => {
            if (items.length === 0) return null;
            return (
              <div key={group} className="mb-6">
                <h2 className="text-sm font-semibold mb-3 pb-1 border-b">{group}</h2>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left py-1.5 px-3 border border-border font-semibold">Measurement</th>
                      <th className="text-left py-1.5 px-3 border border-border font-semibold">Teeth</th>
                      <th className="text-right py-1.5 px-3 border border-border font-semibold">Value</th>
                      <th className="text-center py-1.5 px-3 border border-border font-semibold">Normal Range</th>
                      <th className="text-center py-1.5 px-3 border border-border font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((m) => {
                      const s = STATUS_STYLE[m.status];
                      return (
                        <tr key={m.id} className="border-b border-border/50 hover:bg-muted/20">
                          <td className="py-1.5 px-3 border border-border">{m.name}</td>
                          <td className="py-1.5 px-3 border border-border text-muted-foreground font-mono">
                            {m.teeth.length <= 2 ? m.teeth.join(", ") : `${m.teeth.length} teeth`}
                          </td>
                          <td className="py-1.5 px-3 border border-border text-right font-mono font-bold">
                            {m.value} {m.unit}
                          </td>
                          <td className="py-1.5 px-3 border border-border text-center text-muted-foreground">
                            {m.normalRange ? `${m.normalRange[0]}–${m.normalRange[1]} ${m.unit}` : "—"}
                          </td>
                          <td className="py-1.5 px-3 border border-border text-center">
                            <span
                              className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full"
                              style={{ background: s.bg, color: s.color }}
                            >
                              {s.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}

          <div className="mb-6">
            <h2 className="text-sm font-semibold mb-3 pb-1 border-b">Landmark Summary</h2>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left py-1.5 px-3 border border-border font-semibold">Tooth</th>
                  <th className="text-left py-1.5 px-3 border border-border font-semibold">Landmarks Detected</th>
                  <th className="text-center py-1.5 px-3 border border-border font-semibold">Manual Override</th>
                  <th className="text-center py-1.5 px-3 border border-border font-semibold">Avg. Confidence</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(byTooth.entries())
                  .sort(([a], [b]) => a - b)
                  .map(([toothId, lms]) => {
                    const manualCount = lms.filter((l) => l.isManual).length;
                    const avgConf = Math.round(
                      lms.reduce((s, l) => s + l.confidence, 0) / lms.length
                    );
                    return (
                      <tr key={toothId} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="py-1.5 px-3 border border-border font-mono font-bold">{toothId}</td>
                        <td className="py-1.5 px-3 border border-border">
                          {lms.map((l) => LANDMARK_LABELS[l.type as keyof typeof LANDMARK_LABELS] ?? l.type).join(", ")}
                        </td>
                        <td className="py-1.5 px-3 border border-border text-center">
                          {manualCount > 0 ? (
                            <span className="text-amber-600 font-medium">{manualCount} adjusted</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-1.5 px-3 border border-border text-center font-mono">
                          {avgConf}%
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          <div className="text-xs text-muted-foreground border-t pt-4 mt-4">
            <p>
              <strong>Disclaimer:</strong> This report is generated by AI-assisted landmark detection and is intended to
              assist qualified dental professionals. All measurements should be verified by a licensed orthodontist
              before clinical decisions are made. Normal ranges are approximate population averages.
            </p>
            <p className="mt-2">Generated by OrthoDesk · {today} · Scan #{scanId}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
