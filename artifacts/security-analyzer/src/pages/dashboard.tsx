import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, CheckCircle2, Shield, Activity, RefreshCw, X, ChevronRight, Play, Server, Code, FileText, Check, ShieldAlert } from "lucide-react";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

import { 
  useGetSecurityScanReport, 
  useGetSecurityThreatModel, 
  useGetResolutionTasks, 
  useAnalyzeFinding, 
  useStartResolutionTask, 
  useDismissResolutionTask,
  getGetResolutionTasksQueryKey
} from "@workspace/api-client-react";
import type { SecurityFinding, ResolutionTask } from "@workspace/api-client-react";

export function SecurityDashboard() {
  const [selectedFinding, setSelectedFinding] = useState<SecurityFinding | null>(null);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-mono text-sm">
      <header className="border-b border-border/50 bg-card/50 px-6 py-4 flex items-center justify-between sticky top-0 z-10 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Shield className="h-5 w-5 text-primary" />
          <h1 className="text-base font-bold tracking-tight">SECURITY_ANALYZER</h1>
          <Badge variant="outline" className="font-mono text-[10px] ml-2 border-primary/20 text-primary bg-primary/10">v2.1.4</Badge>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Activity className="h-4 w-4" />
            <span>SYS_NORMAL</span>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <ThreatModelPanel />
          <ResolutionTasksPanel />
        </div>
        <div className="lg:col-span-9 space-y-6 flex flex-col min-h-0">
          <ScanSummaryBar />
          <FindingsPanel onAnalyze={setSelectedFinding} />
        </div>
      </main>

      <AnalysisSheet 
        finding={selectedFinding} 
        open={!!selectedFinding} 
        onOpenChange={(open) => !open && setSelectedFinding(null)} 
      />
    </div>
  );
}

function ScanSummaryBar() {
  const { data: report, isLoading } = useGetSecurityScanReport();

  if (isLoading) {
    return <Skeleton className="h-[90px] w-full bg-card/50" />;
  }

  if (!report) return null;

  return (
    <Card className="bg-card/50 border-border/50 shadow-none shrink-0">
      <CardContent className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Findings</div>
            <div className="text-2xl font-bold">{report.totalFindings}</div>
          </div>
          <Separator orientation="vertical" className="h-10 opacity-50" />
          <div className="flex gap-4">
            <SeverityStat label="Crit" count={report.bySeverity?.critical || 0} colorClass="text-destructive" />
            <SeverityStat label="High" count={report.bySeverity?.high || 0} colorClass="text-orange-500" />
            <SeverityStat label="Med" count={report.bySeverity?.medium || 0} colorClass="text-yellow-500" />
            <SeverityStat label="Low" count={report.bySeverity?.low || 0} colorClass="text-blue-400" />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[10px] text-muted-foreground uppercase tracking-widest">Last Scan</div>
            <div className="text-xs font-mono">{format(new Date(report.scannedAt), "yyyy-MM-dd HH:mm:ss 'UTC'")}</div>
          </div>
          <Button variant="outline" size="sm" className="h-8 gap-2 border-border/50 bg-background/50 hover:bg-accent hover:text-accent-foreground" onClick={() => window.location.reload()}>
            <RefreshCw className="h-3 w-3" />
            RE-SCAN
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SeverityStat({ label, count, colorClass }: { label: string, count: number, colorClass: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className={`text-xs uppercase ${colorClass}`}>{label}</span>
      <span className={`font-bold ${colorClass}`}>{count}</span>
    </div>
  );
}

function ThreatModelPanel() {
  const { data: threatModel, isLoading } = useGetSecurityThreatModel();

  return (
    <Card className="bg-card/50 border-border/50 shadow-none flex flex-col h-[400px]">
      <CardHeader className="p-4 pb-2 border-b border-border/50 shrink-0">
        <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          <Shield className="h-3.5 w-3.5" />
          Threat Model
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          {isLoading ? (
            <div className="p-4 space-y-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : (
            <div className="p-4">
              <Accordion type="single" collapsible className="w-full">
                {threatModel?.sections?.map((section, idx) => (
                  <AccordionItem value={`sec-${idx}`} key={idx} className="border-border/30">
                    <AccordionTrigger className="text-xs hover:no-underline py-3">
                      {section.title}
                    </AccordionTrigger>
                    <AccordionContent className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                      {section.content}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function ResolutionTasksPanel() {
  const queryClient = useQueryClient();
  
  // We need to fetch tasks first to know if we should poll
  const { data: initialTasks } = useGetResolutionTasks();
  
  const hasRunningTasks = initialTasks?.some(t => t.status === "queued" || t.status === "running") ?? false;

  const { data: tasks } = useGetResolutionTasks({
    query: {
      refetchInterval: hasRunningTasks ? 2000 : false
    }
  });

  const dismissTask = useDismissResolutionTask({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetResolutionTasksQueryKey() });
      }
    }
  });

  return (
    <Card className="bg-card/50 border-border/50 shadow-none flex flex-col h-[calc(100vh-28rem)]">
      <CardHeader className="p-4 pb-2 border-b border-border/50 shrink-0">
        <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          <Activity className="h-3.5 w-3.5" />
          Active Tasks
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-4 space-y-4">
            {!tasks || tasks.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-8">
                No active resolution tasks
              </div>
            ) : (
              tasks.map(task => (
                <div key={task.taskId} className="border border-border/50 rounded-md p-3 bg-background/30 relative group">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-bold text-xs truncate max-w-[150px]">{task.findingId}</div>
                    <Badge variant="outline" className={`text-[9px] ${
                      task.status === 'completed' ? 'text-green-500 border-green-500/20' : 
                      task.status === 'running' ? 'text-blue-400 border-blue-400/20' : 
                      task.status === 'failed' ? 'text-destructive border-destructive/20' : 
                      'text-muted-foreground'
                    }`}>
                      {task.status.toUpperCase()}
                    </Badge>
                  </div>
                  
                  <div className="text-[10px] text-muted-foreground mb-2 flex items-center justify-between">
                    <span>{task.strategy}</span>
                    <span>{task.progress}%</span>
                  </div>
                  
                  <Progress value={task.progress} className="h-1 mb-3" />
                  
                  {task.steps && task.steps.length > 0 && (
                    <div className="space-y-1.5 mt-2">
                      {task.steps.map((step, i) => (
                        <div key={i} className="flex items-center gap-2 text-[10px]">
                          {step.done ? (
                            <Check className="h-3 w-3 text-green-500 shrink-0" />
                          ) : (
                            <div className="h-3 w-3 rounded-full border border-border shrink-0" />
                          )}
                          <span className={step.done ? "text-muted-foreground" : "text-foreground"}>
                            {step.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {(task.status === "completed" || task.status === "failed" || task.status === "suppressed") && (
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-5 w-5 absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => dismissTask.mutate({ taskId: task.taskId })}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function FindingsPanel({ onAnalyze }: { onAnalyze: (finding: SecurityFinding) => void }) {
  const { data: report, isLoading } = useGetSecurityScanReport();
  const queryClient = useQueryClient();
  const startTask = useStartResolutionTask({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetResolutionTasksQueryKey() });
      }
    }
  });

  const getSeverityColor = (sev: string) => {
    switch (sev.toLowerCase()) {
      case 'critical': return 'text-destructive border-destructive/20 bg-destructive/10';
      case 'high': return 'text-orange-500 border-orange-500/20 bg-orange-500/10';
      case 'medium': return 'text-yellow-500 border-yellow-500/20 bg-yellow-500/10';
      case 'moderate': return 'text-yellow-400 border-yellow-400/20 bg-yellow-400/10';
      case 'low': return 'text-blue-400 border-blue-400/20 bg-blue-400/10';
      default: return 'text-muted-foreground border-muted-foreground/20 bg-muted/50';
    }
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'sast': return <Code className="h-3 w-3" />;
      case 'dependency': return <Server className="h-3 w-3" />;
      case 'hounddog': return <ShieldAlert className="h-3 w-3" />;
      default: return <FileText className="h-3 w-3" />;
    }
  };

  return (
    <Card className="bg-card/50 border-border/50 shadow-none flex flex-col flex-1 min-h-0">
      <CardHeader className="p-4 border-b border-border/50 flex flex-row items-center justify-between shrink-0">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-orange-500" />
          VULNERABILITY_REPORT
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-4 space-y-3">
            {isLoading ? (
              Array(5).fill(0).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full bg-card/50" />
              ))
            ) : report?.findings?.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500 opacity-50" />
                <p>No vulnerabilities detected in this scan.</p>
              </div>
            ) : (
              report?.findings?.map((finding) => (
                <div key={finding.id} className="border border-border/50 rounded-md p-4 bg-background/50 hover:bg-accent/5 transition-colors group">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={`text-[10px] rounded-sm ${getSeverityColor(finding.severity)}`}>
                          {finding.severity.toUpperCase()}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] text-muted-foreground rounded-sm flex items-center gap-1 bg-muted/20">
                          {getSourceIcon(finding.source)}
                          {finding.source.toUpperCase()}
                        </Badge>
                        <span className="font-bold text-sm truncate" title={finding.title}>{finding.title}</span>
                      </div>
                      
                      <div className="text-xs text-muted-foreground font-mono flex items-center gap-2 truncate">
                        {finding.file}:{finding.line}
                      </div>
                      
                      <p className="text-sm mt-1 text-foreground/80">{finding.message}</p>
                      
                      {finding.codeSnippet && (
                        <div className="mt-3 bg-muted/30 border border-border/50 rounded p-3 font-mono text-[11px] overflow-x-auto text-muted-foreground">
                          <pre>{finding.codeSnippet}</pre>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex flex-col gap-2 shrink-0">
                      <Button 
                        size="sm" 
                        variant="secondary" 
                        className="h-8 text-xs font-bold tracking-wider w-24"
                        onClick={() => onAnalyze(finding)}
                      >
                        ANALYZE
                      </Button>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline" className="h-8 text-xs font-bold tracking-wider w-24 border-primary/20 hover:bg-primary/10 hover:text-primary">
                            RESOLVE
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 font-mono text-xs">
                          <DropdownMenuItem onClick={() => startTask.mutate({ data: { findingId: finding.id, strategy: 'auto-fix' } })}>
                            Auto-Fix
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => startTask.mutate({ data: { findingId: finding.id, strategy: 'manual-review' } })}>
                            Manual Review
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => startTask.mutate({ data: { findingId: finding.id, strategy: 'upgrade-dependency' } })}>
                            Upgrade Dependency
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => startTask.mutate({ data: { findingId: finding.id, strategy: 'suppress' } })}>
                            Suppress
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function AnalysisSheet({ finding, open, onOpenChange }: { finding: SecurityFinding | null, open: boolean, onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  
  const analyzeMutation = useAnalyzeFinding({
    mutation: {
      onError: (err) => {
        toast({
          title: "Analysis Failed",
          description: err.error || "An error occurred during LLM analysis",
          variant: "destructive"
        });
      }
    }
  });

  // Automatically trigger analysis when the sheet opens with a finding
  // But we need to handle this carefully to avoid infinite loops
  const [analyzedId, setAnalyzedId] = useState<string | null>(null);
  
  if (open && finding && finding.id !== analyzedId && !analyzeMutation.isPending && !analyzeMutation.isSuccess) {
    setAnalyzedId(finding.id);
    analyzeMutation.mutate({ data: { findingId: finding.id, finding } });
  }
  
  // Reset state when closing
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setTimeout(() => {
        setAnalyzedId(null);
        analyzeMutation.reset();
      }, 300);
    }
    onOpenChange(isOpen);
  };

  const getRiskColor = (level: string | undefined) => {
    if (!level) return "text-muted-foreground";
    switch(level.toUpperCase()) {
      case 'CRITICAL': return "text-destructive border-destructive/30 bg-destructive/10";
      case 'HIGH': return "text-orange-500 border-orange-500/30 bg-orange-500/10";
      case 'MEDIUM': return "text-yellow-500 border-yellow-500/30 bg-yellow-500/10";
      case 'LOW': return "text-blue-400 border-blue-400/30 bg-blue-400/10";
      default: return "text-muted-foreground border-muted-foreground/30 bg-muted/10";
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-[500px] sm:w-[600px] sm:max-w-none p-0 flex flex-col font-mono border-l-border/50">
        <SheetHeader className="p-6 border-b border-border/50 bg-card/30">
          <div className="flex items-center gap-2 text-primary mb-2">
            <Activity className="h-4 w-4" />
            <SheetTitle className="text-sm tracking-widest text-primary">LLM_ANALYSIS_ENGINE</SheetTitle>
          </div>
          <SheetDescription className="text-xs">
            {finding ? `Target: ${finding.file}:${finding.line}` : "No target selected"}
          </SheetDescription>
        </SheetHeader>
        
        <ScrollArea className="flex-1">
          <div className="p-6">
            {analyzeMutation.isPending ? (
              <div className="space-y-6 flex flex-col items-center justify-center py-12">
                <div className="h-12 w-12 rounded-full border-b-2 border-primary animate-spin"></div>
                <div className="text-xs text-muted-foreground animate-pulse text-center">
                  <p>Initializing analysis context...</p>
                  <p className="mt-1">Evaluating control flow & data paths</p>
                </div>
              </div>
            ) : analyzeMutation.isError ? (
              <div className="text-center py-12 text-destructive">
                <AlertTriangle className="h-10 w-10 mx-auto mb-4 opacity-80" />
                <p className="text-sm font-bold">ANALYSIS FAILED</p>
                <p className="text-xs mt-2 opacity-80">{analyzeMutation.error?.error || "Unknown error"}</p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-6 border-destructive/30 text-destructive hover:bg-destructive/10"
                  onClick={() => finding && analyzeMutation.mutate({ data: { findingId: finding.id, finding } })}
                >
                  RETRY
                </Button>
              </div>
            ) : analyzeMutation.isSuccess && analyzeMutation.data ? (
              <div className="space-y-8">
                <div className="flex items-center gap-4">
                  <Badge variant="outline" className={`px-3 py-1 ${getRiskColor(analyzeMutation.data.riskLevel)}`}>
                    RISK: {analyzeMutation.data.riskLevel}
                  </Badge>
                  <Badge variant="outline" className="px-3 py-1 text-muted-foreground border-muted-foreground/30 bg-muted/10">
                    EFFORT: {analyzeMutation.data.effort.toUpperCase()}
                  </Badge>
                  <Badge variant="outline" className="px-3 py-1 text-muted-foreground border-muted-foreground/30 bg-muted/10">
                    STRIDE: {analyzeMutation.data.strideCategory}
                  </Badge>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-primary flex items-center gap-2">
                    <ChevronRight className="h-3 w-3" /> SUMMARY
                  </h4>
                  <div className="text-sm text-foreground/80 leading-relaxed pl-5">
                    {analyzeMutation.data.summary}
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-primary flex items-center gap-2">
                    <ChevronRight className="h-3 w-3" /> ROOT CAUSE
                  </h4>
                  <div className="text-sm text-foreground/80 leading-relaxed pl-5">
                    {analyzeMutation.data.rootCause}
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-primary flex items-center gap-2">
                    <ChevronRight className="h-3 w-3" /> IMPACT
                  </h4>
                  <div className="text-sm text-foreground/80 leading-relaxed pl-5">
                    {analyzeMutation.data.impact}
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-primary flex items-center gap-2">
                    <ChevronRight className="h-3 w-3" /> PROPOSED FIX
                  </h4>
                  <div className="text-sm text-foreground/80 leading-relaxed pl-5">
                    {analyzeMutation.data.fix}
                  </div>
                  {analyzeMutation.data.codeExample && (
                    <div className="mt-4 bg-background/80 border border-border/50 rounded-md p-4 overflow-x-auto">
                      <pre className="text-xs font-mono text-muted-foreground">
                        {analyzeMutation.data.codeExample}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
