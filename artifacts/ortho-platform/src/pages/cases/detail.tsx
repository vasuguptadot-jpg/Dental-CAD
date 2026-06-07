import { useState, useRef } from "react";
import { useRoute, Link } from "wouter";
import { Layout } from "@/components/layout";
import { 
  useGetCase, 
  useUpdateCase, 
  useListScans,
  getGetCaseQueryKey,
  getListScansQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, Upload, Box, Settings, CheckCircle2, ChevronRight, File, Brain } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const STATUS_FLOW = [
  "new",
  "scan_uploaded",
  "analysis_completed",
  "treatment_planning",
  "approved",
  "manufacturing"
];

const formatStatus = (status: string) => {
  return status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

export default function CaseDetail() {
  const [, params] = useRoute("/cases/:caseId");
  const caseId = params?.caseId ? parseInt(params.caseId, 10) : 0;
  
  const { data: caseData, isLoading: caseLoading } = useGetCase(caseId, {
    query: { enabled: !!caseId, queryKey: getGetCaseQueryKey(caseId) }
  });
  
  const { data: scans, isLoading: scansLoading } = useListScans(caseId, {
    query: { enabled: !!caseId, queryKey: getListScansQueryKey(caseId) }
  });

  if (caseLoading) {
    return (
      <Layout>
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!caseData) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-[50vh] space-y-4">
          <h2 className="text-2xl font-bold">Case not found</h2>
          <Link href="/cases">
            <Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Cases</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const currentStatusIndex = STATUS_FLOW.indexOf(caseData.status);

  return (
    <Layout>
      <div className="space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <Link href={`/patients/${caseData.patientId}`}>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold tracking-tight">{caseData.title}</h1>
                <Badge variant="outline" className="font-mono">{caseData.caseCode}</Badge>
              </div>
              <p className="text-muted-foreground">Patient: {caseData.patientName}</p>
            </div>
          </div>
          <UpdateStatusDialog caseData={caseData} />
        </div>

        {/* Status Stepper */}
        <Card>
          <CardContent className="p-6">
            <div className="relative">
              <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-muted -translate-y-1/2 z-0" />
              <div className="relative z-10 flex justify-between">
                {STATUS_FLOW.map((status, index) => {
                  const isCompleted = index < currentStatusIndex;
                  const isCurrent = index === currentStatusIndex;
                  
                  return (
                    <div key={status} className="flex flex-col items-center gap-2 bg-card px-2">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center border-2 transition-colors ${
                        isCompleted ? "bg-primary border-primary text-primary-foreground" :
                        isCurrent ? "bg-background border-primary text-primary" :
                        "bg-background border-muted text-muted-foreground"
                      }`}>
                        {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : <div className="h-2 w-2 rounded-full bg-current" />}
                      </div>
                      <span className={`text-xs font-medium ${isCurrent ? "text-primary" : "text-muted-foreground"}`}>
                        {formatStatus(status)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-1 h-fit">
            <CardHeader>
              <CardTitle>Case Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium">Created On</p>
                <p className="text-sm text-muted-foreground">{new Date(caseData.createdAt).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Last Updated</p>
                <p className="text-sm text-muted-foreground">{new Date(caseData.updatedAt || caseData.createdAt).toLocaleString()}</p>
              </div>
              {caseData.notes && (
                <div className="pt-4 border-t">
                  <p className="text-sm font-medium">Clinical Notes</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">{caseData.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>Digital Scans</CardTitle>
              <UploadScanDialog caseId={caseId} />
            </CardHeader>
            <CardContent>
              {scansLoading ? (
                <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : scans?.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
                  <Box className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  <p>No 3D scans uploaded for this case</p>
                  <p className="text-sm mt-1">Upload STL, OBJ, or PLY files to begin planning</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {scans?.map((scan) => (
                    <div key={scan.id} className="flex flex-col border rounded-lg overflow-hidden bg-card transition-all hover:border-primary/50">
                      <div className="p-4 flex-1">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <div className="p-2 bg-primary/10 text-primary rounded-md">
                              <Box className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="font-medium text-sm truncate w-[150px]" title={scan.originalName || scan.fileName}>
                                {scan.originalName || scan.fileName}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="secondary" className="text-[10px] px-1 py-0 uppercase">
                                  {scan.fileType}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {(scan.fileSize / (1024 * 1024)).toFixed(2)} MB
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground border-t pt-3">
                          <span className="capitalize">{scan.jawType} Jaw</span>
                          <span>{new Date(scan.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex border-t divide-x border-border flex-wrap">
                        <Link href={`/scan-viewer/${scan.id}`} className="flex-1 bg-muted p-2 flex items-center justify-center text-xs font-medium text-primary hover:bg-primary hover:text-primary-foreground transition-colors group">
                          3D View
                        </Link>
                        <Link href={`/segmentation/${scan.id}`} className="flex-1 bg-muted p-2 flex items-center justify-center text-xs font-medium text-cyan-500 hover:bg-cyan-500 hover:text-primary-foreground transition-colors">
                          <Brain className="h-3 w-3 mr-1" /> Segment
                        </Link>
                        <Link href={`/ortho-analysis/${scan.id}`} className="flex-1 bg-muted p-2 flex items-center justify-center text-xs font-medium text-violet-400 hover:bg-violet-600 hover:text-white transition-colors">
                          <Brain className="h-3 w-3 mr-1" /> Analysis
                        </Link>
                        <Link href={`/ai-copilot/${scan.id}`} className="flex-1 bg-muted p-2 flex items-center justify-center text-xs font-medium text-emerald-400 hover:bg-emerald-600 hover:text-white transition-colors">
                          AI Copilot
                        </Link>
                        <Link href={`/treatment-planner/${scan.id}`} className="flex-1 bg-muted p-2 flex items-center justify-center text-xs font-medium text-violet-400 hover:bg-violet-600 hover:text-white transition-colors">
                          Planner
                        </Link>
                        <Link href={`/aligner-staging/${scan.id}`} className="flex-1 bg-muted p-2 flex items-center justify-center text-xs font-medium text-cyan-400 hover:bg-cyan-600 hover:text-white transition-colors">
                          Staging
                        </Link>
                        <Link href={`/manufacturing/${scan.id}`} className="flex-1 bg-muted p-2 flex items-center justify-center text-xs font-medium text-orange-400 hover:bg-orange-600 hover:text-white transition-colors">
                          Manufacture
                        </Link>
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

function UpdateStatusDialog({ caseData }: { caseData: any }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<any>(caseData.status);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateCase = useUpdateCase();

  const handleUpdate = () => {
    updateCase.mutate({ caseId: caseData.id, data: { status } }, {
      onSuccess: () => {
        toast({ title: "Status updated" });
        queryClient.invalidateQueries({ queryKey: getGetCaseQueryKey(caseData.id) });
        setOpen(false);
      },
      onError: (err) => {
        toast({ variant: "destructive", title: "Failed to update", description: (err as any)?.error });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Settings className="h-4 w-4" /> Change Status
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Update Case Status</DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <Label>Current Phase</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FLOW.map(s => (
                  <SelectItem key={s} value={s}>{formatStatus(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end pt-4">
            <Button onClick={handleUpdate} disabled={updateCase.isPending || status === caseData.status}>
              {updateCase.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Apply Change
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UploadScanDialog({ caseId }: { caseId: number }) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [jawType, setJawType] = useState<string>("upper");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    uploadFile(file);
  };

  const uploadFile = (file: File) => {
    setUploading(true);
    setProgress(0);
    
    const formData = new FormData();
    formData.append("file", file);
    formData.append("jawType", jawType);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/cases/${caseId}/scans/upload`, true);
    
    // Add auth if needed, but cookies should be sent automatically with standard config
    
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      setUploading(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        toast({ title: "Scan uploaded successfully" });
        queryClient.invalidateQueries({ queryKey: getListScansQueryKey(caseId) });
        setOpen(false);
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
      if (fileInputRef.current) fileInputRef.current.value = "";
    };

    xhr.send(formData);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!uploading) setOpen(v); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2"><Upload className="h-4 w-4" /> Upload Scan</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload 3D Scan</DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <Label>Jaw Alignment</Label>
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
          
          <div className="pt-4">
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
                  <span>Uploading...</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
              </div>
            ) : (
              <Button 
                onClick={() => fileInputRef.current?.click()} 
                className="w-full h-32 border-2 border-dashed bg-muted/20 hover:bg-muted/50 flex flex-col gap-2"
                variant="outline"
              >
                <File className="h-8 w-8 text-muted-foreground" />
                <span>Select STL, OBJ, or PLY file</span>
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
