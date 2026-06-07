import { useState, useRef, useEffect } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ArrowLeft, Upload, Box, Settings, CheckCircle2, ChevronRight, File, Brain, Camera, ImageIcon, Trash2, TrendingUp, GitCompare, Scale, Scissors, MessageSquare, Send, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const STATUS_FLOW = [
  "draft",
  "in_planning",
  "under_review",
  "approved",
  "active",
  "completed",
];

const LEGACY_STATUS_FLOW = [
  "new",
  "scan_uploaded",
  "analysis_completed",
  "treatment_planning",
  "approved",
  "manufacturing",
];

const STATUS_LABELS: Record<string, string> = {
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

const formatStatus = (status: string) => {
  return STATUS_LABELS[status] ?? status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
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

  const activeFlow = STATUS_FLOW.includes(caseData.status) ? STATUS_FLOW : LEGACY_STATUS_FLOW;
  const currentStatusIndex = activeFlow.indexOf(caseData.status);

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
          <div className="flex items-center gap-2">
            <Link href={`/progress/${caseId}`}>
              <Button variant="outline" size="sm" className="gap-2"><TrendingUp className="h-4 w-4" />Progress</Button>
            </Link>
            <Link href={`/plan-comparison/${caseId}`}>
              <Button variant="outline" size="sm" className="gap-2"><GitCompare className="h-4 w-4" />Compare Plans</Button>
            </Link>
            <UpdateStatusDialog caseData={caseData} />
          </div>
        </div>

        {/* Status Stepper */}
        <Card>
          <CardContent className="p-6">
            <div className="relative">
              <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-muted -translate-y-1/2 z-0" />
              <div className="relative z-10 flex justify-between overflow-x-auto gap-1">
                {activeFlow.map((status, index) => {
                  const isCompleted = index < currentStatusIndex;
                  const isCurrent = index === currentStatusIndex;
                  return (
                    <div key={status} className="flex flex-col items-center gap-2 bg-card px-2 min-w-[70px]">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center border-2 transition-colors shrink-0 ${
                        isCompleted ? "bg-primary border-primary text-primary-foreground" :
                        isCurrent ? "bg-background border-primary text-primary" :
                        "bg-background border-muted text-muted-foreground"
                      }`}>
                        {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : <div className="h-2 w-2 rounded-full bg-current" />}
                      </div>
                      <span className={`text-xs font-medium text-center leading-tight ${isCurrent ? "text-primary" : "text-muted-foreground"}`}>
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
              <div className="pt-4 border-t space-y-2">
                <p className="text-sm font-medium">Clinical Tools</p>
                <div className="flex flex-col gap-1.5">
                  <Link href="/bolton-analysis">
                    <Button variant="outline" size="sm" className="w-full justify-start gap-2 text-xs h-7">
                      <Scale className="h-3.5 w-3.5 text-cyan-400" /> Bolton Analysis
                    </Button>
                  </Link>
                  <Link href="/ipr-calculator">
                    <Button variant="outline" size="sm" className="w-full justify-start gap-2 text-xs h-7">
                      <Scissors className="h-3.5 w-3.5 text-cyan-400" /> IPR Calculator
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="lg:col-span-2">
          <Tabs defaultValue="scans">
            <TabsList className="mb-4">
              <TabsTrigger value="scans" className="gap-2"><Box className="h-3.5 w-3.5" /> 3D Scans</TabsTrigger>
              <TabsTrigger value="photos" className="gap-2"><Camera className="h-3.5 w-3.5" /> Photos</TabsTrigger>
              <TabsTrigger value="notes" className="gap-2"><MessageSquare className="h-3.5 w-3.5" /> Case Notes</TabsTrigger>
            </TabsList>
            <TabsContent value="scans">
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
            </TabsContent>
            <TabsContent value="photos">
              <PhotosPanel caseId={caseId} />
            </TabsContent>
            <TabsContent value="notes">
              <CaseNotesPanel caseId={caseId} />
            </TabsContent>
          </Tabs>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function CaseNotesPanel({ caseId }: { caseId: number }) {
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [noteType, setNoteType] = useState("clinical");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const loadNotes = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/notes`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setNotes(data);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { loadNotes(); }, [caseId]);

  const handleSubmit = async () => {
    if (!newNote.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: newNote.trim(), noteType }),
      });
      if (res.ok) {
        toast({ title: "Note added" });
        setNewNote("");
        loadNotes();
      } else {
        toast({ variant: "destructive", title: "Failed to add note" });
      }
    } catch {
      toast({ variant: "destructive", title: "Network error" });
    }
    setSubmitting(false);
  };

  const NOTE_TYPE_COLORS: Record<string, string> = {
    clinical: "bg-blue-500/20 text-blue-400",
    administrative: "bg-amber-500/20 text-amber-400",
    lab: "bg-purple-500/20 text-purple-400",
    patient: "bg-green-500/20 text-green-400",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" /> Case Notes & Assignments
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex gap-2">
            <Select value={noteType} onValueChange={setNoteType}>
              <SelectTrigger className="w-36 h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="clinical">Clinical</SelectItem>
                <SelectItem value="administrative">Administrative</SelectItem>
                <SelectItem value="lab">Lab Note</SelectItem>
                <SelectItem value="patient">Patient Instruction</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex-1 flex gap-2">
              <Textarea
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                placeholder="Add a case note…"
                className="h-9 min-h-0 resize-none py-2"
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
              />
              <Button size="icon" onClick={handleSubmit} disabled={submitting || !newNote.trim()}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : notes.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground border border-dashed rounded-lg">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-20" />
            <p className="text-sm">No notes yet. Add the first one above.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {notes.map((note: any) => (
              <div key={note.id} className="flex gap-3 p-3 bg-muted/30 rounded-lg border">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${NOTE_TYPE_COLORS[note.noteType] ?? "bg-muted text-muted-foreground"}`}>
                      {note.noteType}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {note.authorName ?? "You"} · {new Date(note.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PhotosPanel({ caseId }: { caseId: number }) {
  const [photos, setPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoType, setPhotoType] = useState("intraoral");
  const [notes, setNotes] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const loadPhotos = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cases/${caseId}/photos`, { credentials: "include" });
      const data = await res.json();
      setPhotos(data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { loadPhotos(); }, [caseId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", photoType);
    formData.append("notes", notes);
    try {
      const res = await fetch(`/api/cases/${caseId}/photos/upload`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (res.ok) {
        toast({ title: "Photo uploaded" });
        loadPhotos();
        setNotes("");
      } else {
        toast({ variant: "destructive", title: "Upload failed" });
      }
    } catch {
      toast({ variant: "destructive", title: "Network error" });
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = async (photoId: number) => {
    await fetch(`/api/photos/${photoId}`, { method: "DELETE", credentials: "include" });
    setPhotos(prev => prev.filter(p => p.id !== photoId));
    toast({ title: "Photo deleted" });
  };

  const photoTypeLabel: Record<string, string> = {
    intraoral: "Intraoral",
    extraoral: "Extraoral",
    opg: "OPG X-ray",
    panoramic: "Panoramic",
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Clinical Photos</CardTitle>
        <div className="flex items-center gap-2">
          <Select value={photoType} onValueChange={setPhotoType}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="intraoral">Intraoral</SelectItem>
              <SelectItem value="extraoral">Extraoral</SelectItem>
              <SelectItem value="opg">OPG X-ray</SelectItem>
              <SelectItem value="panoramic">Panoramic</SelectItem>
            </SelectContent>
          </Select>
          <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
          <Button size="sm" className="gap-2 h-8" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            Upload Photo
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : photos.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
            <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-20" />
            <p>No photos uploaded yet</p>
            <p className="text-sm mt-1">Upload intraoral, extraoral, or OPG/panoramic images</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {photos.map((photo) => (
              <div key={photo.id} className="border rounded-lg overflow-hidden bg-card">
                <div className="aspect-video bg-muted/30 flex items-center justify-center">
                  {photo.originalName?.match(/\.(jpg|jpeg|png|webp)$/i) ? (
                    <img
                      src={`/api/photos/${photo.id}/file`}
                      alt={photo.originalName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <File className="h-12 w-12 text-muted-foreground opacity-40" />
                  )}
                </div>
                <div className="p-2.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[10px]">{photoTypeLabel[photo.type] ?? photo.type}</Badge>
                    <span className="text-[10px] text-muted-foreground">{new Date(photo.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{photo.originalName}</p>
                  <div className="flex items-center gap-1 pt-0.5">
                    <a href={`/api/photos/${photo.id}/file`} target="_blank" rel="noopener noreferrer" className="flex-1">
                      <Button variant="outline" size="sm" className="w-full h-6 text-[10px]">View</Button>
                    </a>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(photo.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
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
                <SelectItem value="_header_new" disabled className="text-[10px] text-muted-foreground uppercase font-semibold">New Workflow</SelectItem>
                {STATUS_FLOW.map(s => (
                  <SelectItem key={s} value={s}>{formatStatus(s)}</SelectItem>
                ))}
                <SelectItem value="_header_legacy" disabled className="text-[10px] text-muted-foreground uppercase font-semibold mt-1">Legacy</SelectItem>
                {LEGACY_STATUS_FLOW.filter(s => !STATUS_FLOW.includes(s)).map(s => (
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
