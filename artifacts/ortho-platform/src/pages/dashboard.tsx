import { useGetDashboardStats, useGetRecentActivity, useGetCaseStatusBreakdown } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Activity, Layers, Upload, ArrowUpRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";

const STATUS_COLORS: Record<string, string> = {
  "draft": "hsl(var(--muted-foreground))",
  "in_planning": "hsl(var(--primary))",
  "under_review": "hsl(220 80% 70%)",
  "approved": "hsl(var(--chart-2))",
  "active": "hsl(142 76% 50%)",
  "completed": "hsl(var(--chart-5))",
  "new": "hsl(var(--muted-foreground))",
  "scan_uploaded": "hsl(var(--chart-4))",
  "analysis_completed": "hsl(var(--chart-3))",
  "treatment_planning": "hsl(var(--primary))",
  "manufacturing": "hsl(var(--chart-5))",
};

const formatStatus = (status: string) => {
  const labels: Record<string, string> = {
    draft: "Draft", in_planning: "In Planning", under_review: "Under Review",
    approved: "Approved", active: "Active", completed: "Completed",
    new: "New", scan_uploaded: "Scan Uploaded", analysis_completed: "Analysis Completed",
    treatment_planning: "Treatment Planning", manufacturing: "Manufacturing",
  };
  return labels[status] ?? status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: activityData, isLoading: activityLoading } = useGetRecentActivity({ limit: 5 });
  const { data: breakdownData, isLoading: breakdownLoading } = useGetCaseStatusBreakdown();

  return (
    <Layout>
      <div className="space-y-6 max-w-7xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your clinic's performance and active cases.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Patients"
            value={stats?.totalPatients}
            icon={<Users className="h-4 w-4 text-muted-foreground" />}
            isLoading={statsLoading}
            href="/patients"
          />
          <StatCard
            title="Total Cases"
            value={stats?.totalCases}
            icon={<Activity className="h-4 w-4 text-muted-foreground" />}
            isLoading={statsLoading}
            href="/cases"
          />
          <StatCard
            title="Active Cases"
            value={stats?.activeCases}
            icon={<Layers className="h-4 w-4 text-muted-foreground" />}
            isLoading={statsLoading}
            href="/cases"
          />
          <StatCard
            title="Scans Uploaded"
            value={stats?.scansUploaded}
            icon={<Upload className="h-4 w-4 text-muted-foreground" />}
            isLoading={statsLoading}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Case Status Chart */}
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Case Status Breakdown</CardTitle>
              <CardDescription>Distribution of cases across the treatment lifecycle</CardDescription>
            </CardHeader>
            <CardContent>
              {breakdownLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={breakdownData ?? []} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="status"
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      tickFormatter={formatStatus}
                    />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                      labelFormatter={formatStatus}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {(breakdownData ?? []).map((entry: any) => (
                        <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "hsl(var(--primary))"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest updates across all cases</CardDescription>
            </CardHeader>
            <CardContent>
              {activityLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : activityData?.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No recent activity</p>
              ) : (
                <div className="space-y-3">
                  {activityData?.map((item: any) => (
                    <div key={item.id} className="flex gap-3 text-sm border-b pb-3 last:border-0 last:pb-0">
                      <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground text-sm leading-snug">{item.description}</p>
                        <p className="text-muted-foreground text-xs mt-0.5">
                          {new Date(item.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}

function StatCard({
  title, value, icon, isLoading, href
}: {
  title: string; value?: number; icon: React.ReactNode; isLoading?: boolean; href?: string;
}) {
  const content = (
    <Card className="hover:border-primary/30 transition-colors">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <div className="flex items-end gap-2">
            <div className="text-3xl font-bold">{value ?? 0}</div>
            {href && <ArrowUpRight className="h-4 w-4 text-muted-foreground mb-1" />}
          </div>
        )}
      </CardContent>
    </Card>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}
