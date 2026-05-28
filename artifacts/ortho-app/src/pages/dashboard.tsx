import { 
  useGetDashboardStats, 
  useGetRecentActivity, 
  useGetCaseDistribution 
} from "@workspace/api-client-react";
import { MainLayout } from "@/components/layout/main-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Users, FileBox, CheckCircle2, TrendingUp, Clock, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from "recharts";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: recentActivity, isLoading: activityLoading } = useGetRecentActivity({ limit: 10 });
  const { data: caseDistribution, isLoading: distributionLoading } = useGetCaseDistribution();

  return (
    <MainLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
          <p className="text-muted-foreground mt-1">
            Welcome back. Here is the current status of your clinic.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Patients</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">{stats?.totalPatients || 0}</div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Cases</CardTitle>
              <FileBox className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">{stats?.activeCases || 0}</div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">New Cases (This Month)</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">{stats?.newCasesThisMonth || 0}</div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">{stats?.completionRate || 0}%</div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          {/* Chart */}
          <Card className="col-span-4">
            <CardHeader>
              <CardTitle>Case Distribution by Status</CardTitle>
            </CardHeader>
            <CardContent className="pl-2">
              {distributionLoading ? (
                <div className="h-[350px] w-full flex items-center justify-center">
                  <Skeleton className="h-full w-full" />
                </div>
              ) : (
                <div className="h-[350px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={caseDistribution || []}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis 
                        dataKey="label" 
                        stroke="#888888" 
                        fontSize={12} 
                        tickLine={false} 
                        axisLine={false} 
                      />
                      <YAxis 
                        stroke="#888888" 
                        fontSize={12} 
                        tickLine={false} 
                        axisLine={false} 
                        tickFormatter={(value) => `${value}`} 
                      />
                      <Tooltip 
                        cursor={{ fill: 'var(--accent)' }}
                        contentStyle={{ borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}
                      />
                      <Bar 
                        dataKey="count" 
                        fill="hsl(var(--primary))" 
                        radius={[4, 4, 0, 0]} 
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="col-span-3 flex flex-col">
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
              <div className="space-y-6">
                {activityLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-9 w-9 rounded-full" />
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                  ))
                ) : !recentActivity?.length ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Clock className="h-8 w-8 text-muted-foreground mb-4" />
                    <p className="text-sm text-muted-foreground">No recent activity</p>
                  </div>
                ) : (
                  recentActivity.map((activity) => {
                    let Icon = Activity;
                    let iconBg = "bg-primary/10 text-primary";

                    if (activity.type === "patient_created") {
                      Icon = Users;
                      iconBg = "bg-blue-500/10 text-blue-500";
                    } else if (activity.type === "case_created") {
                      Icon = FileBox;
                      iconBg = "bg-emerald-500/10 text-emerald-500";
                    } else if (activity.type === "status_changed") {
                      Icon = AlertCircle;
                      iconBg = "bg-amber-500/10 text-amber-500";
                    }

                    return (
                      <div key={activity.id} className="flex items-center gap-4">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-full ${iconBg}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-medium leading-none">
                            {activity.description}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(activity.createdAt), "MMM d, h:mm a")}
                            {activity.patientName && ` • ${activity.patientName}`}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
