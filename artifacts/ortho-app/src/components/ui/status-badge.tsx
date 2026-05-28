import { OrthoCaseStatus } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";

export const statusLabels: Record<OrthoCaseStatus, string> = {
  new: "New",
  scan_uploaded: "Scan Uploaded",
  analysis_completed: "Analysis Completed",
  treatment_planning: "Treatment Planning",
  approved: "Approved",
  manufacturing: "Manufacturing",
};

export const statusColors: Record<OrthoCaseStatus, "default" | "secondary" | "destructive" | "outline"> = {
  new: "outline",
  scan_uploaded: "secondary",
  analysis_completed: "secondary",
  treatment_planning: "default",
  approved: "default",
  manufacturing: "default",
};

export function StatusBadge({ status }: { status: OrthoCaseStatus }) {
  const isComplete = status === "manufacturing" || status === "approved";
  const isPending = status === "new" || status === "scan_uploaded";
  
  let colorClass = "";
  if (isComplete) colorClass = "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 border-emerald-200 dark:text-emerald-400 dark:border-emerald-800";
  else if (isPending) colorClass = "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
  else colorClass = "bg-primary/15 text-primary hover:bg-primary/25 border-primary/30";

  return (
    <Badge 
      variant={statusColors[status] || "default"} 
      className={`font-medium border shadow-none ${colorClass}`}
    >
      {statusLabels[status] || status}
    </Badge>
  );
}
