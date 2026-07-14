"use client";

import type { AuthResponse, PublicUser } from "@openseat/contracts";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api, apiErrorMessage, refreshSession, setAccessToken } from "@/lib/api";

type AuthContextValue = {
  user: PublicUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<PublicUser>;
  register: (input: {
    email: string;
    password: string;
    displayName: string;
  }) => Promise<PublicUser>;
  loginDemo: (role: "buyer" | "organizer") => Promise<PublicUser>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback((session: AuthResponse | null) => {
    setAccessToken(session?.accessToken ?? null);
    setUser(session?.user ?? null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void refreshSession().then((session) => {
      if (!cancelled) {
        applySession(session);
        setLoading(false);
      }
    });
    const interval = setInterval(
      () => {
        void refreshSession().then((session) => {
          if (!cancelled && session) {
            applySession(session);
          }
        });
      },
      12 * 60_000,
    );
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [applySession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { data, error, response } = await api.POST("/api/auth/login", {
        body: { email, password },
      });
      if (!response.ok || data === undefined) {
        throw new Error(apiErrorMessage(error, "Login failed"));
      }
      const session = data as unknown as AuthResponse;
      applySession(session);
      return session.user;
    },
    [applySession],
  );

  const register = useCallback(
    async (input: { email: string; password: string; displayName: string }) => {
      const { data, error, response } = await api.POST("/api/auth/register", {
        body: input,
      });
      if (!response.ok || data === undefined) {
        throw new Error(apiErrorMessage(error, "Registration failed"));
      }
      const session = data as unknown as AuthResponse;
      applySession(session);
      return session.user;
    },
    [applySession],
  );

  const loginDemo = useCallback(
    async (role: "buyer" | "organizer") => {
      const { data, error, response } = await api.POST("/api/demo/login", {
        body: { role },
      });
      if (!response.ok || data === undefined) {
        throw new Error(apiErrorMessage(error, "Demo login failed"));
      }
      const session = data as unknown as AuthResponse;
      applySession(session);
      return session.user;
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    await api.POST("/api/auth/logout");
    applySession(null);
  }, [applySession]);

  const value = useMemo(
    () => ({ user, loading, login, register, loginDemo, logout }),
    [user, loading, login, register, loginDemo, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
