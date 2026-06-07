import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info, Paperclip, AlertTriangle, CheckCircle, ChevronDown, ChevronUp } from "lucide-react";
import { ToothChart } from "@/components/tooth-chart";

interface AttachmentRule {
  type: string;
  shape: string;
  color: string;
  reason: string;
  threshold: string;
}

interface ToothAttachment {
  fdi: number;
  label: string;
  attachments: AttachmentRule[];
  movementSummary: string;
}

const FDI_NAMES: Record<number, string> = {
  11:"UR Central",12:"UR Lateral",13:"UR Canine",14:"UR 1st Premolar",15:"UR 2nd Premolar",16:"UR 1st Molar",17:"UR 2nd Molar",
  21:"UL Central",22:"UL Lateral",23:"UL Canine",24:"UL 1st Premolar",25:"UL 2nd Premolar",26:"UL 1st Molar",27:"UL 2nd Molar",
  31:"LL Central",32:"LL Lateral",33:"LL Canine",34:"LL 1st Premolar",35:"LL 2nd Premolar",36:"LL 1st Molar",37:"LL 2nd Molar",
  41:"LR Central",42:"LR Lateral",43:"LR Canine",44:"LR 1st Premolar",45:"LR 2nd Premolar",46:"LR 1st Molar",47:"LR 2nd Molar",
};

interface ToothInput {
  fdi: number;
  extrusion: number;
  intrusion: number;
  torque: number;
  rotation: number;
  translation: number;
  tipping: number;
}

const ATTACHMENT_RULES: { condition: (t: ToothInput) => boolean; rule: AttachmentRule }[] = [
  {
    condition: t => Math.abs(t.extrusion) >= 0.5,
    rule: { type: "Vertical Ellipsoid", shape: "vertical-ellipse", color: "#3b82f6", reason: "Extrusion retention", threshold: "Extrusion ≥ 0.5 mm" },
  },
  {
    condition: t => Math.abs(t.intrusion) >= 0.5,
    rule: { type: "Horizontal Ellipsoid", shape: "horizontal-ellipse", color: "#06b6d4", reason: "Intrusion force point", threshold: "Intrusion ≥ 0.5 mm" },
  },
  {
    condition: t => Math.abs(t.rotation) >= 20,
    rule: { type: "Rectangular (Optimised)", shape: "rectangle", color: "#8b5cf6", reason: "Rotation control", threshold: "Rotation ≥ 20°" },
  },
  {
    condition: t => Math.abs(t.torque) >= 5,
    rule: { type: "Bevelled Rectangular", shape: "bevelled-rect", color: "#f59e0b", reason: "Torque expression", threshold: "Torque ≥ 5°" },
  },
  {
    condition: t => Math.abs(t.translation) >= 2,
    rule: { type: "Power Ridge", shape: "ridge", color: "#10b981", reason: "Bodily movement anchor", threshold: "Translation ≥ 2 mm" },
  },
  {
    condition: t => Math.abs(t.tipping) >= 10,
    rule: { type: "Horizontal Rectangular", shape: "horizontal-rect", color: "#ec4899", reason: "Anti-tip correction", threshold: "Tipping ≥ 10°" },
  },
];

const SHAPE_ICON: Record<string, string> = {
  "vertical-ellipse": "▊",
  "horizontal-ellipse": "▬",
  "rectangle": "▪",
  "bevelled-rect": "◇",
  "ridge": "▲",
  "horizontal-rect": "━",
};

function analyseAttachments(inputs: ToothInput[]): ToothAttachment[] {
  return inputs
    .map(tooth => {
      const matchedRules = ATTACHMENT_RULES.filter(r => r.condition(tooth)).map(r => r.rule);
      const moves: string[] = [];
      if (Math.abs(tooth.extrusion) >= 0.5) moves.push(`Ex ${tooth.extrusion.toFixed(1)} mm`);
      if (Math.abs(tooth.intrusion) >= 0.5) moves.push(`In ${tooth.intrusion.toFixed(1)} mm`);
      if (Math.abs(tooth.rotation) >= 1) moves.push(`Rot ${tooth.rotation.toFixed(0)}°`);
      if (Math.abs(tooth.torque) >= 1) moves.push(`Torque ${tooth.torque.toFixed(0)}°`);
      if (Math.abs(tooth.translation) >= 0.1) moves.push(`Trans ${tooth.translation.toFixed(1)} mm`);
      if (Math.abs(tooth.tipping) >= 1) moves.push(`Tip ${tooth.tipping.toFixed(0)}°`);
      return {
        fdi: tooth.fdi,
        label: FDI_NAMES[tooth.fdi] ?? `Tooth ${tooth.fdi}`,
        attachments: matchedRules,
        movementSummary: moves.join(", ") || "No significant movement",
      };
    })
    .filter(t => t.attachments.length > 0);
}

const DEFAULT_INPUTS: ToothInput[] = [
  { fdi: 13, extrusion: 0, intrusion: 0, torque: 8, rotation: 25, translation: 0, tipping: 0 },
  { fdi: 23, extrusion: 1.2, intrusion: 0, torque: 6, rotation: 0, translation: 0, tipping: 0 },
  { fdi: 14, extrusion: 0, intrusion: 0, torque: 0, rotation: 0, translation: 3.5, tipping: 15 },
  { fdi: 15, extrusion: 0, intrusion: 0.8, torque: 0, rotation: 22, translation: 0, tipping: 0 },
  { fdi: 24, extrusion: 0.7, intrusion: 0, torque: 0, rotation: 0, translation: 2.1, tipping: 0 },
  { fdi: 43, extrusion: 0, intrusion: 0, torque: 7, rotation: 18, translation: 1.8, tipping: 12 },
  { fdi: 33, extrusion: 1.5, intrusion: 0, torque: 0, rotation: 30, translation: 0, tipping: 0 },
];

function AttachmentShape({ shape, color }: { shape: string; color: string }) {
  const baseStyle = "inline-flex items-center justify-center text-white text-xs font-bold rounded shadow";
  if (shape === "vertical-ellipse") return <span className={`${baseStyle} w-4 h-7`} style={{ background: color, borderRadius: "50%" }}>▊</span>;
  if (shape === "horizontal-ellipse") return <span className={`${baseStyle} w-7 h-4`} style={{ background: color, borderRadius: "50%" }}>▬</span>;
  if (shape === "rectangle") return <span className={`${baseStyle} w-5 h-5 rounded-sm`} style={{ background: color }}>▪</span>;
  if (shape === "bevelled-rect") return <span className={`${baseStyle} w-5 h-5`} style={{ background: color, borderRadius: "2px 6px" }}>◇</span>;
  if (shape === "ridge") return <span className={`${baseStyle} w-5 h-4`} style={{ background: color, clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)" }}>&nbsp;</span>;
  return <span className={`${baseStyle} w-7 h-3 rounded-sm`} style={{ background: color }}>━</span>;
}

export default function AttachmentAdvisor() {
  const [inputs, setInputs] = useState<ToothInput[]>(DEFAULT_INPUTS);
  const [selectedFdi, setSelectedFdi] = useState<number | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editFdi, setEditFdi] = useState<number | null>(null);
  const [newFdi, setNewFdi] = useState(11);

  const results = analyseAttachments(inputs);
  const needsAttachmentFdis = results.map(r => r.fdi);

  const editingTooth = inputs.find(t => t.fdi === editFdi);

  const updateField = (fdi: number, field: keyof ToothInput, value: number) => {
    setInputs(prev => prev.map(t => t.fdi === fdi ? { ...t, [field]: value } : t));
  };

  const addTooth = () => {
    if (inputs.find(t => t.fdi === newFdi)) return;
    setInputs(prev => [...prev, { fdi: newFdi, extrusion: 0, intrusion: 0, torque: 0, rotation: 0, translation: 0, tipping: 0 }]);
    setEditFdi(newFdi);
  };

  const removeTooth = (fdi: number) => {
    setInputs(prev => prev.filter(t => t.fdi !== fdi));
    if (editFdi === fdi) setEditFdi(null);
  };

  const MOVEMENT_FIELDS: { key: keyof ToothInput; label: string; unit: string; min: number; max: number; step: number }[] = [
    { key: "extrusion", label: "Extrusion", unit: "mm", min: 0, max: 5, step: 0.1 },
    { key: "intrusion", label: "Intrusion", unit: "mm", min: 0, max: 5, step: 0.1 },
    { key: "rotation", label: "Rotation", unit: "°", min: -45, max: 45, step: 1 },
    { key: "torque", label: "Torque", unit: "°", min: -30, max: 30, step: 1 },
    { key: "translation", label: "Translation", unit: "mm", min: -6, max: 6, step: 0.1 },
    { key: "tipping", label: "Tipping", unit: "°", min: -30, max: 30, step: 1 },
  ];

  const totalAttachments = results.reduce((sum, r) => sum + r.attachments.length, 0);

  return (
    <Layout>
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Paperclip className="h-8 w-8 text-cyan-400" /> Attachment Placement Advisor
            </h1>
            <p className="text-muted-foreground mt-1">
              Analyzes your movement plan and recommends composite attachment types for each tooth.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowEditor(!showEditor)} className="gap-2">
            {showEditor ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {showEditor ? "Hide" : "Edit"} Movements
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Tooth Chart */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Tooth Map</CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              <ToothChart
                selectedFdi={selectedFdi}
                activeFdis={inputs.map(t => t.fdi)}
                highlightedFdis={Object.fromEntries(needsAttachmentFdis.map(fdi => [fdi, "#f59e0b"]))}
                onSelect={fdi => { setSelectedFdi(fdi); setEditFdi(fdi); }}
              />
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-amber-500 inline-block" /> Attachment needed</div>
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-primary/30 inline-block" /> Tooth in plan</div>
              </div>
            </CardContent>
          </Card>

          {/* Results */}
          <div className="lg:col-span-3 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Card><CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Teeth with Attachments</p>
                <p className="text-3xl font-bold text-amber-400">{results.length}</p>
              </CardContent></Card>
              <Card><CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Total Attachment Points</p>
                <p className="text-3xl font-bold text-cyan-400">{totalAttachments}</p>
              </CardContent></Card>
              <Card><CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Teeth in Plan</p>
                <p className="text-3xl font-bold text-primary">{inputs.length}</p>
              </CardContent></Card>
            </div>

            <ScrollArea className="h-[420px]">
              <div className="space-y-3 pr-2">
                {results.length === 0 ? (
                  <Card><CardContent className="py-12 text-center text-muted-foreground">
                    <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-400 opacity-60" />
                    <p>No attachments needed for current movement values.</p>
                    <p className="text-sm mt-1">Add teeth with larger movements to see recommendations.</p>
                  </CardContent></Card>
                ) : results.map(result => (
                  <Card
                    key={result.fdi}
                    className={`transition-colors cursor-pointer ${selectedFdi === result.fdi ? "border-amber-500/50 bg-amber-500/5" : "hover:border-border/80"}`}
                    onClick={() => { setSelectedFdi(result.fdi); setEditFdi(result.fdi); }}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded font-bold">{result.fdi}</span>
                            <span className="font-medium text-sm">{result.label}</span>
                            <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/40">
                              {result.attachments.length} attachment{result.attachments.length > 1 ? "s" : ""}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mb-3">{result.movementSummary}</p>
                          <div className="flex flex-wrap gap-2">
                            {result.attachments.map((att, i) => (
                              <Tooltip key={i}>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-1.5 bg-muted/50 border border-border rounded-lg px-2.5 py-1.5 cursor-help">
                                    <AttachmentShape shape={att.shape} color={att.color} />
                                    <div>
                                      <p className="text-[11px] font-medium leading-tight">{att.type}</p>
                                      <p className="text-[10px] text-muted-foreground">{att.reason}</p>
                                    </div>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                  <p className="font-semibold">{att.type}</p>
                                  <p className="text-muted-foreground">{att.threshold}</p>
                                  <p>{att.reason}</p>
                                </TooltipContent>
                              </Tooltip>
                            ))}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* Movement Editor */}
        {showEditor && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" /> Movement Input Editor
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2 items-center">
                <select
                  className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  value={newFdi}
                  onChange={e => setNewFdi(Number(e.target.value))}
                >
                  {Object.entries(FDI_NAMES).map(([fdi, name]) => (
                    <option key={fdi} value={fdi}>{fdi} — {name}</option>
                  ))}
                </select>
                <Button size="sm" onClick={addTooth} variant="outline">Add Tooth</Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {inputs.map(tooth => (
                  <Card key={tooth.fdi} className={`${editFdi === tooth.fdi ? "border-cyan-500/40" : ""}`}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold">{tooth.fdi}</span>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">{FDI_NAMES[tooth.fdi] ?? "Unknown"}</span>
                          <button className="text-destructive hover:text-destructive/80 text-xs ml-1" onClick={() => removeTooth(tooth.fdi)}>✕</button>
                        </div>
                      </div>
                      {MOVEMENT_FIELDS.map(f => (
                        <div key={String(f.key)} className="flex items-center justify-between gap-2">
                          <label className="text-[11px] text-muted-foreground w-20 shrink-0">{f.label}</label>
                          <input
                            type="number"
                            min={f.min}
                            max={f.max}
                            step={f.step}
                            value={(tooth[f.key] as number).toFixed(f.step < 1 ? 1 : 0)}
                            onChange={e => updateField(tooth.fdi, f.key, parseFloat(e.target.value) || 0)}
                            className="h-6 w-20 rounded border border-input bg-background px-2 text-xs text-right"
                          />
                          <span className="text-[10px] text-muted-foreground w-5">{f.unit}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Reference Guide */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><Info className="h-4 w-4 text-muted-foreground" />Attachment Reference Guide</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {ATTACHMENT_RULES.map(r => (
                <div key={r.rule.type} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <AttachmentShape shape={r.rule.shape} color={r.rule.color} />
                    <span className="text-xs font-medium leading-tight">{r.rule.type}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{r.rule.reason}</p>
                  <Badge variant="outline" className="text-[9px]">{r.rule.threshold}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
