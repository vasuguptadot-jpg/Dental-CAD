import { useState, useEffect, useCallback } from "react";
import { Sparkles, Loader2, RefreshCw, MessageSquare, ClipboardList, Info, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { TreatmentPlanCard } from "./TreatmentPlanCard";
import { AIChatPanel } from "./AIChatPanel";
import type { AiTreatmentPlan } from "./types";
import type { Scan as ScanType } from "@workspace/api-client-react";

interface AICopilotPanelProps {
  caseId: number;
  selectedScan: ScanType | null;
  segments: { toothId: number; label: string }[];
  analysis: { complexityLabel: string; findings: unknown[] } | null;
}

export function AICopilotPanel({ caseId, selectedScan, segments, analysis }: AICopilotPanelProps) {
  const { toast } = useToast();
  const [plans, setPlans] = useState<AiTreatmentPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [actioning, setActioning] = useState(false);
  const [activeTab, setActiveTab] = useState("plans");

  const loadPlans = useCallback(async () => {
    setLoadingPlans(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/ai/plans`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setPlans(data);
      }
    } catch {
      // silent
    } finally {
      setLoadingPlans(false);
    }
  }, [caseId]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/ai/generate-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ scanId: selectedScan?.id }),
      });
      if (!res.ok) throw new Error("Generation failed");
      const newPlan = await res.json();
      setPlans((prev) => [...prev, newPlan]);
      setActiveTab("plans");
      toast({ title: "Treatment plan generated", description: "Review and approve or reject the AI recommendation." });
    } catch {
      toast({ title: "Generation failed", description: "Could not generate AI treatment plan.", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleApprove = async (planId: number) => {
    setActioning(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/ai/plans/${planId}/approval`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ decision: "approved" }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setPlans((prev) => prev.map((p) => (p.id === planId ? updated : p)));
      toast({ title: "Plan approved", description: "Treatment plan has been approved by doctor." });
    } catch {
      toast({ title: "Failed to approve plan", variant: "destructive" });
    } finally {
      setActioning(false);
    }
  };

  const handleReject = async (planId: number) => {
    setActioning(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/ai/plans/${planId}/approval`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ decision: "rejected" }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setPlans((prev) => prev.map((p) => (p.id === planId ? updated : p)));
      toast({ title: "Plan rejected", description: "Treatment plan has been rejected." });
    } catch {
      toast({ title: "Failed to reject plan", variant: "destructive" });
    } finally {
      setActioning(false);
    }
  };

  const handleDelete = async (planId: number) => {
    setActioning(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/ai/plans/${planId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      setPlans((prev) => prev.filter((p) => p.id !== planId));
      toast({ title: "Plan deleted" });
    } catch {
      toast({ title: "Failed to delete plan", variant: "destructive" });
    } finally {
      setActioning(false);
    }
  };

  const pendingCount = plans.filter((p) => p.doctorApproved === "pending").length;
  const approvedCount = plans.filter((p) => p.doctorApproved === "approved").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-4 p-4 rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/20">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base">AI Orthodontic Copilot</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Evidence-based treatment planning assistance. All recommendations require doctor approval before any action is taken.
          </p>
        </div>
        <Button
          onClick={handleGenerate}
          disabled={generating}
          size="sm"
          className="shrink-0"
        >
          {generating ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyzing…</>
          ) : (
            <><Sparkles className="h-4 w-4 mr-2" /> Generate Plan</>
          )}
        </Button>
      </div>

      {/* Context indicator */}
      <div className="flex flex-wrap gap-2 px-1">
        {selectedScan ? (
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <ScanLine className="h-3 w-3" />
            Using scan: {selectedScan.originalName ?? selectedScan.filename}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Info className="h-3 w-3" />
            No scan selected — plan based on case description
          </span>
        )}
        {segments.length > 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
            {segments.length} segmented teeth available
          </span>
        )}
        {analysis && (
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
            Analysis: {analysis.complexityLabel} complexity · {(analysis.findings as unknown[]).length} findings
          </span>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-9 w-full">
          <TabsTrigger value="plans" className="flex-1 h-8 text-xs gap-1.5">
            <ClipboardList className="h-3.5 w-3.5" />
            Treatment Plans
            {plans.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[10px] font-mono">
                {plans.length}
              </span>
            )}
            {pendingCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[10px] font-mono">
                {pendingCount} pending
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="chat" className="flex-1 h-8 text-xs gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            AI Chat
          </TabsTrigger>
        </TabsList>

        <TabsContent value="plans" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-3 text-xs text-muted-foreground">
              <span>{plans.length} plan{plans.length !== 1 ? "s" : ""} total</span>
              {approvedCount > 0 && <span className="text-emerald-400">· {approvedCount} approved</span>}
              {pendingCount > 0 && <span className="text-amber-400">· {pendingCount} pending review</span>}
            </div>
            <Button variant="ghost" size="sm" onClick={loadPlans} className="text-xs gap-1.5 h-7">
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </div>

          {loadingPlans ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : plans.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-3 border border-dashed border-border/60 rounded-xl">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">No treatment plans yet</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                  Click "Generate Plan" to have the AI analyze this case and propose a treatment plan. You'll need to review and approve it.
                </p>
              </div>
              <Button onClick={handleGenerate} disabled={generating} size="sm">
                {generating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analyzing…</> : <><Sparkles className="h-4 w-4 mr-2" />Generate First Plan</>}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {[...plans].reverse().map((plan) => (
                <TreatmentPlanCard
                  key={plan.id}
                  plan={plan}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  onDelete={handleDelete}
                  isActioning={actioning}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="chat" className="mt-4">
          <div className="border border-border/60 rounded-xl overflow-hidden">
            <AIChatPanel caseId={caseId} scanId={selectedScan?.id} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
