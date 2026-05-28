import { cn } from "@/lib/utils";

interface ConfidenceBarProps {
  score: number; // 0-1
  showLabel?: boolean;
  size?: "sm" | "md";
}

export function ConfidenceBar({ score, showLabel = true, size = "md" }: ConfidenceBarProps) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 80 ? "bg-emerald-500" :
    pct >= 60 ? "bg-amber-500" :
    pct >= 40 ? "bg-orange-500" : "bg-red-500";
  const textColor =
    pct >= 80 ? "text-emerald-400" :
    pct >= 60 ? "text-amber-400" :
    pct >= 40 ? "text-orange-400" : "text-red-400";
  const label =
    pct >= 80 ? "High Confidence" :
    pct >= 60 ? "Moderate Confidence" :
    pct >= 40 ? "Low Confidence" : "Very Low Confidence";

  return (
    <div className={cn("space-y-1", size === "sm" ? "w-28" : "w-full")}>
      {showLabel && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className={cn("text-xs font-bold tabular-nums", textColor)}>{pct}%</span>
        </div>
      )}
      <div className={cn("rounded-full bg-muted overflow-hidden", size === "sm" ? "h-1.5" : "h-2")}>
        <div
          className={cn("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

interface MovementBadgeProps {
  type: string;
  color: string;
}

export function MovementBadge({ type, color }: MovementBadgeProps) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border"
      style={{
        color,
        borderColor: `${color}40`,
        backgroundColor: `${color}15`,
      }}
    >
      {type}
    </span>
  );
}
