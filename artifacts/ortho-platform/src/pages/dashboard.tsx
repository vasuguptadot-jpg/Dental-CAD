import { useGetDashboardStats, useGetRecentActivity, useGetCaseStatusBreakdown } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Activity, Layers, Upload, ArrowUpRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";

const STATUS_COLORS: Record<string, string> = {
  "new": "hsl(var(--muted-foreground))",
  "scan_uploaded": "hsl(var(--chart-4))",
  "analysis_completed": "hsl(var(--chart-3))",
  "treatment_planning": "hsl(var(--primary))",
  "approved": "hsl(var(--chart-2))",
  "manufacturing": "hsl(var(--chart-5))",
};

const formatStatus = (status: string) => {
  return status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
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
            loading={statsLoading} 
          />
          <StatCard 
            title="Active Cases" 
            value={stats?.activeCases} 
            icon={<Activity className="h-4 w-4 text-primary" />} 
            loading={statsLoading} 
          />
          <StatCard 
            title="New This Month" 
            value={stats?.newCasesThisMonth} 
            icon={<ArrowUpRight className="h-4 w-4 text-chart-3" />} 
            loading={statsLoading} 
          />
          <StatCard 
            title="Scans Uploaded" 
            value={stats?.scansUploaded} 
            icon={<Upload className="h-4 w-4 text-chart-4" />} 
            loading={statsLoading} 
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chart */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Case Status Breakdown</CardTitle>
              <CardDescription>Current distribution of active cases across treatment stages</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                {breakdownLoading ? (
                  <Skeleton className="h-full w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={breakdownData || []} margin={{ top: 20, right: 30, left: 0, bottom: 25 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis 
                        dataKey="status" 
                        tickFormatter={formatStatus}
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                        angle={-45}
                        textAnchor="end"
                      />
                      <YAxis 
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip 
                        cursor={{ fill: 'hsl(var(--muted)/0.5)' }}
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                        formatter={(value: number) => [value, "Cases"]}
                        labelFormatter={formatStatus}
                      />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {breakdownData?.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.status] || "hsl(var(--primary))"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Activity Feed */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest updates across your cases</CardDescription>
            </CardHeader>
            <CardContent>
              {activityLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : activityData?.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">No recent activity</div>
              ) : (
                <div className="space-y-6">
                  {activityData?.map((item) => (
                    <div key={item.id} className="flex gap-4">
                      <div className="mt-1 bg-muted p-2 rounded-full h-fit">
                        {item.type === 'scan_uploaded' ? <Upload className="h-4 w-4 text-chart-4" /> : 
                         item.type === 'status_changed' ? <Layers className="h-4 w-4 text-primary" /> : 
                         <Activity className="h-4 w-4 text-muted-foreground" />}
                      </div>
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-medium leading-none">
                          {item.patientName && <span className="font-semibold">{item.patientName}</span>}
                          {item.patientName && item.caseCode && " - "}
                          {item.caseCode && <span className="text-muted-foreground">{item.caseCode}</span>}
                        </p>
                        <p className="text-sm text-muted-foreground">{item.description}</p>
                        <p className="text-xs text-muted-foreground/70">
                          {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
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

function StatCard({ title, value, icon, loading }: { title: string, value?: number, icon: React.ReactNode, loading: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <div className="text-2xl font-bold">{value?.toLocaleString() || 0}</div>
        )}
      </CardContent>
    </Card>
  );
}
