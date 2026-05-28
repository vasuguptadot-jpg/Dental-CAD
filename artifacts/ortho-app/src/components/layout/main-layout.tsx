import { ReactNode } from "react";
import { Sidebar } from "./sidebar";

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="h-full container mx-auto py-8 px-8 max-w-7xl">
          {children}
        </div>
      </main>
    </div>
  );
}
