import { useState, useRef, useEffect, useCallback } from "react";
import { useRoute, Link } from "wouter";
import { ScanPicker } from "@/components/scan-picker";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useGetScan, useGetScanAnalysis } from "@workspace/api-client-react";
import {
  ArrowLeft, Bot, Send, Loader2, Brain, ShieldCheck, ShieldAlert,
  CheckCircle, XCircle, Lightbulb, AlertTriangle, ChevronRight,
  Activity, RotateCcw, ArrowUpDown, ArrowLeftRight, Clock, Sparkles,
  MessageSquare, BarChart3, RefreshCw
} from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface TreatmentMovement {
  tooth: number;
  movement: string;
  amount: number;
  unit: string;
  rationale: string;
  risk: string;
  priority?: "high" | "medium" | "low";
  approved?: boolean;
}

interface TreatmentPhase {
  name: string;
  duration: string;
  objectives: string[];
}

interface TreatmentPlan {
  confidence: number;
  evidence: string;
  duration: string;
  phases: TreatmentPhase[];
  movements: TreatmentMovement[];
  alternatives: Array<{ approach: string; indication: string }>;
  warnings: string[];
  appliance_recommendations: string[];
  retention: string;
}

const QUICK_PROMPTS = [
  "Explain the main orthodontic issues in this case",
  "What causes crowding and how is it treated?",
  "Suggest a treatment sequence for this patient",
  "What are the risks of the recommended movements?",
  "Explain the difference between expansion and extraction therapy",
  "What retention protocol do you recommend?",
];

const MOVEMENT_ICONS: Record<string, React.ReactNode> = {
  intrusion: <ArrowUpDown className="h-3 w-3" />,
  extrusion: <ArrowUpDown className="h-3 w-3" />,
  expansion: <ArrowLeftRight className="h-3 w-3" />,
  rotation: <RotateCcw className="h-3 w-3" />,
  distalization: <ArrowLeftRight className="h-3 w-3" />,
  mesialization: <ArrowLeftRight className="h-3 w-3" />,
  retraction: <ArrowLeftRight className="h-3 w-3" />,
  proclination: <ArrowLeftRight className="h-3 w-3" />,
};

function MovementCard({ movement, onApprove, onReject }: {
  movement: TreatmentMovement;
  onApprove: () => void;
  onReject: () => void;
}) {
  const priorityColor = movement.priority === "high" ? "text-red-400" : movement.priority === "medium" ? "text-orange-400" : "text-green-400";
  const icon = MOVEMENT_ICONS[movement.movement.toLowerCase()] ?? <Activity className="h-3 w-3" />;

  return (
    <Card className={`border ${movement.approved === true ? "border-green-500/50 bg-green-500/5" : movement.approved === false ? "border-red-500/30 bg-red-500/5 opacity-60" : "border-border"}`}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 bg-primary/20 text-primary rounded px-2 py-0.5 text-xs font-bold">
              {icon} Tooth {movement.tooth}
            </span>
            <span className="text-xs font-semibold capitalize">{movement.movement}</span>
            <span className="text-xs text-muted-foreground">{movement.amount} {movement.unit}</span>
          </div>
          {movement.priority && (
            <span className={`text-xs font-bold uppercase ${priorityColor}`}>{movement.priority}</span>
          )}
        </div>

        <p className="text-xs text-muted-foreground mb-2 leading-relaxed">{movement.rationale}</p>

        {movement.risk && (
          <div className="flex items-start gap-1 mb-3 text-xs text-yellow-400 bg-yellow-400/10 rounded p-2">
            <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
            <span>{movement.risk}</span>
          </div>
        )}

        {movement.approved === undefined && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1 h-7 text-xs border-green-500/50 text-green-400 hover:bg-green-500/10" onClick={onApprove}>
              <CheckCircle className="h-3 w-3 mr-1" /> Approve
            </Button>
            <Button size="sm" variant="outline" className="flex-1 h-7 text-xs border-red-500/50 text-red-400 hover:bg-red-500/10" onClick={onReject}>
              <XCircle className="h-3 w-3 mr-1" /> Reject
            </Button>
          </div>
        )}

        {movement.approved === true && (
          <div className="flex items-center gap-1 text-xs text-green-400 font-semibold">
            <CheckCircle className="h-3 w-3" /> Approved by Doctor
          </div>
        )}
        {movement.approved === false && (
          <div className="flex items-center gap-1 text-xs text-red-400 font-semibold">
            <XCircle className="h-3 w-3" /> Rejected
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConfidenceMeter({ value }: { value: number }) {
  const color = value >= 75 ? "#22c55e" : value >= 50 ? "#eab308" : "#ef4444";
  return (
    <div className="flex items-center gap-3">
      <div className="relative w-16 h-16">
        <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
          <circle cx="18" cy="18" r="15.9155" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted" />
          <circle
            cx="18" cy="18" r="15.9155" fill="none"
            stroke={color} strokeWidth="3"
            strokeDasharray={`${value} ${100 - value}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold" style={{ color }}>{value}%</span>
        </div>
      </div>
      <div>
        <div className="text-sm font-semibold">Confidence</div>
        <div className="text-xs text-muted-foreground">
          {value >= 75 ? "High confidence" : value >= 50 ? "Moderate confidence" : "Low confidence — verify carefully"}
        </div>
      </div>
    </div>
  );
}

export default function AICopilot() {
  const [, params] = useRoute("/ai-copilot/:scanId");
  const scanId = params?.scanId ? parseInt(params.scanId, 10) : 0;

  if (!scanId) return (
    <ScanPicker
      targetPath="/ai-copilot"
      title="AI Copilot"
      description="AI-assisted orthodontic treatment planning and clinical analysis"
      Icon={Bot}
    />
  );

  return <AICopilotContent scanId={scanId} />;
}

function AICopilotContent({ scanId }: { scanId: number }) {
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Hello, Doctor. I'm your AI Orthodontic Copilot. I can analyze your patient's scan data, suggest treatment movements, explain clinical rationale, and answer orthodontic questions. **All recommendations require your approval before any implementation.**\n\nHow can I assist you today?",
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [treatmentPlan, setTreatmentPlan] = useState<TreatmentPlan | null>(null);
  const [isPlanLoading, setIsPlanLoading] = useState(false);
  const [movements, setMovements] = useState<TreatmentMovement[]>([]);
  const [activeTab, setActiveTab] = useState("chat");

  const { data: scanData } = useGetScan(scanId, { query: { enabled: !!scanId } });
  const { data: analysisData } = useGetScanAnalysis(scanId, { query: { enabled: !!scanId } });

  const contextData = {
    segments: analysisData?.segmentationData,
    analysis: analysisData?.status === "completed" ? {
      conditions: [],
      ...(analysisData as unknown as Record<string, unknown>),
    } : null,
    measurements: analysisData?.measurementsData,
    patientInfo: scanData ? { caseCode: `SCAN-${scanId}` } : null,
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async (messageText?: string) => {
    const text = (messageText ?? input).trim();
    if (!text || isSending) return;

    const userMsg: ChatMessage = { role: "user", content: text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsSending(true);

    const assistantMsg: ChatMessage = { role: "assistant", content: "", timestamp: new Date() };
    setMessages(prev => [...prev, assistantMsg]);

    try {
      const allMessages = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));

      const response = await fetch("/api/ai-copilot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages: allMessages, contextData }),
      });

      if (!response.ok) throw new Error("API error");

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data) as { content?: string; done?: boolean; error?: string };
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.content) {
              fullContent += parsed.content;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { ...updated[updated.length - 1], content: fullContent };
                return updated;
              });
            }
          } catch {
            // skip parse errors
          }
        }
      }
    } catch (err) {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { ...updated[updated.length - 1], content: "Sorry, I encountered an error. Please try again." };
        return updated;
      });
      toast({ title: "Connection error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  }, [input, isSending, messages, contextData, toast]);

  const generateTreatmentPlan = async () => {
    setIsPlanLoading(true);
    setActiveTab("plan");
    try {
      const res = await fetch("/api/ai-copilot/treatment-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ contextData }),
      });

      if (!res.ok) throw new Error("Failed to generate plan");
      const data = await res.json() as { plan: TreatmentPlan };
      setTreatmentPlan(data.plan);
      setMovements(data.plan.movements?.map(m => ({ ...m, approved: undefined })) ?? []);
      toast({ title: "Treatment plan generated", description: "Review and approve each movement below." });
    } catch (err) {
      toast({ title: "Failed to generate plan", description: (err as Error).message, variant: "destructive" });
    } finally {
      setIsPlanLoading(false);
    }
  };

  const approveMovement = (idx: number) => {
    setMovements(prev => prev.map((m, i) => i === idx ? { ...m, approved: true } : m));
  };

  const rejectMovement = (idx: number) => {
    setMovements(prev => prev.map((m, i) => i === idx ? { ...m, approved: false } : m));
  };

  const approvedCount = movements.filter(m => m.approved === true).length;
  const pendingCount = movements.filter(m => m.approved === undefined).length;

  function renderMessageContent(content: string) {
    // Simple markdown-like rendering
    const lines = content.split("\n");
    return lines.map((line, i) => {
      if (line.startsWith("**") && line.endsWith("**")) {
        return <p key={i} className="font-bold">{line.slice(2, -2)}</p>;
      }
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      return (
        <p key={i} className={line === "" ? "mt-2" : ""}>
          {parts.map((part, j) =>
            part.startsWith("**") && part.endsWith("**")
              ? <strong key={j}>{part.slice(2, -2)}</strong>
              : part
          )}
        </p>
      );
    });
  }

  return (
    <Layout>
      <div className="flex flex-col h-[calc(100vh-4rem)] gap-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href={scanId ? `/ortho-analysis/${scanId}` : "/cases"}><ArrowLeft className="h-4 w-4" /></Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Bot className="h-6 w-6 text-primary" /> AI Orthodontic Copilot
              </h1>
              <p className="text-muted-foreground text-sm">AI-assisted treatment planning · Doctor approval required for all movements</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs bg-green-500/10 text-green-400 border border-green-500/30 rounded-full px-3 py-1">
              <ShieldCheck className="h-3 w-3" /> Safety Mode Active
            </div>
            <Button variant="outline" size="sm" onClick={generateTreatmentPlan} disabled={isPlanLoading}>
              {isPlanLoading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Generating...</> : <><Sparkles className="h-4 w-4 mr-1" />Generate Plan</>}
            </Button>
          </div>
        </div>

        {/* Safety Banner */}
        <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-2 mb-4 flex-shrink-0">
          <ShieldAlert className="h-4 w-4 text-blue-400 flex-shrink-0" />
          <p className="text-xs text-blue-300">
            <strong>Safety Policy:</strong> All AI recommendations are advisory only. No movements will be applied automatically. Doctor review and explicit approval is required for each recommended action before clinical implementation.
          </p>
        </div>

        {/* Main Layout */}
        <div className="flex gap-4 flex-1 min-h-0">
          {/* Left: Chat */}
          <div className="flex flex-col flex-1 min-w-0">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
              <TabsList className="grid grid-cols-2 flex-shrink-0">
                <TabsTrigger value="chat"><MessageSquare className="h-3 w-3 mr-1" />AI Chat</TabsTrigger>
                <TabsTrigger value="plan">
                  <BarChart3 className="h-3 w-3 mr-1" />Treatment Plan
                  {pendingCount > 0 && <span className="ml-1 bg-orange-400 text-black rounded-full text-xs w-4 h-4 flex items-center justify-center font-bold">{pendingCount}</span>}
                </TabsTrigger>
              </TabsList>

              {/* CHAT TAB */}
              <TabsContent value="chat" className="flex flex-col flex-1 min-h-0 mt-2">
                <div className="flex-1 min-h-0 overflow-hidden rounded-xl border border-border bg-card/50">
                  <ScrollArea className="h-full">
                    <div className="p-4 space-y-4">
                      {messages.map((msg, i) => (
                        <div key={i} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === "assistant" ? "bg-primary/20" : "bg-muted"}`}>
                            {msg.role === "assistant" ? <Bot className="h-4 w-4 text-primary" /> : <Activity className="h-4 w-4" />}
                          </div>
                          <div className={`flex-1 max-w-[85%] ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col`}>
                            <div className={`rounded-xl px-4 py-3 text-sm leading-relaxed space-y-1 ${msg.role === "assistant" ? "bg-card border border-border" : "bg-primary text-primary-foreground"}`}>
                              {msg.content
                                ? renderMessageContent(msg.content)
                                : <span className="flex gap-1"><span className="animate-bounce">●</span><span className="animate-bounce" style={{ animationDelay: "0.1s" }}>●</span><span className="animate-bounce" style={{ animationDelay: "0.2s" }}>●</span></span>
                              }
                            </div>
                            <span className="text-xs text-muted-foreground mt-1 px-1">
                              {msg.timestamp.toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>
                </div>

                {/* Quick prompts */}
                <div className="flex gap-2 mt-2 overflow-x-auto pb-1 flex-shrink-0">
                  {QUICK_PROMPTS.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(p)}
                      disabled={isSending}
                      className="text-xs whitespace-nowrap px-3 py-1.5 rounded-full border border-border bg-card hover:bg-muted transition-colors flex-shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      {p}
                    </button>
                  ))}
                </div>

                {/* Input */}
                <div className="flex gap-2 mt-2 flex-shrink-0">
                  <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                    placeholder="Ask about tooth movements, treatment options, clinical rationale... (Enter to send)"
                    className="flex-1 resize-none min-h-[60px] max-h-[120px]"
                    disabled={isSending}
                  />
                  <Button onClick={() => sendMessage()} disabled={isSending || !input.trim()} className="self-end">
                    {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </TabsContent>

              {/* TREATMENT PLAN TAB */}
              <TabsContent value="plan" className="flex-1 overflow-hidden mt-2">
                {isPlanLoading && (
                  <div className="flex flex-col items-center justify-center h-full gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Generating AI treatment plan...</p>
                  </div>
                )}

                {!isPlanLoading && !treatmentPlan && (
                  <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
                    <Sparkles className="h-10 w-10 opacity-20" />
                    <p className="text-sm">No treatment plan generated yet</p>
                    <Button onClick={generateTreatmentPlan} variant="outline">
                      <Sparkles className="h-4 w-4 mr-2" /> Generate AI Treatment Plan
                    </Button>
                  </div>
                )}

                {treatmentPlan && !isPlanLoading && (
                  <ScrollArea className="h-full pr-2">
                    <div className="space-y-3">
                      {/* Confidence */}
                      <Card>
                        <CardContent className="p-4">
                          <ConfidenceMeter value={treatmentPlan.confidence} />
                          <p className="text-xs text-muted-foreground mt-3 leading-relaxed">{treatmentPlan.evidence}</p>
                        </CardContent>
                      </Card>

                      {/* Duration + Approval status */}
                      <div className="grid grid-cols-3 gap-2">
                        <Card className="p-3 text-center">
                          <Clock className="h-4 w-4 mx-auto mb-1 text-primary" />
                          <div className="text-xs font-semibold">{treatmentPlan.duration}</div>
                          <div className="text-xs text-muted-foreground">Duration</div>
                        </Card>
                        <Card className="p-3 text-center">
                          <CheckCircle className="h-4 w-4 mx-auto mb-1 text-green-400" />
                          <div className="text-xs font-bold text-green-400">{approvedCount}</div>
                          <div className="text-xs text-muted-foreground">Approved</div>
                        </Card>
                        <Card className="p-3 text-center">
                          <AlertTriangle className="h-4 w-4 mx-auto mb-1 text-orange-400" />
                          <div className="text-xs font-bold text-orange-400">{pendingCount}</div>
                          <div className="text-xs text-muted-foreground">Pending</div>
                        </Card>
                      </div>

                      {/* Phases */}
                      {treatmentPlan.phases?.length > 0 && (
                        <Card>
                          <CardHeader className="pb-2 pt-3 px-4">
                            <CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4 text-primary" />Treatment Phases</CardTitle>
                          </CardHeader>
                          <CardContent className="px-4 pb-3 space-y-2">
                            {treatmentPlan.phases.map((phase, i) => (
                              <div key={i} className="flex gap-3">
                                <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">{i + 1}</div>
                                <div>
                                  <div className="text-sm font-semibold">{phase.name} <span className="text-xs text-muted-foreground">({phase.duration})</span></div>
                                  <ul className="mt-1 space-y-0.5">
                                    {phase.objectives?.map((obj, j) => (
                                      <li key={j} className="text-xs text-muted-foreground flex items-start gap-1">
                                        <ChevronRight className="h-3 w-3 mt-0.5 flex-shrink-0" />{obj}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            ))}
                          </CardContent>
                        </Card>
                      )}

                      {/* Movements */}
                      {movements.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-semibold flex items-center gap-1"><Brain className="h-4 w-4 text-primary" />Recommended Movements</h3>
                            <span className="text-xs text-muted-foreground">Requires doctor approval</span>
                          </div>
                          <div className="space-y-2">
                            {movements.map((m, i) => (
                              <MovementCard key={i} movement={m} onApprove={() => approveMovement(i)} onReject={() => rejectMovement(i)} />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Warnings */}
                      {treatmentPlan.warnings?.length > 0 && (
                        <Card className="border-yellow-500/30 bg-yellow-500/5">
                          <CardHeader className="pb-2 pt-3 px-4">
                            <CardTitle className="text-sm text-yellow-400 flex items-center gap-1"><AlertTriangle className="h-4 w-4" />Clinical Warnings</CardTitle>
                          </CardHeader>
                          <CardContent className="px-4 pb-3 space-y-1">
                            {treatmentPlan.warnings.map((w, i) => (
                              <div key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                                <ChevronRight className="h-3 w-3 mt-0.5 flex-shrink-0 text-yellow-400" />{w}
                              </div>
                            ))}
                          </CardContent>
                        </Card>
                      )}

                      {/* Alternatives */}
                      {treatmentPlan.alternatives?.length > 0 && (
                        <Card>
                          <CardHeader className="pb-2 pt-3 px-4">
                            <CardTitle className="text-sm flex items-center gap-1"><Lightbulb className="h-4 w-4 text-primary" />Alternative Approaches</CardTitle>
                          </CardHeader>
                          <CardContent className="px-4 pb-3 space-y-2">
                            {treatmentPlan.alternatives.map((alt, i) => (
                              <div key={i}>
                                <div className="text-sm font-semibold">{alt.approach}</div>
                                <div className="text-xs text-muted-foreground">{alt.indication}</div>
                              </div>
                            ))}
                          </CardContent>
                        </Card>
                      )}

                      {/* Appliances + Retention */}
                      {(treatmentPlan.appliance_recommendations?.length > 0 || treatmentPlan.retention) && (
                        <Card>
                          <CardContent className="p-4 space-y-2">
                            {treatmentPlan.appliance_recommendations?.length > 0 && (
                              <div>
                                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Appliance Recommendations</div>
                                <div className="flex flex-wrap gap-1">
                                  {treatmentPlan.appliance_recommendations.map((a, i) => (
                                    <Badge key={i} variant="secondary" className="text-xs">{a}</Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            {treatmentPlan.retention && (
                              <div>
                                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Retention Protocol</div>
                                <p className="text-xs text-muted-foreground">{treatmentPlan.retention}</p>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )}

                      <Button variant="outline" className="w-full" onClick={generateTreatmentPlan}>
                        <RefreshCw className="h-4 w-4 mr-2" /> Regenerate Plan
                      </Button>
                    </div>
                  </ScrollArea>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Right: Context Panel */}
          <div className="w-64 flex-shrink-0 flex flex-col gap-3">
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Scan Context</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-1">
                <div className="text-sm font-semibold">{scanData?.fileName ?? "—"}</div>
                <div className="text-xs text-muted-foreground capitalize">Jaw: {scanData?.jawType ?? "—"}</div>
                <div className="text-xs text-muted-foreground">Status: {analysisData?.status ?? "No analysis"}</div>
              </CardContent>
            </Card>

            {analysisData?.status === "completed" && (
              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Analysis Available</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <div className="flex items-center gap-1 text-xs text-green-400">
                    <CheckCircle className="h-3 w-3" /> Segmentation data loaded
                  </div>
                  <div className="flex items-center gap-1 text-xs text-green-400 mt-1">
                    <CheckCircle className="h-3 w-3" /> Measurements available
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">AI has access to your scan analysis. Ask specific questions about your patient.</p>
                </CardContent>
              </Card>
            )}

            <Card className="border-yellow-500/30 bg-yellow-500/5">
              <CardContent className="p-3">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-yellow-300 leading-relaxed">
                    AI suggestions are for planning purposes only. Clinical examination and radiographs are required before treatment.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Capabilities</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3 space-y-1.5">
                {[
                  "Analyze malocclusion",
                  "Suggest tooth movements",
                  "Explain biomechanics",
                  "Treatment sequencing",
                  "Risk assessment",
                  "Alternative approaches",
                  "Retention planning",
                ].map((cap, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CheckCircle className="h-3 w-3 text-green-400 flex-shrink-0" /> {cap}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
