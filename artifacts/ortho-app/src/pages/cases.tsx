import { useState } from "react";
import { useListCases, OrthoCaseStatus } from "@workspace/api-client-react";
import { MainLayout } from "@/components/layout/main-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, FileBox } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge, statusLabels } from "@/components/ui/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Cases() {
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: casesData, isLoading } = useListCases(
    statusFilter !== "all" ? { status: statusFilter } : {}
  );

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Cases</h1>
            <p className="text-muted-foreground mt-1">
              Track and manage all orthodontic treatment plans.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {Object.entries(statusLabels).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Case ID</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right pr-6">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : !casesData?.cases.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center">
                      <div className="flex flex-col items-center justify-center text-muted-foreground">
                        <FileBox className="h-8 w-8 mb-2 opacity-50" />
                        <p>No cases found matching the criteria.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  casesData.cases.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="pl-6 font-mono text-xs text-muted-foreground">
                        {c.caseCode}
                      </TableCell>
                      <TableCell className="font-medium">
                        <Link href={`/patients/${c.patientId}`} className="hover:underline">
                          {c.patientName || `Patient #${c.patientId}`}
                        </Link>
                      </TableCell>
                      <TableCell>{c.title || 'Untitled Case'}</TableCell>
                      <TableCell>
                        <StatusBadge status={c.status as OrthoCaseStatus} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(c.createdAt), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <Link href={`/cases/${c.id}`}>
                          <Button variant="ghost" size="sm">Open</Button>
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
    </MainLayout>
  );
}
