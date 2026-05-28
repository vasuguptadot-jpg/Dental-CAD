import { useAuth } from "@/contexts/auth";
import { useLogout } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Users, 
  FileBox, 
  LogOut,
  Activity
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const { doctor } = useAuth();
  const [location] = useLocation();
  const logout = useLogout();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        window.location.href = "/login";
      }
    });
  };

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/patients", label: "Patients", icon: Users },
    { href: "/cases", label: "Cases", icon: FileBox },
  ];

  return (
    <div className="flex h-screen w-64 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 shrink-0 items-center px-6 border-b border-sidebar-border">
        <Activity className="h-6 w-6 text-sidebar-primary mr-2" />
        <span className="text-lg font-semibold tracking-tight">OrthoDesk</span>
      </div>
      
      <div className="flex-1 overflow-auto py-6">
        <nav className="space-y-1 px-4">
          {navItems.map((item) => {
            const isActive = location.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className="block">
                <Button
                  variant={isActive ? "secondary" : "ghost"}
                  className={cn(
                    "w-full justify-start gap-3 px-3",
                    isActive ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </Button>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground font-semibold">
            {doctor?.name?.charAt(0) || "D"}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium leading-none">{doctor?.name}</span>
            <span className="text-xs text-sidebar-foreground/70">{doctor?.role}</span>
          </div>
        </div>
        <Button 
          variant="ghost" 
          className="w-full justify-start gap-3 px-3 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={handleLogout}
        >
          <LogOut className="h-5 w-5" />
          Logout
        </Button>
      </div>
    </div>
  );
}
