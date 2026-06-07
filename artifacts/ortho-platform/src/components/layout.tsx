import React from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useLogout } from "@workspace/api-client-react";
import {
  Activity, LayoutDashboard, Users, UserSquare2, LogOut, Loader2,
  Moon, Sun, Brain, Bot, Layers, Cpu, Printer, BarChart3,
  Scale, Scissors, TrendingUp, GitCompare, Camera, Keyboard, HelpCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { GlobalSearch } from "@/components/global-search";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [location, setLocation] = useLocation();
  const logout = useLogout();
  const { theme, setTheme } = useTheme();

  if (isAuthLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    setLocation("/login");
    return null;
  }

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        setLocation("/login");
        window.location.reload();
      }
    });
  };

  const navItems = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Patients", href: "/patients", icon: Users },
    { label: "Cases", href: "/cases", icon: Activity },
    { label: "Analytics", href: "/analytics", icon: BarChart3 },
  ];

  const aiNavItems = [
    { label: "Ortho Analysis", href: "/ortho-analysis", icon: Brain },
    { label: "AI Copilot", href: "/ai-copilot", icon: Bot },
    { label: "Treatment Planner", href: "/treatment-planner", icon: Layers },
    { label: "Aligner Staging", href: "/aligner-staging", icon: Cpu },
    { label: "Manufacturing", href: "/manufacturing", icon: Printer },
  ];

  const clinicalTools = [
    { label: "Bolton Analysis", href: "/bolton-analysis", icon: Scale },
    { label: "IPR Calculator", href: "/ipr-calculator", icon: Scissors },
    { label: "Progress Tracker", href: "/progress-tracker", icon: TrendingUp },
    { label: "Plan Comparison", href: "/plan-comparison", icon: GitCompare },
  ];

  const isActive = (href: string) => location.startsWith(href);

  return (
    <div className="flex min-h-screen w-full flex-col md:flex-row bg-background">
      <aside className="w-full md:w-64 border-r bg-card flex flex-col">
        <div className="p-4 flex items-center justify-between md:justify-center border-b">
          <div className="flex items-center gap-2 font-bold text-xl text-primary">
            <Activity className="h-6 w-6" />
            <span>OrthoVision</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b">
          <GlobalSearch />
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Clinic
          </div>
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <Button
                variant={isActive(item.href) ? "secondary" : "ghost"}
                className="w-full justify-start gap-2"
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Button>
            </Link>
          ))}

          <div className="px-2 py-1.5 mt-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <Brain className="h-3 w-3 text-primary" /> AI Engine
          </div>
          {aiNavItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <Button
                variant={isActive(item.href) ? "secondary" : "ghost"}
                className={`w-full justify-start gap-2 ${isActive(item.href) ? "" : "text-muted-foreground hover:text-foreground"}`}
              >
                <item.icon className="h-4 w-4 text-primary" />
                {item.label}
                {item.href === "/ai-copilot" && (
                  <span className="ml-auto text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-bold">AI</span>
                )}
              </Button>
            </Link>
          ))}

          <div className="px-2 py-1.5 mt-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <Scissors className="h-3 w-3 text-cyan-400" /> Clinical Tools
          </div>
          {clinicalTools.map((item) => (
            <Link key={item.href} href={item.href}>
              <Button
                variant={isActive(item.href) ? "secondary" : "ghost"}
                className={`w-full justify-start gap-2 ${isActive(item.href) ? "" : "text-muted-foreground hover:text-foreground"}`}
              >
                <item.icon className="h-4 w-4 text-cyan-400" />
                {item.label}
              </Button>
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t space-y-1">
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 hidden md:flex text-muted-foreground"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            Toggle Theme
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 text-muted-foreground"
                onClick={() => {
                  localStorage.removeItem("orthovision_onboarded");
                  window.location.reload();
                }}
              >
                <HelpCircle className="h-4 w-4" />
                Getting Started
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Restart onboarding tour</TooltipContent>
          </Tooltip>
          <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
            <UserSquare2 className="h-4 w-4" />
            <span className="truncate">{user.name}</span>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleLogout}
            disabled={logout.isPending}
          >
            {logout.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            Logout
          </Button>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-6 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
