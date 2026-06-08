import React, { createContext, useContext } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Doctor,
  getGetMeQueryKey,
  useGetMe,
  useLogin,
  useLogout,
} from "@workspace/api-client-react";

interface AuthContextType {
  doctor: Doctor | null;
  isLoading: boolean;
  loginError: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  doctor: null,
  isLoading: true,
  loginError: null,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  const { data: me, isLoading: meLoading } = useGetMe({
    query: {
      retry: false,
      throwOnError: false,
    },
  });

  const loginMutation = useLogin();
  const logoutMutation = useLogout();

  const doctor = me ?? null;
  const isLoading = meLoading;
  const loginError = loginMutation.error
    ? (loginMutation.error as Error).message ?? "Invalid credentials"
    : null;

  const login = async (email: string, password: string) => {
    loginMutation.reset();
    const result = await loginMutation.mutateAsync({
      data: { email, password },
    });
    queryClient.setQueryData(getGetMeQueryKey(), result.doctor);
  };

  const logout = async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch {}
    queryClient.removeQueries({ queryKey: getGetMeQueryKey() });
    queryClient.clear();
  };

  return (
    <AuthContext.Provider value={{ doctor, isLoading, loginError, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
