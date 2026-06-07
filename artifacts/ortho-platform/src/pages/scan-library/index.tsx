import { useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  ScanLine, Search, Filter, Star, CheckCircle2, AlertTriangle,
  XCircle, Loader2, ArrowUpRight, Link2, User, Calendar, Monitor,
  HardDrive, Layers, ChevronDown,
} from "lucide-react";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type ScanItem = {
  id: number; caseId: number; caseCode: string | null; patientName: string | null;
  originalName: string; fileType: string; fileSize: number; jawType: string;
  deviceName: string | null; deviceModel: string | null;
  scanDate: string; qualityScore: number; qualityLabel: string;
  pairedScanId: number | null; notes: string | null; createdAt: string;
};

type Stats = {
  total: number;
  byFileType: Array<{ fileType: string; count: number }>;
  byJawType: Array<{ jawType: string; count: number }>;
};

const QUALITY_CONFIG: Record<string, { color: string; icon: React.ElementType; ring: string }> = {
  Excellent: { color: "text-green-400",  icon: Star,          ring: "ring-green-500/40" },
  Good:      { color: "text-blue-400",   icon: CheckCircle2,  ring: "ring-blue-500/40" },
  Fair:      { color: "text-yellow-400", icon: AlertTriangle, ring: "ring-yellow-500/40" },
  Poor:      { color: "text-red-400",    icon: XCircle,       ring: "ring-red-500/40" },
};

const JAW_LABEL: Record<string, string> = { upper: "Upper", lower: "Lower", both: "Both" };

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function useScans(params: { search?: string; jawType?: string; fileType?: string; page?: number }) {
  const qp = new URLSearchParams({ limit: "24", page: String(params.page ?? 1) });
  if (params.search) qp.set("search", params.search);
  if (params.jawType && params.jawType !== "all") qp.set("jawType", params.jawType);
  if (params.fileType && params.fileType !== "all") qp.set("fileType", params.fileType);

  return useQuery<{ scans: ScanItem[]; total: number }>({
    queryKey: ["scan-library", params],
    queryFn: async () => {
      const r = await fetch(`/api/scan-library?${qp}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });
}

function useStats() {
  return useQuery<Stats>({
    queryKey: ["scan-library-stats"],
    queryFn: async () => {
      const r = await fetch(`/api/scan-library/stats`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });
}

function QualityRing({ score, label }: { score: number; label: string }) {
  const cfg = QUALITY_CONFIG[label] ?? QUALITY_CONFIG.Fair;
  const Icon = cfg.icon;
  const r = 20, cx = 26, cy = 26, circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="52" height="52" className="-rotate-90">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/30" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth="3"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          className={cfg.color} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-xs font-bold ${cfg.color}`}>{score}</span>
      </div>
    </div>
  );
}

export default function ScanLibrary() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [jawFilter, setJawFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [editScan, setEditScan] = useState<ScanItem | null>(null);
  const [pairMode, setPairMode] = useState<{ scan: ScanItem } | null>(null);
  const [pairTarget, setPairTarget] = useState("");
  const [metaForm, setMetaForm] = useState({ deviceName: "", deviceModel: "", scanDate: "", notes: "" });

  const { data, isLoading } = useScans({ search, jawType: jawFilter, fileType: typeFilter, page });
  const { data: stats } = useStats();
  const scans = data?.scans ?? [];
  const total = data?.total ?? 0;

  const saveMeta = useMutation({
    mutationFn: async ({ scanId, body }: { scanId: number; body: object }) => {
      const r = await fetch(`/api/scan-library/${scanId}/metadata`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["scan-library"] }); setEditScan(null); toast({ title: "Scan metadata saved" }); },
    onError: () => toast({ title: "Failed to save metadata", variant: "destructive" }),
  });

  const pairScans = useMutation({
    mutationFn: async ({ scanId1, scanId2 }: { scanId1: number; scanId2: number }) => {
      const r = await fetch(`/api/scan-library/pair`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanId1, scanId2 }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["scan-library"] }); setPairMode(null); setPairTarget(""); toast({ title: "Scans paired successfully" }); },
    onError: () => toast({ title: "Failed to pair scans", variant: "destructive" }),
  });

  const totalPages = Math.ceil(total / 24);

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ScanLine className="h-6 w-6 text-primary" />
              Scan Library
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage, organize, and pair intraoral scans by device, date, and arch
            </p>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold">{stats.total}</div>
                <div className="text-xs text-muted-foreground">Total Scans</div>
              </CardContent>
            </Card>
            {stats.byJawType.map(j => (
              <Card key={j.jawType}>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold">{j.count}</div>
                  <div className="text-xs text-muted-foreground">{JAW_LABEL[j.jawType] ?? j.jawType} Arch</div>
                </CardContent>
              </Card>
            ))}
            {stats.byFileType.map(t => (
              <Card key={t.fileType}>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold">{t.count}</div>
                  <div className="text-xs text-muted-foreground uppercase">.{t.fileType}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by patient, case, device..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <div className="flex gap-1">
              {["all", "upper", "lower", "both"].map(j => (
                <Button key={j} size="sm" variant={jawFilter === j ? "secondary" : "outline"} onClick={() => { setJawFilter(j); setPage(1); }} className="text-xs capitalize">
                  {j === "all" ? "All Arches" : JAW_LABEL[j]}
                </Button>
              ))}
            </div>
            <div className="flex gap-1">
              {["all", "stl", "obj", "ply"].map(t => (
                <Button key={t} size="sm" variant={typeFilter === t ? "secondary" : "outline"} onClick={() => { setTypeFilter(t); setPage(1); }} className="text-xs uppercase">
                  {t === "all" ? "All Types" : `.${t}`}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : scans.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <ScanLine className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium">No scans found</p>
              <p className="text-muted-foreground text-sm mt-1">Upload scans through a case to populate the library.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {scans.map(scan => {
                const qCfg = QUALITY_CONFIG[scan.qualityLabel] ?? QUALITY_CONFIG.Fair;
                return (
                  <Card key={scan.id} className="group hover:border-primary/50 transition-colors">
                    <CardContent className="p-4 space-y-3">
                      {/* Quality + type header */}
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <QualityRing score={scan.qualityScore} label={scan.qualityLabel} />
                          <div>
                            <p className={`text-xs font-semibold ${qCfg.color}`}>{scan.qualityLabel}</p>
                            <p className="text-xs text-muted-foreground uppercase">.{scan.fileType}</p>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          {scan.pairedScanId && (
                            <Badge className="bg-cyan-500/20 text-cyan-400 text-xs px-1.5">
                              <Link2 className="h-3 w-3 mr-0.5" />Paired
                            </Badge>
                          )}
                          <Badge className="bg-muted text-muted-foreground text-xs px-1.5 capitalize">
                            {JAW_LABEL[scan.jawType] ?? scan.jawType}
                          </Badge>
                        </div>
                      </div>

                      {/* File name */}
                      <div>
                        <p className="text-sm font-medium truncate" title={scan.originalName}>{scan.originalName}</p>
                        <p className="text-xs text-muted-foreground">{formatBytes(scan.fileSize)}</p>
                      </div>

                      {/* Meta rows */}
                      <div className="space-y-1 text-xs text-muted-foreground">
                        {scan.patientName && (
                          <div className="flex items-center gap-1.5">
                            <User className="h-3 w-3 shrink-0" />
                            <span className="truncate">{scan.patientName}</span>
                            {scan.caseCode && <span className="font-mono shrink-0">{scan.caseCode}</span>}
                          </div>
                        )}
                        {scan.deviceName && (
                          <div className="flex items-center gap-1.5">
                            <Monitor className="h-3 w-3 shrink-0" />
                            <span className="truncate">{scan.deviceName}{scan.deviceModel ? ` · ${scan.deviceModel}` : ""}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3 w-3 shrink-0" />
                          <span>{new Date(scan.scanDate).toLocaleDateString()}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-1 pt-1 border-t opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="sm" variant="ghost" className="flex-1 text-xs h-7"
                          onClick={() => {
                            setEditScan(scan);
                            setMetaForm({
                              deviceName: scan.deviceName ?? "",
                              deviceModel: scan.deviceModel ?? "",
                              scanDate: scan.scanDate ? scan.scanDate.split("T")[0] : "",
                              notes: scan.notes ?? "",
                            });
                          }}
                        >
                          Edit Info
                        </Button>
                        <Button size="sm" variant="ghost" className="flex-1 text-xs h-7"
                          onClick={() => { setPairMode({ scan }); setPairTarget(""); }}
                        >
                          <Link2 className="h-3 w-3 mr-1" />Pair
                        </Button>
                        <Link href={`/scan-viewer/${scan.id}`}>
                          <Button size="sm" variant="ghost" className="text-xs h-7 px-2">
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Edit Metadata Dialog */}
      <Dialog open={!!editScan} onOpenChange={v => !v && setEditScan(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Scan Metadata</DialogTitle></DialogHeader>
          {editScan && (
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground font-mono">{editScan.originalName}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Scanner Device</Label>
                  <Input placeholder="e.g. iTero Element" value={metaForm.deviceName} onChange={e => setMetaForm(p => ({ ...p, deviceName: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Model</Label>
                  <Input placeholder="e.g. 5D Plus" value={metaForm.deviceModel} onChange={e => setMetaForm(p => ({ ...p, deviceModel: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Scan Date</Label>
                <Input type="date" value={metaForm.scanDate} onChange={e => setMetaForm(p => ({ ...p, scanDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Notes</Label>
                <textarea
                  className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                  placeholder="Clinical notes about this scan..."
                  value={metaForm.notes}
                  onChange={e => setMetaForm(p => ({ ...p, notes: e.target.value }))}
                />
              </div>
              <Button
                className="w-full"
                disabled={saveMeta.isPending}
                onClick={() => saveMeta.mutate({ scanId: editScan.id, body: metaForm })}
              >
                {saveMeta.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Metadata"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Pair Scans Dialog */}
      <Dialog open={!!pairMode} onOpenChange={v => !v && setPairMode(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Pair Upper & Lower Arch Scans</DialogTitle></DialogHeader>
          {pairMode && (
            <div className="space-y-4 pt-2">
              <div className="rounded-md border p-3 bg-muted/30">
                <p className="text-xs text-muted-foreground">Scan A</p>
                <p className="font-medium text-sm">{pairMode.scan.originalName}</p>
                <p className="text-xs text-muted-foreground capitalize">{JAW_LABEL[pairMode.scan.jawType] ?? pairMode.scan.jawType} arch</p>
              </div>
              <div className="flex items-center justify-center">
                <Link2 className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <Label>Scan B ID (the matching arch)</Label>
                <Input
                  type="number"
                  placeholder="Enter scan ID to pair with..."
                  value={pairTarget}
                  onChange={e => setPairTarget(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">You can find scan IDs in the scan library. Typically pair upper with lower arch.</p>
              </div>
              <Button
                className="w-full"
                disabled={!pairTarget || pairScans.isPending}
                onClick={() => pairScans.mutate({ scanId1: pairMode.scan.id, scanId2: parseInt(pairTarget) })}
              >
                {pairScans.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Pair Scans"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
