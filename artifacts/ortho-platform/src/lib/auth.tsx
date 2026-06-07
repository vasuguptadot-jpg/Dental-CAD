import React, { createContext, useContext, useEffect, useState } from "react";
import { Doctor } from "@workspace/api-client-react";
import { useGetMe } from "@workspace/api-client-react";
import { useLocation } from "wouter";

interface AuthContextType {
  user: Doctor | null;
  isLoading: boolean;
  setUser: (user: Doctor | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Doctor | null>(null);
  const [, setLocation] = useLocation();

  const { data, isLoading, error } = useGetMe({
    query: {
      retry: false,
    },
  });

  useEffect(() => {
    if (data && !error) {
      setUser(data);
    } else if (error) {
      setUser(null);
    }
  }, [data, error]);

  return (
    <AuthContext.Provider value={{ user, isLoading, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
