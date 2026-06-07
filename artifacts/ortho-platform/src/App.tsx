import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/components/theme-provider";
import NotFound from "@/pages/not-found";

import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import PatientsList from "@/pages/patients/index";
import PatientDetail from "@/pages/patients/detail";
import CasesList from "@/pages/cases/index";
import CaseDetail from "@/pages/cases/detail";
import ScanViewer from "@/pages/scan-viewer";

const queryClient = new QueryClient();

// Protected Route Wrapper
function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return null; // Or a full screen spinner
  }

  if (!user) {
    setLocation("/login");
    return null;
  }

  return <Component />;
}

// Redirect if already logged in
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
      
      {/* Protected Routes */}
      <Route path="/dashboard"><ProtectedRoute component={Dashboard} /></Route>
      <Route path="/patients"><ProtectedRoute component={PatientsList} /></Route>
      <Route path="/patients/:patientId"><ProtectedRoute component={PatientDetail} /></Route>
      <Route path="/cases"><ProtectedRoute component={CasesList} /></Route>
      <Route path="/cases/:caseId"><ProtectedRoute component={CaseDetail} /></Route>
      <Route path="/scan-viewer/:scanId"><ProtectedRoute component={ScanViewer} /></Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="orthovision-theme">
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthProvider>
              <Router />
            </AuthProvider>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
