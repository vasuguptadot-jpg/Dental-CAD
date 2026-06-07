import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, Brain, Layers, Cpu, CheckCircle2, ChevronRight, ChevronLeft, X } from "lucide-react";

const STORAGE_KEY = "orthovision_onboarded";

const STEPS = [
  {
    icon: Upload,
    title: "Upload a 3D Scan",
    description: "Start by creating a patient and a case, then upload their STL, OBJ, or PLY dental scan. OrthoVision supports upper jaw, lower jaw, and bite registration files.",
    hint: "Go to Patients → Create Patient → Create Case → Upload Scan",
    color: "text-blue-400",
    bg: "bg-blue-400/10",
    action: { label: "Go to Patients", href: "/patients" },
  },
  {
    icon: Brain,
    title: "Run Segmentation",
    description: "After uploading, open the scan and run AI-powered segmentation to identify individual teeth. This creates the foundation for all clinical analysis.",
    hint: "From the case page, click Segment on your scan",
    color: "text-cyan-400",
    bg: "bg-cyan-400/10",
    action: { label: "Go to Cases", href: "/cases" },
  },
  {
    icon: Layers,
    title: "Open Treatment Planner",
    description: "Use the 3D Treatment Planner to prescribe tooth movements. Select each tooth and adjust translation, rotation, torque, and tip with real-time collision detection.",
    hint: "Click Planner from the scan actions on any case",
    color: "text-violet-400",
    bg: "bg-violet-400/10",
    action: { label: "View Cases", href: "/cases" },
  },
  {
    icon: Cpu,
    title: "Generate Aligner Stages",
    description: "Once movements are prescribed, the Aligner Staging engine automatically breaks them into sequential stages — typically 0.25mm or 2° per stage — ready for manufacturing.",
    hint: "Click Staging from the scan actions to generate stages",
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
    action: { label: "Go to Dashboard", href: "/dashboard" },
  },
];

export function OnboardingWizard() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) {
      const timer = setTimeout(() => setOpen(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  };

  const handleAction = (href: string) => {
    localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
    setLocation(href);
  };

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleDismiss(); }}>
      <DialogContent className="sm:max-w-[520px] p-0 overflow-hidden">
        <div className="p-6 space-y-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-mono">
                Step {step + 1} of {STEPS.length}
              </Badge>
              <span className="text-xs text-muted-foreground">Getting Started</span>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={handleDismiss}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className={`w-14 h-14 rounded-2xl ${current.bg} flex items-center justify-center`}>
            <Icon className={`h-7 w-7 ${current.color}`} />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold">{current.title}</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">{current.description}</p>
          </div>

          <div className="bg-muted/40 border rounded-lg px-4 py-3 text-xs text-muted-foreground flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <span>{current.hint}</span>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <div className="flex-1 flex gap-1.5">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  className={`h-1.5 rounded-full transition-all ${i === step ? "bg-primary w-6" : "bg-muted w-3 hover:bg-muted-foreground/40"}`}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={() => setStep(s => s - 1)} className="gap-1">
                <ChevronLeft className="h-4 w-4" /> Back
              </Button>
            )}
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={handleDismiss} className="text-muted-foreground">
              Skip tour
            </Button>
            {isLast ? (
              <Button size="sm" onClick={() => handleAction(current.action.href)} className="gap-1">
                {current.action.label} <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button size="sm" onClick={() => setStep(s => s + 1)} className="gap-1">
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function OnboardingTrigger() {
  const [, setOpen] = useState(false);

  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-xs text-muted-foreground"
      onClick={() => {
        localStorage.removeItem(STORAGE_KEY);
        window.location.reload();
      }}
    >
      Restart tour
    </Button>
  );
}
