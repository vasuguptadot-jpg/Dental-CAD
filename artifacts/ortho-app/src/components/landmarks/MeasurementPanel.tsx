import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Loader2, Save, FileText, ChevronDown, ChevronRight, Info } from "lucide-react";
import type { DentalMeasurement, ToothLandmark, LandmarkType } from "./types";
import { LANDMARK_LABELS, LANDMARK_COLORS } from "./types";

interface MeasurementPanelProps {
  landmarks: ToothLandmark[];
  measurements: DentalMeasurement[];
  selectedLandmarkId: string | null;
  isSaving: boolean;
  hasSaved: boolean;
  onSelectLandmark: (id: string | null) => void;
  onSave: () => void;
  onReport: () => void;
  onRedetect: () => void;
}

const STATUS_COLORS = {
  normal: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
  warning: "text-amber-400 bg-amber-400/10 border-amber-400/30",
  alert: "text-rose-400 bg-rose-400/10 border-rose-400/30",
  info: "text-sky-400 bg-sky-400/10 border-sky-400/30",
};

const STATUS_LABELS = {
  normal: "Normal",
  warning: "Review",
  alert: "Abnormal",
  info: "Info",
};

const TYPE_GROUPS: Record<string, DentalMeasurement["type"][]> = {
  "Arch Dimensions": ["arch_width", "arch_length"],
  "Width Analysis": ["inter_canine", "inter_molar"],
  "Tooth Widths": ["tooth_width"],
  "Midline": ["midline_deviation"],
};

export function MeasurementPanel({
  landmarks,
  measurements,
  selectedLandmarkId,
  isSaving,
  hasSaved,
  onSelectLandmark,
  onSave,
  onReport,
  onRedetect,
}: MeasurementPanelProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(["Arch Dimensions", "Width Analysis", "Midline"])
  );

  const toggleGroup = (g: string) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(g) ? next.delete(g) : next.add(g);
      return next;
    });

  const groupedMeasurements = Object.entries(TYPE_GROUPS).map(([group, types]) => ({
    group,
    items: measurements.filter((m) => types.includes(m.type)),
  }));

  const byToothId = new Map<number, ToothLandmark[]>();
  for (const lm of landmarks) {
    if (!byToothId.has(lm.toothId)) byToothId.set(lm.toothId, []);
    byToothId.get(lm.toothId)!.push(lm);
  }

  const alertCount = measurements.filter((m) => m.status === "alert").length;
  const warningCount = measurements.filter((m) => m.status === "warning").length;

  return (
    <div className="flex flex-col h-full bg-[#0d1117] text-white border-l border-white/10 w-72 shrink-0">
      <div className="p-3 border-b border-white/10">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">Measurements</p>
          <div className="flex gap-1">
            {alertCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 font-mono">
                {alertCount} ⚠
              </span>
            )}
            {warningCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 font-mono">
                {warningCount} ~
              </span>
            )}
          </div>
        </div>
        <div className="text-xs text-white/40">
          <span className="text-white font-medium">{landmarks.length}</span> landmarks on{" "}
          <span className="text-white font-medium">{byToothId.size}</span> teeth
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {groupedMeasurements.map(({ group, items }) => {
            if (items.length === 0) return null;
            const isOpen = expandedGroups.has(group);
            return (
              <div key={group}>
                <button
                  onClick={() => toggleGroup(group)}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-white/5 text-xs font-semibold text-white/60 uppercase tracking-wider"
                >
                  <span>{group}</span>
                  <span className="flex items-center gap-1">
                    <span className="text-white/30 font-normal normal-case">{items.length}</span>
                    {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  </span>
                </button>

                {isOpen && (
                  <div className="space-y-1 ml-1 mt-0.5 mb-1.5">
                    {items.map((m) => (
                      <TooltipProvider key={m.id} delayDuration={400}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 cursor-default">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-white/80 truncate">{m.name}</p>
                                {m.normalRange && (
                                  <p className="text-[10px] text-white/30 mt-0.5">
                                    Normal: {m.normalRange[0]}–{m.normalRange[1]} {m.unit}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-sm font-mono font-bold text-white">
                                  {m.value}
                                </span>
                                <span className="text-[10px] text-white/30">{m.unit}</span>
                                <span
                                  className={`text-[9px] px-1 py-0.5 rounded border font-medium ${STATUS_COLORS[m.status]}`}
                                >
                                  {STATUS_LABELS[m.status]}
                                </span>
                              </div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-[200px] text-xs">
                            {m.description}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {measurements.length === 0 && (
            <div className="text-center py-8 text-white/30 text-xs">
              <p>No measurements available.</p>
              <p className="mt-1">Run landmark detection first.</p>
            </div>
          )}
        </div>

        {landmarks.length > 0 && (
          <>
            <Separator className="bg-white/10 mx-2" />
            <div className="p-2 pb-1">
              <p className="text-xs font-semibold text-white/50 uppercase tracking-wider px-2 py-1.5">
                Landmark Legend
              </p>
              <div className="space-y-1 px-2">
                {(Object.keys(LANDMARK_LABELS) as LandmarkType[]).map((type) => (
                  <div key={type} className="flex items-center gap-2 text-xs text-white/60">
                    <div
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: LANDMARK_COLORS[type] }}
                    />
                    {LANDMARK_LABELS[type]}
                  </div>
                ))}
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
          disabled={isSaving || landmarks.length === 0}
        >
          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {isSaving ? "Saving…" : "Save Landmarks"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="w-full h-8 text-xs gap-1.5 border-white/15 text-white/70 hover:text-white hover:bg-white/10"
          onClick={onReport}
          disabled={measurements.length === 0}
        >
          <FileText className="h-3.5 w-3.5" />
          Generate Report
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="w-full h-8 text-xs gap-1.5 text-white/40 hover:text-white hover:bg-white/10"
          onClick={onRedetect}
        >
          Re-detect Landmarks
        </Button>
      </div>
    </div>
  );
}
