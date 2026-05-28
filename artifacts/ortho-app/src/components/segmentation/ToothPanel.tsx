import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { getFDIName } from "./fdiMapping";
import type { ToothSegmentData, CorrectionTool } from "./types";
import { Merge, Scissors, Tag, Loader2, Save, Undo2 } from "lucide-react";

interface ToothPanelProps {
  segments: ToothSegmentData[];
  selectedToothId: number | null;
  hoveredToothId: number | null;
  activeTool: CorrectionTool;
  mergeFirst: number | null;
  isSaving: boolean;
  hasSavedResults: boolean;
  onSelectTooth: (toothId: number) => void;
  onSetTool: (tool: CorrectionTool) => void;
  onMergeTrigger: (toothId: number) => void;
  onSplitTrigger: (toothId: number) => void;
  onRename: (toothId: number, newLabel: string, newToothId: number) => void;
  onSave: () => void;
  onReset: () => void;
}

export function ToothPanel({
  segments,
  selectedToothId,
  hoveredToothId,
  activeTool,
  mergeFirst,
  isSaving,
  hasSavedResults,
  onSelectTooth,
  onSetTool,
  onMergeTrigger,
  onSplitTrigger,
  onRename,
  onSave,
  onReset,
}: ToothPanelProps) {
  const [renameDialog, setRenameDialog] = useState<{ open: boolean; toothId: number; label: string; fdid: string }>({
    open: false,
    toothId: 0,
    label: "",
    fdid: "",
  });

  const handleToothClick = (seg: ToothSegmentData) => {
    if (activeTool === "merge") {
      onMergeTrigger(seg.toothId);
    } else if (activeTool === "split") {
      onSplitTrigger(seg.toothId);
      onSetTool("none");
    } else if (activeTool === "rename") {
      setRenameDialog({ open: true, toothId: seg.toothId, label: seg.label, fdid: String(seg.toothId) });
    } else {
      onSelectTooth(seg.toothId);
    }
  };

  const handleRenameConfirm = () => {
    const newId = parseInt(renameDialog.fdid, 10);
    if (!isNaN(newId)) {
      onRename(renameDialog.toothId, renameDialog.fdid, newId);
    }
    setRenameDialog((s) => ({ ...s, open: false }));
    onSetTool("none");
  };

  const toolButtons: { tool: CorrectionTool; icon: React.ReactNode; label: string; desc: string }[] = [
    { tool: "merge", icon: <Merge className="h-3.5 w-3.5" />, label: "Merge", desc: "Click two teeth to merge" },
    { tool: "split", icon: <Scissors className="h-3.5 w-3.5" />, label: "Split", desc: "Click tooth to split at midplane" },
    { tool: "rename", icon: <Tag className="h-3.5 w-3.5" />, label: "Rename", desc: "Click tooth to reassign FDI" },
  ];

  const selectedSeg = segments.find((s) => s.toothId === selectedToothId);

  return (
    <div className="flex flex-col h-full bg-[#0d1117] text-white border-l border-white/10 w-64 shrink-0">
      <div className="p-3 border-b border-white/10">
        <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">Correction Tools</p>
        <div className="flex gap-1.5 flex-wrap">
          {toolButtons.map(({ tool, icon, label }) => (
            <Button
              key={tool}
              variant="ghost"
              size="sm"
              className={`h-7 px-2 text-xs flex items-center gap-1.5 ${
                activeTool === tool
                  ? "bg-primary/30 text-primary border border-primary/40"
                  : "text-white/60 hover:text-white hover:bg-white/10 border border-white/10"
              }`}
              onClick={() => onSetTool(activeTool === tool ? "none" : tool)}
            >
              {icon}
              {label}
            </Button>
          ))}
        </div>
        {activeTool === "merge" && (
          <p className="text-xs text-amber-400 mt-2">
            {mergeFirst !== null ? `First: ${mergeFirst} — click second tooth` : "Click first tooth to merge"}
          </p>
        )}
        {activeTool === "split" && (
          <p className="text-xs text-sky-400 mt-2">Click a tooth to split it</p>
        )}
        {activeTool === "rename" && (
          <p className="text-xs text-violet-400 mt-2">Click a tooth to reassign its FDI number</p>
        )}
      </div>

      <div className="p-3 border-b border-white/10">
        <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">
          Teeth ({segments.length})
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {segments.map((seg) => {
            const isSelected = selectedToothId === seg.toothId;
            const isHovered = hoveredToothId === seg.toothId;
            const isMergeFirst = mergeFirst === seg.toothId;

            return (
              <button
                key={seg.toothId}
                onClick={() => handleToothClick(seg)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left transition-colors ${
                  isSelected
                    ? "bg-white/15 border border-white/20"
                    : isMergeFirst
                    ? "bg-amber-500/20 border border-amber-500/40"
                    : isHovered
                    ? "bg-white/8 border border-white/10"
                    : "hover:bg-white/8 border border-transparent"
                }`}
              >
                <div
                  className="h-3.5 w-3.5 rounded-sm shrink-0"
                  style={{ backgroundColor: seg.color }}
                />
                <span className="text-sm font-mono font-semibold text-white">{seg.label}</span>
                <span className="text-xs text-white/40 truncate flex-1">{getFDIName(seg.toothId)}</span>
                <Badge
                  variant="outline"
                  className="text-[9px] px-1 py-0 border-white/20 text-white/40 font-mono shrink-0"
                >
                  {(seg.faceIndices.length / 1000).toFixed(0)}k
                </Badge>
              </button>
            );
          })}
        </div>
      </ScrollArea>

      {selectedSeg && (
        <div className="p-3 border-t border-white/10 bg-white/5">
          <p className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">Selected</p>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-4 w-4 rounded-sm" style={{ backgroundColor: selectedSeg.color }} />
            <span className="text-sm font-bold text-white font-mono">{selectedSeg.label}</span>
          </div>
          <p className="text-xs text-white/50">{getFDIName(selectedSeg.toothId)}</p>
          <p className="text-xs text-white/30 mt-1">{selectedSeg.faceIndices.length.toLocaleString()} faces</p>
        </div>
      )}

      <Separator className="bg-white/10" />
      <div className="p-3 space-y-2">
        <Button
          size="sm"
          className="w-full h-8 text-xs gap-1.5 bg-primary hover:bg-primary/90"
          onClick={onSave}
          disabled={isSaving || segments.length === 0}
        >
          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {isSaving ? "Saving…" : "Save Segmentation"}
        </Button>
        {hasSavedResults && (
          <Button
            size="sm"
            variant="ghost"
            className="w-full h-8 text-xs gap-1.5 text-white/50 hover:text-white hover:bg-white/10"
            onClick={onReset}
          >
            <Undo2 className="h-3.5 w-3.5" />
            Re-run AI
          </Button>
        )}
      </div>

      <Dialog open={renameDialog.open} onOpenChange={(o) => setRenameDialog((s) => ({ ...s, open: o }))}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Reassign FDI Number</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Current: <span className="font-mono font-bold">{renameDialog.label}</span> — {getFDIName(renameDialog.toothId)}
            </p>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">New FDI Number (e.g. 14, 25, 36)</label>
              <Input
                value={renameDialog.fdid}
                onChange={(e) => setRenameDialog((s) => ({ ...s, fdid: e.target.value }))}
                placeholder="11–48"
                className="font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRenameDialog((s) => ({ ...s, open: false }))}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleRenameConfirm}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
