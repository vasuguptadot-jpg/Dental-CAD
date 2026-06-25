import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ScanLine, Upload, Search, Loader2, ArrowRight, User, AlertCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type ScanItem = {
  id: number;
  caseId: number;
  caseCode: string | null;
  patientName: string | null;
  originalName: string;
  fileType: string;
  fileSize: number;
  jawType: string;
  qualityScore: number;
  qualityLabel: string;
};

type CaseItem = {
  id: number;
  caseCode: string;
  status: string;
  patientName: string | null;
};

const JAW_LABEL: Record<string, string> = { upper: "Upper", lower: "Lower", both: "Both" };

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadScanDialog({ onSuccess, caseId: propCaseId }: { onSuccess?: () => void; caseId?: number }) {
  const [open, setOpen] = useState(false);
  const [caseId, setCaseId] = useState(propCaseId ? String(propCaseId) : "");
  const [jawType, setJawType] = useState("upper");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { data: casesData, isLoading: casesLoading } = useQuery({
    queryKey: ["cases-for-upload"],
    queryFn: async () => {
      const r = await fetch("/api/cases?limit=200", { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json() as Promise<{ cases: CaseItem[] }>;
    },
    enabled: open && !propCaseId,
  });

  const cases = casesData?.cases ?? [];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const activeCaseId = propCaseId ? String(propCaseId) : caseId;
    if (!file || !activeCaseId) return;
    setCaseId(activeCaseId);

    setUploading(true);
    setProgress(0);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("jawType", jawType);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/cases/${activeCaseId}/scans/upload`, true);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setUploading(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        toast({ title: "Scan uploaded successfully" });
        setOpen(false);
        if (!propCaseId) setCaseId("");
        onSuccess?.();
      } else {
        try {
          const res = JSON.parse(xhr.responseText);
          toast({ variant: "destructive", title: "Upload failed", description: res.error });
        } catch {
          toast({ variant: "destructive", title: "Upload failed" });
        }
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    xhr.onerror = () => {
      setUploading(false);
      toast({ variant: "destructive", title: "Network error during upload" });
    };
    xhr.send(formData);
  };

  const activeCaseId = propCaseId ? String(propCaseId) : caseId;
  const isReady = !!activeCaseId;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!uploading) setOpen(v); }}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Upload className="h-4 w-4" /> Upload 3D Scan
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload 3D Jaw Model</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {!propCaseId && (
            casesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : cases.length === 0 ? (
              <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
                <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="text-sm text-muted-foreground">
                  You need to{" "}
                  <a href="/cases" className="text-primary hover:underline font-medium">
                    create a patient case
                  </a>{" "}
                  before uploading a scan. Scans are always linked to a case.
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Patient Case</Label>
                <Select value={caseId} onValueChange={setCaseId} disabled={uploading}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a case..." />
                  </SelectTrigger>
                  <SelectContent>
                    {cases.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.caseCode}
                        {c.patientName ? ` — ${c.patientName}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )
          )}

          {(propCaseId || cases.length > 0) && (
            <>
              <div className="space-y-2">
                <Label>Jaw Type</Label>
                <Select value={jawType} onValueChange={setJawType} disabled={uploading}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="upper">Upper Jaw (Maxilla)</SelectItem>
                    <SelectItem value="lower">Lower Jaw (Mandible)</SelectItem>
                    <SelectItem value="both">Both (Bite Registration)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-lg border-2 border-dashed border-muted-foreground/30 p-6 text-center space-y-2">
                <Upload className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="text-sm font-medium">Select your 3D jaw model file</p>
                <p className="text-xs text-muted-foreground">Supports .STL, .OBJ, .PLY — up to 200 MB</p>
              </div>

              <input
                type="file"
                accept=".stl,.obj,.ply"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileChange}
              />

              {uploading ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Uploading…</span>
                    <span className="font-medium">{progress}%</span>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              ) : (
                <Button
                  className="w-full gap-2"
                  disabled={!isReady}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" /> Choose File (.stl, .obj, .ply)
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ScanPickerProps {
  targetPath: string;
  title: string;
  description: string;
  Icon: LucideIcon;
}

export function ScanPicker({ targetPath, title, description, Icon }: ScanPickerProps) {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery<{ scans: ScanItem[]; total: number }>({
    queryKey: ["scan-library-picker"],
    queryFn: async () => {
      const r = await fetch("/api/scan-library?limit=100", { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const allScans = data?.scans ?? [];
  const scans = allScans.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.originalName.toLowerCase().includes(q) ||
      (s.patientName ?? "").toLowerCase().includes(q) ||
      (s.caseCode ?? "").toLowerCase().includes(q)
    );
  });

  const handleUploadSuccess = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ["scan-library"] });
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Icon className="h-6 w-6 text-primary" /> {title}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">{description}</p>
          </div>
          <UploadScanDialog onSuccess={handleUploadSuccess} />
        </div>

        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center space-y-2">
          <Icon className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="font-medium text-lg">Select a patient scan to begin</p>
          <p className="text-sm text-muted-foreground">
            Choose a scan from your library below, or upload a new 3D model (.stl, .obj, .ply)
          </p>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by patient, case code, or file name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : scans.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center space-y-4">
              <ScanLine className="h-10 w-10 text-muted-foreground mx-auto" />
              <div>
                <p className="font-medium">No scans in your library yet</p>
                <p className="text-muted-foreground text-sm mt-1">
                  Upload a 3D jaw scan to get started with {title}
                </p>
              </div>
              <UploadScanDialog onSuccess={handleUploadSuccess} />
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {scans.map((scan) => (
              <Card
                key={scan.id}
                className="group hover:border-primary/50 transition-all cursor-pointer hover:shadow-md"
                onClick={() => navigate(`${targetPath}/${scan.id}`)}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <ScanLine className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-primary">{scan.qualityLabel}</p>
                        <p className="text-xs text-muted-foreground uppercase">.{scan.fileType}</p>
                      </div>
                    </div>
                    <Badge className="bg-muted text-muted-foreground text-xs capitalize">
                      {JAW_LABEL[scan.jawType] ?? scan.jawType}
                    </Badge>
                  </div>

                  <div>
                    <p className="text-sm font-medium truncate" title={scan.originalName}>
                      {scan.originalName}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatBytes(scan.fileSize)}</p>
                  </div>

                  {scan.patientName && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <User className="h-3 w-3 shrink-0" />
                      <span className="truncate">{scan.patientName}</span>
                      {scan.caseCode && (
                        <span className="font-mono text-muted-foreground/70 shrink-0">
                          {scan.caseCode}
                        </span>
                      )}
                    </div>
                  )}

                  <Button
                    size="sm"
                    className="w-full gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity"
                    tabIndex={-1}
                  >
                    Open in {title} <ArrowRight className="h-3 w-3" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
