import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/components/theme-provider";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import NotFound from "@/pages/not-found";

import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import PatientsList from "@/pages/patients/index";
import PatientDetail from "@/pages/patients/detail";
import CasesList from "@/pages/cases/index";
import CaseDetail from "@/pages/cases/detail";
import ScanViewer from "@/pages/scan-viewer";
import SegmentationViewer from "@/pages/segmentation";
import OrthoAnalysis from "@/pages/ortho-analysis";
import AICopilot from "@/pages/ai-copilot";
import TreatmentPlanner from "@/pages/treatment-planner";
import AlignerStaging from "@/pages/aligner-staging";
import Manufacturing from "@/pages/manufacturing";
import Analytics from "@/pages/analytics";
import BoltonAnalysis from "@/pages/bolton-analysis";
import IPRCalculator from "@/pages/ipr-calculator";
import ProgressTracker from "@/pages/progress-tracker";
import PlanComparison from "@/pages/plan-comparison";
import AttachmentAdvisor from "@/pages/attachment-advisor";
import PracticeAnalytics from "@/pages/practice-analytics";

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) return null;

  if (!user) {
    setLocation("/login");
    return null;
  }

  return <Component />;
}

function LoginRoute() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) return null;

  if (user) {
    setLocation("/dashboard");
    return null;
  }

  return <Login />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LoginRoute} />
      <Route path="/login" component={LoginRoute} />

      <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
      <Route path="/patients"><ProtectedRoute component={PatientsList} /></Route>
      <Route path="/patients/:patientId"><ProtectedRoute component={PatientDetail} /></Route>
      <Route path="/cases"><ProtectedRoute component={CasesList} /></Route>
      <Route path="/cases/:caseId"><ProtectedRoute component={CaseDetail} /></Route>
      <Route path="/scan-viewer/:scanId"><ProtectedRoute component={ScanViewer} /></Route>
      <Route path="/segmentation/:scanId"><ProtectedRoute component={SegmentationViewer} /></Route>
      <Route path="/ortho-analysis/:scanId"><ProtectedRoute component={OrthoAnalysis} /></Route>
      <Route path="/ortho-analysis"><ProtectedRoute component={OrthoAnalysis} /></Route>
      <Route path="/ai-copilot/:scanId"><ProtectedRoute component={AICopilot} /></Route>
      <Route path="/ai-copilot"><ProtectedRoute component={AICopilot} /></Route>
      <Route path="/treatment-planner/:scanId"><ProtectedRoute component={TreatmentPlanner} /></Route>
      <Route path="/aligner-staging/:scanId"><ProtectedRoute component={AlignerStaging} /></Route>
      <Route path="/manufacturing/:scanId"><ProtectedRoute component={Manufacturing} /></Route>
      <Route path="/analytics"><ProtectedRoute component={Analytics} /></Route>

      {/* Clinical Tools */}
      <Route path="/bolton-analysis"><ProtectedRoute component={BoltonAnalysis} /></Route>
      <Route path="/ipr-calculator"><ProtectedRoute component={IPRCalculator} /></Route>
      <Route path="/progress-tracker"><ProtectedRoute component={ProgressTracker} /></Route>
      <Route path="/progress/:caseId"><ProtectedRoute component={ProgressTracker} /></Route>
      <Route path="/plan-comparison"><ProtectedRoute component={PlanComparison} /></Route>
      <Route path="/plan-comparison/:caseId"><ProtectedRoute component={PlanComparison} /></Route>
      <Route path="/attachment-advisor"><ProtectedRoute component={AttachmentAdvisor} /></Route>
      <Route path="/practice-analytics"><ProtectedRoute component={PracticeAnalytics} /></Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function AppInner() {
  const { user } = useAuth();
  return (
    <>
      <Router />
      {user && <OnboardingWizard />}
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="orthovision-theme">
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthProvider>
              <AppInner />
            </AuthProvider>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
