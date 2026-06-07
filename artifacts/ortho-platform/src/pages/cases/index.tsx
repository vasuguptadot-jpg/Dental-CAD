import { useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { useListCases } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Loader2, Activity, FilterX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDebounce } from "@/hooks/use-debounce";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "new", label: "New" },
  { value: "scan_uploaded", label: "Scan Uploaded" },
  { value: "analysis_completed", label: "Analysis Completed" },
  { value: "treatment_planning", label: "Treatment Planning" },
  { value: "approved", label: "Approved" },
  { value: "manufacturing", label: "Manufacturing" },
];

const STATUS_COLORS: Record<string, string> = {
  "new": "bg-muted text-muted-foreground hover:bg-muted/80",
  "scan_uploaded": "bg-chart-4/20 text-chart-4 hover:bg-chart-4/30",
  "analysis_completed": "bg-chart-3/20 text-chart-3 hover:bg-chart-3/30",
  "treatment_planning": "bg-primary/20 text-primary hover:bg-primary/30",
  "approved": "bg-chart-2/20 text-chart-2 hover:bg-chart-2/30",
  "manufacturing": "bg-chart-5/20 text-chart-5 hover:bg-chart-5/30",
};

const formatStatus = (status: string) => {
  return status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

export default function CasesList() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  
  // Note: API doesn't have a direct text search parameter for cases, but we can pass status
  const { data, isLoading } = useListCases({ 
    status: statusFilter !== "all" ? statusFilter : undefined, 
    page, 
    limit: 20 
  });

  return (
    <Layout>
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Treatment Cases</h1>
            <p className="text-muted-foreground">Monitor and manage all active orthodontic cases.</p>
          </div>
          <div className="flex w-full sm:w-auto items-center gap-2">
            <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setPage(1); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {statusFilter !== "all" && (
              <Button variant="ghost" size="icon" onClick={() => setStatusFilter("all")}>
                <FilterX className="h-4 w-4 text-muted-foreground" />
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Case ID</TableHead>
                  <TableHead>Patient Name</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Updated</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center">
                      <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : data?.cases.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center">
                      <div className="flex flex-col items-center justify-center text-muted-foreground">
                        <Activity className="h-8 w-8 mb-2 opacity-50" />
                        <p>No cases found</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.cases.map((c) => (
                    <TableRow key={c.id} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="font-mono text-xs font-medium text-muted-foreground">
                        {c.caseCode}
                      </TableCell>
                      <TableCell className="font-medium">
                        <Link href={`/patients/${c.patientId}`} className="hover:underline hover:text-primary">
                          {c.patientName}
                        </Link>
                      </TableCell>
                      <TableCell>{c.title}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={STATUS_COLORS[c.status]}>
                          {formatStatus(c.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                        {new Date(c.updatedAt || c.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/cases/${c.id}`}>
                          <Button variant="ghost" size="sm" className="text-primary hover:text-primary hover:bg-primary/10">
                            View Case
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
