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
  loginWithGoogle: (credential: string) => Promise<PublicUser>;
  register: (input: {
    email: string;
    password: string;
    displayName: string;
  }) => Promise<PublicUser>;
  loginDemo: (role: "buyer" | "organizer" | "staff") => Promise<PublicUser>;
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

  const postSession = useCallback(
    async (
      request: Promise<{
        data?: AuthResponse;
        error?: unknown;
        response: Response;
      }>,
      fallbackMessage: string,
    ) => {
      const { data, error, response } = await request;
      if (!response.ok || data === undefined) {
        throw new Error(apiErrorMessage(error, fallbackMessage));
      }
      const session = data;
      applySession(session);
      return session.user;
    },
    [applySession],
  );

  const login = useCallback(
    (email: string, password: string) =>
      postSession(
        api.POST("/api/auth/login", { body: { email, password } }),
        "Login failed",
      ),
    [postSession],
  );

  const loginWithGoogle = useCallback(
    (credential: string) =>
      postSession(
        api.POST("/api/auth/google", { body: { credential } }),
        "Google sign-in failed",
      ),
    [postSession],
  );

  const register = useCallback(
    (input: { email: string; password: string; displayName: string }) =>
      postSession(
        api.POST("/api/auth/register", { body: input }),
        "Registration failed",
      ),
    [postSession],
  );

  const loginDemo = useCallback(
    (role: "buyer" | "organizer" | "staff") =>
      postSession(
        api.POST("/api/demo/login", { body: { role } }),
        "Demo login failed",
      ),
    [postSession],
  );

  const logout = useCallback(async () => {
    await api.POST("/api/auth/logout");
    applySession(null);
  }, [applySession]);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      loginWithGoogle,
      register,
      loginDemo,
      logout,
    }),
    [user, loading, login, loginWithGoogle, register, loginDemo, logout],
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
