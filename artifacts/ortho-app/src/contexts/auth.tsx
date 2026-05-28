import { createContext, useContext, ReactNode } from "react";
import { useGetMe, getGetMeQueryKey, Doctor } from "@workspace/api-client-react";

interface AuthContextType {
  doctor: Doctor | null | undefined;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: doctor, isLoading, error } = useGetMe({
    query: {
      retry: false,
      refetchOnWindowFocus: false,
      queryKey: getGetMeQueryKey(),
    },
  });

  const isAuthenticated = !!doctor && !error;

  return (
    <AuthContext.Provider value={{ doctor, isLoading, isAuthenticated }}>
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
