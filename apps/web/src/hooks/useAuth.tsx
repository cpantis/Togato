"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { AuthUser, Organization } from "@togato/shared";
import { ApiError, api, clearToken, getToken, setToken } from "@/lib/api";

interface AuthState {
  user: AuthUser | null;
  organization: Organization | null;
  loading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  signup: (data: { name: string; email: string; password: string; cabinetName: string }) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth trebuie folosit în AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, organization: null, loading: true, error: null });

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setState({ user: null, organization: null, loading: false, error: null });
      return;
    }
    try {
      const data = await api<{ user: AuthUser; organization: Organization }>("/api/auth/me");
      setState({ user: data.user, organization: data.organization, loading: false, error: null });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        clearToken();
        setState({ user: null, organization: null, loading: false, error: null });
      } else {
        // Serverul nu răspunde: păstrăm sesiunea și arătăm eroarea
        setState({ user: null, organization: null, loading: false, error: (e as Error).message });
      }
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api<{ token: string; user: AuthUser; organization: Organization }>("/api/auth/login", {
      method: "POST", body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    setState({ user: data.user, organization: data.organization, loading: false, error: null });
  }, []);

  const signup = useCallback(async (payload: { name: string; email: string; password: string; cabinetName: string }) => {
    const data = await api<{ token: string; user: AuthUser; organization: Organization }>("/api/auth/signup", {
      method: "POST", body: JSON.stringify(payload),
    });
    setToken(data.token);
    setState({ user: data.user, organization: data.organization, loading: false, error: null });
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setState({ user: null, organization: null, loading: false, error: null });
  }, []);

  return <AuthContext.Provider value={{ ...state, login, signup, logout, refresh }}>{children}</AuthContext.Provider>;
}
