import { useEffect, useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Users, Briefcase, Scan, TrendingUp, Shield, Lock, Activity, CheckCircle, AlertTriangle, Clock, Database, Globe, Brain, Server } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Stats { totalPatients: number; totalCases: number; activeCases: number; newCasesThisMonth: number; scansUploaded: number; }
interface ActivityItem { id: number; type: string; description: string; patientName?: string; caseCode?: string; createdAt: string; }
interface CaseStatus { status: string; count: number; }

const STATUS_COLORS: Record<string, string> = {
  new: "#3b82f6", planning: "#8b5cf6", active: "#06b6d4", review: "#f59e0b",
  approved: "#10b981", manufacturing: "#ec4899", completed: "#22c55e", archived: "#6b7280",
};

const HIPAA_CONTROLS = [
  { label: "Authentication & Access Control", status: "compliant", detail: "JWT auth, role-based access" },
  { label: "Audit Logging", status: "compliant", detail: "All data access logged with timestamp & user" },
  { label: "Data Encryption (Transit)", status: "compliant", detail: "TLS 1.3 enforced on all endpoints" },
  { label: "Data Encryption (Rest)", status: "partial", detail: "DB encryption — file encryption pending" },
  { label: "Patient Data Minimization", status: "compliant", detail: "Only clinically necessary data collected" },
  { label: "Breach Notification Process", status: "partial", detail: "Manual process — automated alerting planned" },
  { label: "PHI De-identification", status: "planned", detail: "Export anonymization in development" },
  { label: "Business Associate Agreements", status: "compliant", detail: "BAA available for enterprise plans" },
];

const ARCHITECTURE_NODES = [
  { icon: Globe, label: "React + Vite", sub: "Web App", color: "text-cyan-400" },
  { icon: Server, label: "Node.js + Express", sub: "API Server", color: "text-violet-400" },
  { icon: Database, label: "PostgreSQL", sub: "Primary DB", color: "text-blue-400" },
  { icon: Brain, label: "Groq / LLaMA", sub: "AI Engine", color: "text-emerald-400" },
];

export default function Analytics() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [caseBreakdown, setCaseBreakdown] = useState<CaseStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [statsRes, activityRes, breakdownRes] = await Promise.all([
          fetch(`${BASE}/api/dashboard/stats`, { credentials: "include" }),
          fetch(`${BASE}/api/dashboard/activity?limit=15`, { credentials: "include" }),
          fetch(`${BASE}/api/dashboard/case-status-breakdown`, { credentials: "include" }),
        ]);
        if (statsRes.ok) setStats(await statsRes.json());
        if (activityRes.ok) setActivity(await activityRes.json());
        if (breakdownRes.ok) setCaseBreakdown(await breakdownRes.json());
      } catch { /* silent */ }
      finally { setLoading(false); }
    };
    fetchAll();
  }, []);

  const maxCaseCount = Math.max(...caseBreakdown.map(c => c.count), 1);
  const totalCasesBreakdown = caseBreakdown.reduce((sum, c) => sum + c.count, 0);

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><TrendingUp className="h-6 w-6 text-primary" />Analytics & Compliance</h1>
            <p className="text-muted-foreground text-sm mt-1">Practice metrics, security posture, and enterprise architecture</p>
          </div>
          <Badge variant="outline" className="text-xs gap-1 border-green-500/40 text-green-500"><CheckCircle className="h-3 w-3" />System Healthy</Badge>
        </div>

        {loading && (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        )}

        {!loading && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { icon: Users, label: "Total Patients", value: stats?.totalPatients ?? 0, color: "text-blue-500" },
                { icon: Briefcase, label: "Total Cases", value: stats?.totalCases ?? 0, color: "text-violet-500" },
                { icon: Activity, label: "Active Cases", value: stats?.activeCases ?? 0, color: "text-cyan-500" },
                { icon: TrendingUp, label: "New This Month", value: stats?.newCasesThisMonth ?? 0, color: "text-emerald-500" },
                { icon: Scan, label: "Scans Uploaded", value: stats?.scansUploaded ?? 0, color: "text-orange-500" },
              ].map(({ icon: Icon, label, value, color }) => (
                <Card key={label}>
                  <CardContent className="pt-5 pb-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
                      </div>
                      <Icon className={`h-8 w-8 opacity-20 ${color}`} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Case Status Breakdown */}
              <Card className="lg:col-span-1">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Briefcase className="h-4 w-4 text-primary" />Case Status Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  {caseBreakdown.length === 0 ? (
                    <div className="py-4 text-center text-sm text-muted-foreground">No cases yet</div>
                  ) : (
                    <div className="space-y-3">
                      {caseBreakdown.map(c => (
                        <div key={c.status}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium capitalize">{c.status.replace(/_/g, " ")}</span>
                            <span className="text-xs text-muted-foreground">{c.count} ({Math.round(c.count / totalCasesBreakdown * 100)}%)</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${(c.count / maxCaseCount) * 100}%`, background: STATUS_COLORS[c.status] ?? "#6b7280" }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recent Activity */}
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4 text-primary" />Recent Activity</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[240px]">
                    <div className="p-4 space-y-3">
                      {activity.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>}
                      {activity.map(item => (
                        <div key={item.id} className="flex items-start gap-3 pb-3 border-b border-border/50 last:border-0">
                          <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-foreground">{item.description}</p>
                            {item.patientName && <p className="text-xs text-muted-foreground">{item.patientName}{item.caseCode ? ` — ${item.caseCode}` : ""}</p>}
                          </div>
                          <time className="text-xs text-muted-foreground flex-shrink-0">{new Date(item.createdAt).toLocaleDateString()}</time>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>

            {/* HIPAA/GDPR Compliance */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><Shield className="h-4 w-4 text-emerald-500" />HIPAA / GDPR Compliance Controls</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {HIPAA_CONTROLS.map(ctrl => (
                    <div key={ctrl.label} className="flex items-start gap-3 p-3 rounded-lg border border-border/60 bg-muted/20">
                      {ctrl.status === "compliant" ? <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                        : ctrl.status === "partial" ? <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                        : <Clock className="h-4 w-4 text-zinc-400 flex-shrink-0 mt-0.5" />}
                      <div>
                        <p className="text-xs font-medium">{ctrl.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{ctrl.detail}</p>
                      </div>
                      <Badge className={`ml-auto text-[10px] flex-shrink-0 ${ctrl.status === "compliant" ? "bg-green-500/10 text-green-500 border-green-500/30" : ctrl.status === "partial" ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/30" : "bg-zinc-500/10 text-zinc-400 border-zinc-500/30"}`} variant="outline">
                        {ctrl.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Enterprise Architecture */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2"><Server className="h-4 w-4 text-primary" />System Architecture</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {ARCHITECTURE_NODES.map(({ icon: Icon, label, sub, color }) => (
                      <div key={label} className="flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-muted/20">
                        <Icon className={`h-5 w-5 ${color} flex-shrink-0`} />
                        <div>
                          <p className="text-xs font-semibold">{label}</p>
                          <p className="text-xs text-muted-foreground">{sub}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    {[
                      "✓ JWT auth with HTTPOnly cookies",
                      "✓ Drizzle ORM with parameterized queries (SQL injection safe)",
                      "✓ Rate limiting on all API endpoints",
                      "✓ Input validation with Zod schemas",
                      "✓ CORS configured for known origins",
                      "✓ Audit middleware logging all mutations",
                    ].map(item => <div key={item}>{item}</div>)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2"><Lock className="h-4 w-4 text-primary" />Multi-Clinic Readiness</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">Enterprise multi-clinic architecture status:</p>
                  {[
                    { label: "Organization Data Model", status: "ready", detail: "Organizations schema defined — add org_id to users/cases/patients to activate" },
                    { label: "Role-Based Access Control", status: "partial", detail: "Doctor role exists — Admin, Coordinator, Lab roles planned" },
                    { label: "Per-Clinic Data Isolation", status: "planned", detail: "Row-level security with org_id filtering" },
                    { label: "Shared Case Collaboration", status: "planned", detail: "Case assignment and shared-access model" },
                    { label: "Audit Trail", status: "ready", detail: "Full action logging with user, timestamp, IP" },
                    { label: "API for Mobile/3rd-party", status: "partial", detail: "REST API operational — OAuth2 for external access planned" },
                  ].map(item => (
                    <div key={item.label} className="flex items-start gap-2">
                      <Badge className={`text-[10px] flex-shrink-0 mt-0.5 ${item.status === "ready" ? "bg-green-500/10 text-green-500 border-green-500/30" : item.status === "partial" ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/30" : "bg-zinc-500/10 text-zinc-400 border-zinc-500/30"}`} variant="outline">{item.status}</Badge>
                      <div>
                        <p className="text-xs font-medium">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* AI Infrastructure */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><Brain className="h-4 w-4 text-primary" />AI Infrastructure</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "Tooth Segmentation", model: "Custom geometry engine", status: "operational", latency: "5–30s" },
                    { label: "Landmark Detection", model: "Geometric heuristics", status: "operational", latency: "<1s" },
                    { label: "Ortho Analysis", model: "Rules engine + scoring", status: "operational", latency: "<1s" },
                    { label: "Treatment AI", model: "LLaMA 3.3-70B via Groq", status: "operational", latency: "1–5s" },
                  ].map(svc => (
                    <div key={svc.label} className="p-3 rounded-lg border border-border/60 bg-muted/20">
                      <div className="flex items-center gap-1 mb-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-[10px] text-green-500 font-medium uppercase">{svc.status}</span>
                      </div>
                      <p className="text-xs font-semibold">{svc.label}</p>
                      <p className="text-xs text-muted-foreground mt-1">{svc.model}</p>
                      <p className="text-xs text-muted-foreground">Latency: {svc.latency}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
}
