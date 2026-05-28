import { useState } from "react";
import { ChevronDown, ChevronUp, CheckCircle2, XCircle, Clock, AlertTriangle, Lightbulb, Shield, Target, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfidenceBar, MovementBadge } from "./ConfidenceBar";
import { MOVEMENT_COLORS, MOVEMENT_LABELS, PRIORITY_COLORS, type AiTreatmentPlan, type TreatmentPhase, type ToothMovement } from "./types";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface TreatmentPlanCardProps {
  plan: AiTreatmentPlan;
  onApprove: (planId: number) => Promise<void>;
  onReject: (planId: number) => Promise<void>;
  onDelete: (planId: number) => Promise<void>;
  isActioning: boolean;
}

function MovementRow({ movement }: { movement: ToothMovement }) {
  const [open, setOpen] = useState(false);
  const color = MOVEMENT_COLORS[movement.movementType] ?? "#888";

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-sm font-mono text-muted-foreground w-8 shrink-0">#{movement.toothId}</span>
        <span className="text-sm font-medium flex-1">{movement.toothLabel}</span>
        <MovementBadge type={MOVEMENT_LABELS[movement.movementType] ?? movement.movementType} color={color} />
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {movement.magnitude}{movement.unit}
        </span>
        <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0", PRIORITY_COLORS[movement.priority])}>
          {movement.priority}
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-border/40 bg-muted/10">
          <p className="text-sm text-foreground/90 leading-relaxed">{movement.rationale}</p>

          {movement.direction && (
            <p className="text-xs text-muted-foreground">Direction: <span className="text-foreground font-medium">{movement.direction}</span></p>
          )}

          {movement.risks.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" /> Risks
              </div>
              <ul className="space-y-0.5 pl-1">
                {movement.risks.map((r, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex gap-2">
                    <span className="text-amber-400 shrink-0">•</span> {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {movement.alternatives.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-400">
                <Lightbulb className="h-3.5 w-3.5" /> Alternatives
              </div>
              <ul className="space-y-0.5 pl-1">
                {movement.alternatives.map((a, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex gap-2">
                    <span className="text-blue-400 shrink-0">•</span> {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PhaseSection({ phase }: { phase: TreatmentPhase }) {
  const [open, setOpen] = useState(phase.phase === 1);

  return (
    <div className="border border-border/60 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center gap-3 p-4 hover:bg-muted/20 transition-colors text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-primary text-sm font-bold shrink-0">
          {phase.phase}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{phase.name}</p>
          <p className="text-xs text-muted-foreground">{phase.duration} · {phase.movements.length} movements</p>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/40">
          {phase.goals.length > 0 && (
            <div className="pt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Phase Goals</p>
              <div className="flex flex-wrap gap-1.5">
                {phase.goals.map((g, i) => (
                  <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{g}</span>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tooth Movements</p>
            {phase.movements
              .sort((a, b) => a.sequence - b.sequence)
              .map((m, i) => (
                <MovementRow key={i} movement={m} />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function TreatmentPlanCard({ plan, onApprove, onReject, onDelete, isActioning }: TreatmentPlanCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const pd = plan.planData;
  const totalMovements = pd.phases?.reduce((acc, p) => acc + (p.movements?.length ?? 0), 0) ?? 0;

  const statusConfig = {
    pending: { icon: Clock, label: "Pending Review", className: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
    approved: { icon: CheckCircle2, label: "Doctor Approved", className: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
    rejected: { icon: XCircle, label: "Rejected", className: "text-red-400 bg-red-500/10 border-red-500/30" },
  };
  const status = statusConfig[plan.doctorApproved] ?? statusConfig.pending;
  const StatusIcon = status.icon;

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      {/* Header */}
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={cn("text-xs flex items-center gap-1", status.className)}>
                <StatusIcon className="h-3 w-3" />
                {status.label}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {format(new Date(plan.createdAt), "MMM d, yyyy HH:mm")}
              </span>
            </div>
            <p className="mt-2 text-sm text-foreground/90 leading-relaxed">{pd.summary}</p>
          </div>
        </div>

        {/* Confidence */}
        <div className="bg-muted/30 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">AI Confidence</span>
            <span className="text-xs text-muted-foreground">Based on available clinical data</span>
          </div>
          <ConfidenceBar score={plan.confidenceScore} />
          {pd.evidenceBase && pd.evidenceBase.length > 0 && (
            <div className="pt-1">
              <p className="text-xs font-medium text-muted-foreground mb-1">Evidence base:</p>
              <ul className="space-y-0.5">
                {pd.evidenceBase.slice(0, 3).map((e, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                    <span className="text-primary shrink-0">›</span> {e}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center p-2 rounded-lg bg-muted/30">
            <p className="text-lg font-bold text-primary">{pd.phases?.length ?? 0}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Phases</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/30">
            <p className="text-lg font-bold text-primary">{totalMovements}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Movements</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/30">
            <p className="text-sm font-bold text-primary leading-tight">{pd.totalDuration}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Duration</p>
          </div>
        </div>
      </div>

      {/* Details toggle */}
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 border-t border-border/40 hover:bg-muted/20 transition-colors text-sm text-muted-foreground"
        onClick={() => setDetailsOpen((v) => !v)}
      >
        <span>Full treatment details</span>
        {detailsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {detailsOpen && (
        <div className="px-4 pb-4 space-y-5 border-t border-border/40">
          {/* Diagnosis */}
          {pd.diagnosis && (
            <div className="pt-4 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <Target className="h-3.5 w-3.5" /> Diagnosis
              </div>
              <p className="text-sm text-foreground/90 leading-relaxed">{pd.diagnosis}</p>
            </div>
          )}

          {/* Treatment goals */}
          {pd.treatmentGoals?.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <Target className="h-3.5 w-3.5" /> Treatment Goals
              </div>
              <ul className="space-y-1">
                {pd.treatmentGoals.map((g, i) => (
                  <li key={i} className="text-sm text-foreground/80 flex gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" /> {g}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Phases */}
          {pd.phases?.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <Layers className="h-3.5 w-3.5" /> Treatment Phases
              </div>
              <div className="space-y-2">
                {pd.phases.map((phase) => (
                  <PhaseSection key={phase.phase} phase={phase} />
                ))}
              </div>
            </div>
          )}

          {/* Appliances */}
          {pd.applianceRecommendations?.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <Lightbulb className="h-3.5 w-3.5" /> Appliance Recommendations
              </div>
              <ul className="space-y-1">
                {pd.applianceRecommendations.map((a, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex gap-2">
                    <span className="text-primary shrink-0">›</span> {a}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Retention */}
          {pd.retentionPlan && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <Shield className="h-3.5 w-3.5" /> Retention Plan
              </div>
              <p className="text-sm text-foreground/90 leading-relaxed">{pd.retentionPlan}</p>
            </div>
          )}

          {/* Overall risks */}
          {pd.risks?.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 uppercase tracking-wide">
                <AlertTriangle className="h-3.5 w-3.5" /> Overall Risks
              </div>
              <ul className="space-y-1">
                {pd.risks.map((r, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex gap-2">
                    <span className="text-amber-400 shrink-0">•</span> {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Alternatives */}
          {pd.alternatives?.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wide">
                <Lightbulb className="h-3.5 w-3.5" /> Alternative Treatments
              </div>
              <ul className="space-y-1">
                {pd.alternatives.map((a, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex gap-2">
                    <span className="text-blue-400 shrink-0">›</span> {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Safety notice + Actions */}
      {plan.doctorApproved === "pending" && (
        <div className="p-4 border-t border-border/40 space-y-3">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span><strong>Doctor approval required.</strong> AI recommendations must never be auto-applied. Review all movements carefully before approving.</span>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => onApprove(plan.id)}
              disabled={isActioning}
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Approve Plan
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-red-400 border-red-500/30 hover:bg-red-500/10"
              onClick={() => onReject(plan.id)}
              disabled={isActioning}
            >
              <XCircle className="h-4 w-4 mr-1.5" />
              Reject
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(plan.id)}
              disabled={isActioning}
            >
              Delete
            </Button>
          </div>
        </div>
      )}

      {plan.doctorApproved !== "pending" && (
        <div className="p-4 border-t border-border/40 flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive text-xs"
            onClick={() => onDelete(plan.id)}
            disabled={isActioning}
          >
            Delete plan
          </Button>
        </div>
      )}
    </div>
  );
}
