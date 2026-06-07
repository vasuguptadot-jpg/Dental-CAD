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
  { value: "draft", label: "Draft" },
  { value: "in_planning", label: "In Planning" },
  { value: "under_review", label: "Under Review" },
  { value: "approved", label: "Approved" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
];

const STATUS_COLORS: Record<string, string> = {
  "draft": "bg-muted text-muted-foreground hover:bg-muted/80",
  "in_planning": "bg-primary/20 text-primary hover:bg-primary/30",
  "under_review": "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30",
  "approved": "bg-chart-2/20 text-chart-2 hover:bg-chart-2/30",
  "active": "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30",
  "completed": "bg-chart-5/20 text-chart-5 hover:bg-chart-5/30",
  "new": "bg-muted text-muted-foreground hover:bg-muted/80",
  "scan_uploaded": "bg-chart-4/20 text-chart-4 hover:bg-chart-4/30",
  "analysis_completed": "bg-chart-3/20 text-chart-3 hover:bg-chart-3/30",
  "treatment_planning": "bg-primary/20 text-primary hover:bg-primary/30",
  "manufacturing": "bg-chart-5/20 text-chart-5 hover:bg-chart-5/30",
};

const formatStatus = (status: string) => {
  const labels: Record<string, string> = {
    draft: "Draft",
    in_planning: "In Planning",
    under_review: "Under Review",
    approved: "Approved",
    active: "Active",
    completed: "Completed",
    new: "New",
    scan_uploaded: "Scan Uploaded",
    analysis_completed: "Analysis Completed",
    treatment_planning: "Treatment Planning",
    manufacturing: "Manufacturing",
  };
  return labels[status] ?? status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

export default function CasesList() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useListCases({
    status: statusFilter !== "all" ? statusFilter : undefined,
    page,
    limit: 20
  });

  const filtered = debouncedSearch
    ? (data?.cases ?? []).filter(c =>
        c.title?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        c.caseCode?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        c.patientName?.toLowerCase().includes(debouncedSearch.toLowerCase())
      )
    : (data?.cases ?? []);

  return (
    <Layout>
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Treatment Cases</h1>
            <p className="text-muted-foreground">Monitor and manage all active orthodontic cases.</p>
          </div>
          <div className="flex w-full sm:w-auto items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search cases…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 w-52"
              />
            </div>
            <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setPage(1); }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(search || statusFilter !== "all") && (
              <Button variant="ghost" size="icon" onClick={() => { setSearch(""); setStatusFilter("all"); }}>
                <FilterX className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center p-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p>No cases found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Case Code</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(c => (
                    <TableRow key={c.id} className="cursor-pointer hover:bg-muted/40">
                      <TableCell>
                        <Link href={`/cases/${c.id}`}>
                          <span className="font-mono text-sm text-primary hover:underline">{c.caseCode}</span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/cases/${c.id}`}>
                          <span className="font-medium hover:underline">{c.title}</span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/patients/${c.patientId}`}>
                          <span className="text-muted-foreground hover:text-foreground hover:underline">{c.patientName}</span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${STATUS_COLORS[c.status] ?? "bg-muted text-muted-foreground"}`}>
                          {formatStatus(c.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {data && data.total > 20 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Showing {((page - 1) * 20) + 1}–{Math.min(page * 20, data.total)} of {data.total}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page * 20 >= data.total} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
