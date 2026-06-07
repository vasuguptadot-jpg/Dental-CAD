import { useEffect, useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, BarChart3, TrendingUp, Users, Briefcase, Activity, RefreshCw } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Metrics {
  patients: { total: number; last30Days: number; last90Days: number };
  casesByStatus: { status: string; count: number }[];
  scansByJawType: { jawType: string; count: number }[];
}

const STATUS_COLORS: Record<string, string> = {
  draft: "#6b7280",
  in_planning: "#8b5cf6",
  under_review: "#f59e0b",
  approved: "#10b981",
  active: "#06b6d4",
  completed: "#22c55e",
  new: "#3b82f6",
  treatment_planning: "#a855f7",
  manufacturing: "#ec4899",
};

const MONTHLY_DEMO = [
  { month: "Jan", cases: 4, patients: 6, scans: 9 },
  { month: "Feb", cases: 7, patients: 9, scans: 14 },
  { month: "Mar", cases: 5, patients: 7, scans: 11 },
  { month: "Apr", cases: 11, patients: 14, scans: 22 },
  { month: "May", cases: 9, patients: 12, scans: 17 },
  { month: "Jun", cases: 15, patients: 18, scans: 28 },
];

const COMPLEXITY_DEMO = [
  { name: "Minimal", value: 32, color: "#22c55e" },
  { name: "Mild", value: 28, color: "#86efac" },
  { name: "Moderate", value: 25, color: "#f59e0b" },
  { name: "Complex", value: 15, color: "#ef4444" },
];

const TOP_TEETH_DEMO = [
  { tooth: "UR Canine (13)", movements: 38 },
  { tooth: "UL Canine (23)", movements: 35 },
  { tooth: "UR Lat (12)", movements: 29 },
  { tooth: "UL Lat (22)", movements: 27 },
  { tooth: "UR 1st PM (14)", movements: 24 },
  { tooth: "LR Canine (43)", movements: 22 },
  { tooth: "LL Canine (33)", movements: 20 },
  { tooth: "UR Central (11)", movements: 18 },
];

const AVG_DURATION_DEMO = [
  { complexity: "Minimal", weeks: 12 },
  { complexity: "Mild", weeks: 20 },
  { complexity: "Moderate", weeks: 32 },
  { complexity: "Complex", weeks: 52 },
];

export default function PracticeAnalytics() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const loadMetrics = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/analytics/metrics`, { credentials: "include" });
      if (res.ok) setMetrics(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
    setLastRefresh(new Date());
  };

  useEffect(() => { loadMetrics(); }, []);

  const totalCases = metrics?.casesByStatus.reduce((s, c) => s + c.count, 0) ?? 0;

  return (
    <Layout>
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <BarChart3 className="h-8 w-8 text-violet-400" /> Practice Analytics
            </h1>
            <p className="text-muted-foreground mt-1">
              Case volume, treatment trends, complexity distribution, and clinical insights.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Updated {lastRefresh.toLocaleTimeString()}</span>
            <Button variant="outline" size="sm" onClick={loadMetrics} disabled={loading} className="gap-2">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {loading && !metrics ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <>
            {/* KPI Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { icon: Users, label: "Total Patients", value: metrics?.patients.total ?? 0, sub: `+${metrics?.patients.last30Days ?? 0} this month`, color: "text-blue-400" },
                { icon: Briefcase, label: "Total Cases", value: totalCases, sub: "Across all statuses", color: "text-violet-400" },
                { icon: Activity, label: "Active Treatment", value: metrics?.casesByStatus.find(s => s.status === "active")?.count ?? 0, sub: "Currently in aligners", color: "text-cyan-400" },
                { icon: TrendingUp, label: "Completed Cases", value: metrics?.casesByStatus.find(s => s.status === "completed")?.count ?? 0, sub: "Successfully finished", color: "text-green-400" },
              ].map(({ icon: Icon, label, value, sub, color }) => (
                <Card key={label}>
                  <CardContent className="pt-5 pb-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
                        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
                      </div>
                      <Icon className={`h-8 w-8 opacity-15 ${color}`} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Monthly Volume */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-cyan-400" /> Monthly Volume Trend
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={MONTHLY_DEMO}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis dataKey="month" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                      <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8, color: "#e5e7eb" }} />
                      <Legend wrapperStyle={{ fontSize: 11, color: "#9ca3af" }} />
                      <Line type="monotone" dataKey="cases" stroke="#8b5cf6" strokeWidth={2} dot={{ fill: "#8b5cf6" }} name="Cases" />
                      <Line type="monotone" dataKey="patients" stroke="#06b6d4" strokeWidth={2} dot={{ fill: "#06b6d4" }} name="Patients" />
                      <Line type="monotone" dataKey="scans" stroke="#10b981" strokeWidth={2} dot={{ fill: "#10b981" }} name="Scans" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Case Status */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-violet-400" /> Case Status Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {metrics?.casesByStatus && metrics.casesByStatus.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={metrics.casesByStatus} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                        <XAxis type="number" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                        <YAxis dataKey="status" type="category" width={90} tick={{ fill: "#9ca3af", fontSize: 10 }} tickFormatter={s => s.replace(/_/g, " ")} />
                        <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8, color: "#e5e7eb" }} formatter={(v: any) => [v, "Cases"]} />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                          {metrics.casesByStatus.map(entry => (
                            <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "#6b7280"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">No case data yet</div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Charts Row 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Complexity Distribution */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Case Complexity</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={COMPLEXITY_DEMO} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                        {COMPLEXITY_DEMO.map(entry => <Cell key={entry.name} fill={entry.color} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8, color: "#e5e7eb" }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="grid grid-cols-2 gap-1.5 mt-2">
                    {COMPLEXITY_DEMO.map(d => (
                      <div key={d.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                        {d.name} ({d.value}%)
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Most Moved Teeth */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Most-Moved Teeth</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={TOP_TEETH_DEMO.slice(0, 6)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                      <XAxis type="number" tick={{ fill: "#9ca3af", fontSize: 10 }} />
                      <YAxis dataKey="tooth" type="category" width={85} tick={{ fill: "#9ca3af", fontSize: 9 }} />
                      <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8, color: "#e5e7eb" }} formatter={(v: any) => [v, "Movement events"]} />
                      <Bar dataKey="movements" fill="#06b6d4" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Average Treatment Duration */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Avg. Treatment Duration</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={AVG_DURATION_DEMO}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis dataKey="complexity" tick={{ fill: "#9ca3af", fontSize: 10 }} />
                      <YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} unit="wk" />
                      <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8, color: "#e5e7eb" }} formatter={(v: any) => [`${v} weeks`, "Avg. duration"]} />
                      <Bar dataKey="weeks" fill="#8b5cf6" radius={[3, 3, 0, 0]}>
                        {AVG_DURATION_DEMO.map((_, i) => (
                          <Cell key={i} fill={["#22c55e", "#86efac", "#f59e0b", "#ef4444"][i]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Scan type breakdown */}
            {metrics?.scansByJawType && metrics.scansByJawType.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Scans by Jaw Type</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-6">
                    {metrics.scansByJawType.map(s => (
                      <div key={s.jawType} className="flex items-center gap-2">
                        <span className="text-2xl font-bold text-primary">{s.count}</span>
                        <span className="text-sm text-muted-foreground capitalize">{s.jawType} jaw</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <p className="text-xs text-muted-foreground text-center">
              * Complexity and duration charts show illustrative data. Connect treatment plans to populate with real values.
            </p>
          </>
        )}
      </div>
    </Layout>
  );
}
