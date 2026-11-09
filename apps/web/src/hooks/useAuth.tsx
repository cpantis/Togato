"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { AuthUser, Organization } from "@togato/shared";
import { ApiError, api, clearLegacyToken } from "@/lib/api";

interface AuthState {
  user: AuthUser | null;
  organization: Organization | null;
  loading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  /** întoarce `{ mfaToken }` dacă e nevoie de pasul al doilea */
  login: (email: string, password: string) => Promise<{ mfaToken: string } | null>;
  completeMfa: (mfaToken: string, code: string) => Promise<{ recoveryCodesLeft?: number }>;
  signup: (data: { name: string; email: string; password: string; cabinetName: string; acceptTerms: boolean; legalVersion: string; captchaToken?: string }) => Promise<void>;
  logout: () => Promise<void>;
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
    clearLegacyToken();
    try {
      const data = await api<{ user: AuthUser | null; organization: Organization | null }>("/api/auth/me");
      setState({ user: data.user, organization: data.organization, loading: false, error: null });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setState({ user: null, organization: null, loading: false, error: null });
      } else {
        // Serverul nu răspunde: păstrăm sesiunea și arătăm eroarea
        setState({ user: null, organization: null, loading: false, error: (e as Error).message });
      }
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api<{ token?: string; user?: AuthUser; organization?: Organization; mfaRequired?: boolean; mfaToken?: string }>("/api/auth/login", {
      method: "POST", body: JSON.stringify({ email, password }),
    });
    if (data.mfaRequired && data.mfaToken) return { mfaToken: data.mfaToken };
    setState({ user: data.user!, organization: data.organization ?? null, loading: false, error: null });
    return null;
  }, []);

  const completeMfa = useCallback(async (mfaToken: string, code: string) => {
    const data = await api<{ token: string; user: AuthUser; organization: Organization; recoveryCodesLeft?: number }>("/api/auth/login/mfa", {
      method: "POST", body: JSON.stringify({ mfaToken, code }),
    });
    setState({ user: data.user, organization: data.organization, loading: false, error: null });
    return { recoveryCodesLeft: data.recoveryCodesLeft };
  }, []);

  const signup = useCallback(async (payload: { name: string; email: string; password: string; cabinetName: string; acceptTerms: boolean; legalVersion: string; captchaToken?: string }) => {
    const data = await api<{ token: string; user: AuthUser; organization: Organization }>("/api/auth/signup", {
      method: "POST", body: JSON.stringify(payload),
    });
    setState({ user: data.user, organization: data.organization, loading: false, error: null });
  }, []);

  const logout = useCallback(async () => {
    // închide sesiunea pe server (cookie-ul httpOnly nu poate fi șters din JavaScript)
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setState({ user: null, organization: null, loading: false, error: null });
  }, []);

  return <AuthContext.Provider value={{ ...state, login, completeMfa, signup, logout, refresh }}>{children}</AuthContext.Provider>;
}
