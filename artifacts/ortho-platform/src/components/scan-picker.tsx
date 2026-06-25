import { useState, useRef, useEffect } from "react";
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
  ScanLine, Upload, Search, Loader2, ArrowRight, User, UserPlus,
  ChevronLeft, CheckCircle2,
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

type Step = "select" | "new-patient" | "upload";

const JAW_LABEL: Record<string, string> = { upper: "Upper", lower: "Lower", both: "Both" };

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const GENDERS = ["Male", "Female", "Other"];

const STEP_LABELS: Record<Step, string> = {
  "select": "Select Case",
  "new-patient": "Patient Details",
  "upload": "Upload Scan",
};

export function UploadScanDialog({
  onSuccess,
  caseId: propCaseId,
}: {
  onSuccess?: () => void;
  caseId?: number;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>(propCaseId ? "upload" : "select");
  const [caseId, setCaseId] = useState(propCaseId ? String(propCaseId) : "");
  const [jawType, setJawType] = useState("upper");
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [createdCaseName, setCreatedCaseName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [patientForm, setPatientForm] = useState({
    fullName: "",
    age: "",
    gender: "",
    mobileNumber: "",
    email: "",
  });
  const [formErrors, setFormErrors] = useState<Partial<typeof patientForm>>({});

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

  // Auto-advance to new-patient step when no cases exist
  useEffect(() => {
    if (!propCaseId && open && !casesLoading && cases.length === 0 && step === "select") {
      setStep("new-patient");
    }
  }, [casesLoading, cases.length, open, propCaseId, step]);

  function resetDialog() {
    setStep(propCaseId ? "upload" : "select");
    setCaseId(propCaseId ? String(propCaseId) : "");
    setJawType("upper");
    setUploading(false);
    setCreating(false);
    setProgress(0);
    setCreatedCaseName("");
    setPatientForm({ fullName: "", age: "", gender: "", mobileNumber: "", email: "" });
    setFormErrors({});
  }

  function handleOpenChange(v: boolean) {
    if (!uploading && !creating) {
      if (!v) resetDialog();
      setOpen(v);
    }
  }

  // ── Step 1: validate and create patient + case ──
  async function handleCreatePatientAndCase() {
    const errors: Partial<typeof patientForm> = {};
    if (!patientForm.fullName.trim()) errors.fullName = "Required";
    const ageNum = parseInt(patientForm.age, 10);
    if (!patientForm.age || isNaN(ageNum) || ageNum < 1 || ageNum > 120)
      errors.age = "Enter a valid age (1–120)";
    if (!patientForm.gender) errors.gender = "Required";
    if (!patientForm.mobileNumber.trim()) errors.mobileNumber = "Required";
    if (!patientForm.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patientForm.email))
      errors.email = "Enter a valid email";

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});
    setCreating(true);

    try {
      // 1. Create patient
      const patRes = await fetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fullName: patientForm.fullName.trim(),
          age: ageNum,
          gender: patientForm.gender.toLowerCase(),
          mobileNumber: patientForm.mobileNumber.trim(),
          email: patientForm.email.trim(),
        }),
      });
      if (!patRes.ok) {
        const err = await patRes.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to create patient");
      }
      const patient = await patRes.json() as { id: number; fullName: string };

      // 2. Create case linked to patient
      const caseTitle = `${patient.fullName} — Orthodontic Case`;
      const caseRes = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          patientId: patient.id,
          title: caseTitle,
          status: "new",
        }),
      });
      if (!caseRes.ok) {
        const err = await caseRes.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to create case");
      }
      const newCase = await caseRes.json() as { id: number; caseCode: string };

      setCaseId(String(newCase.id));
      setCreatedCaseName(`${newCase.caseCode} — ${patient.fullName}`);
      setStep("upload");
      toast({
        title: "Patient & case created",
        description: `${patient.fullName} registered. Now upload the scan.`,
      });
    } catch (err) {
      toast({ variant: "destructive", title: "Setup failed", description: String(err) });
    } finally {
      setCreating(false);
    }
  }

  // ── Step 2: file upload ──
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const activeCaseId = propCaseId ? String(propCaseId) : caseId;
    if (!file || !activeCaseId) return;

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
        resetDialog();
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

  const isUploadReady = !!(propCaseId ? String(propCaseId) : caseId);

  function pf(field: keyof typeof patientForm, value: string) {
    setPatientForm(prev => ({ ...prev, [field]: value }));
    if (formErrors[field]) setFormErrors(prev => ({ ...prev, [field]: undefined }));
  }

  // ── Progress indicator ──
  function StepIndicator() {
    if (propCaseId) return null;
    const steps: Step[] = cases.length > 0
      ? ["select", "upload"]
      : ["new-patient", "upload"];
    const currentIdx = steps.indexOf(step);
    return (
      <div className="flex items-center gap-1.5 mb-1">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-1.5">
            <div className={`flex items-center gap-1 text-xs ${i <= currentIdx ? "text-primary font-semibold" : "text-muted-foreground"}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border
                ${i < currentIdx ? "bg-primary border-primary text-primary-foreground" :
                  i === currentIdx ? "border-primary text-primary" : "border-muted-foreground/40 text-muted-foreground"}`}>
                {i < currentIdx ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
              </div>
              <span className="hidden sm:inline">{STEP_LABELS[s]}</span>
            </div>
            {i < steps.length - 1 && <div className="h-px w-6 bg-muted-foreground/30" />}
          </div>
        ))}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Upload className="h-4 w-4" /> Upload 3D Scan
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload 3D Jaw Model</DialogTitle>
          <StepIndicator />
        </DialogHeader>

        {/* ── STEP: Select existing case ── */}
        {step === "select" && (
          <div className="space-y-4 py-1">
            {casesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Patient Case</Label>
                  <Select value={caseId} onValueChange={(v) => { setCaseId(v); setStep("upload"); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a case…" />
                    </SelectTrigger>
                    <SelectContent>
                      {cases.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.caseCode}{c.patientName ? ` — ${c.patientName}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="relative flex items-center gap-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">or</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => setStep("new-patient")}
                >
                  <UserPlus className="h-4 w-4" />
                  New Patient & Case
                </Button>
              </>
            )}
          </div>
        )}

        {/* ── STEP: New patient details ── */}
        {step === "new-patient" && (
          <div className="space-y-4 py-1">
            <p className="text-sm text-muted-foreground">
              Enter the patient's details. A case will be created automatically.
            </p>

            <div className="grid grid-cols-2 gap-3">
              {/* Full Name */}
              <div className="col-span-2 space-y-1.5">
                <Label>Full Name <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="e.g. Sarah Mitchell"
                  value={patientForm.fullName}
                  onChange={e => pf("fullName", e.target.value)}
                  className={formErrors.fullName ? "border-destructive" : ""}
                />
                {formErrors.fullName && <p className="text-xs text-destructive">{formErrors.fullName}</p>}
              </div>

              {/* Age */}
              <div className="space-y-1.5">
                <Label>Age <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  placeholder="e.g. 28"
                  min={1}
                  max={120}
                  value={patientForm.age}
                  onChange={e => pf("age", e.target.value)}
                  className={formErrors.age ? "border-destructive" : ""}
                />
                {formErrors.age && <p className="text-xs text-destructive">{formErrors.age}</p>}
              </div>

              {/* Gender */}
              <div className="space-y-1.5">
                <Label>Gender <span className="text-destructive">*</span></Label>
                <Select value={patientForm.gender} onValueChange={v => pf("gender", v)}>
                  <SelectTrigger className={formErrors.gender ? "border-destructive" : ""}>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDERS.map(g => (
                      <SelectItem key={g} value={g.toLowerCase()}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formErrors.gender && <p className="text-xs text-destructive">{formErrors.gender}</p>}
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <Label>Mobile Number <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="+1 555 0100"
                  value={patientForm.mobileNumber}
                  onChange={e => pf("mobileNumber", e.target.value)}
                  className={formErrors.mobileNumber ? "border-destructive" : ""}
                />
                {formErrors.mobileNumber && <p className="text-xs text-destructive">{formErrors.mobileNumber}</p>}
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <Label>Email <span className="text-destructive">*</span></Label>
                <Input
                  type="email"
                  placeholder="patient@email.com"
                  value={patientForm.email}
                  onChange={e => pf("email", e.target.value)}
                  className={formErrors.email ? "border-destructive" : ""}
                />
                {formErrors.email && <p className="text-xs text-destructive">{formErrors.email}</p>}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              {cases.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1"
                  onClick={() => setStep("select")}
                  disabled={creating}
                >
                  <ChevronLeft className="h-4 w-4" /> Back
                </Button>
              )}
              <Button
                className="flex-1 gap-2"
                onClick={handleCreatePatientAndCase}
                disabled={creating}
              >
                {creating ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
                ) : (
                  <><UserPlus className="h-4 w-4" /> Create &amp; Continue</>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP: Upload scan ── */}
        {step === "upload" && (
          <div className="space-y-4 py-1">
            {/* Show created case or selected case label */}
            {!propCaseId && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/60 border border-border text-sm">
                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-medium truncate">{createdCaseName || cases.find(c => String(c.id) === caseId)?.patientName || `Case #${caseId}`}</span>
                {!creating && cases.length > 0 && !createdCaseName && (
                  <button
                    className="ml-auto text-xs text-primary hover:underline shrink-0"
                    onClick={() => setStep("select")}
                  >
                    Change
                  </button>
                )}
              </div>
            )}

            {/* Jaw type */}
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

            {/* Drop zone */}
            <div
              className="rounded-lg border-2 border-dashed border-muted-foreground/30 p-6 text-center space-y-2 cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-colors"
              onClick={() => !uploading && fileInputRef.current?.click()}
            >
              <Upload className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm font-medium">Click to select your 3D jaw model</p>
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
                disabled={!isUploadReady}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" /> Choose File (.stl, .obj, .ply)
              </Button>
            )}
          </div>
        )}
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
    qc.invalidateQueries({ queryKey: ["scan-library-picker"] });
    qc.invalidateQueries({ queryKey: ["cases-for-upload"] });
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
