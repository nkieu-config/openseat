import createClient, { type Middleware } from "openapi-fetch";
import type { AuthResponse, paths } from "@openseat/contracts";

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

const isServer = typeof window === "undefined";

export const apiBaseUrl = isServer
  ? (process.env.API_PROXY_TARGET ?? "http://localhost:4000")
  : "";

const authMiddleware: Middleware = {
  onRequest({ request }) {
    if (accessToken) {
      request.headers.set("Authorization", `Bearer ${accessToken}`);
    }
    return request;
  },
  async onResponse({ request, response }) {
    if (
      isServer ||
      response.status !== 401 ||
      request.method !== "GET" ||
      new URL(request.url).pathname.startsWith("/api/auth/")
    ) {
      return response;
    }
    const session = await refreshSession();
    if (!session) {
      return response;
    }
    return fetch(request.url, {
      method: "GET",
      headers: { Authorization: `Bearer ${session.accessToken}` },
      credentials: "include",
    });
  },
};

export const api = createClient<paths>({
  baseUrl: apiBaseUrl,
  credentials: "include",
});
api.use(authMiddleware);

let refreshInFlight: Promise<AuthResponse | null> | null = null;

export function refreshSession(): Promise<AuthResponse | null> {
  refreshInFlight ??= fetch("/api/auth/refresh", {
    method: "POST",
    credentials: "include",
  })
    .then(async (res) => {
      if (!res.ok) {
        setAccessToken(null);
        return null;
      }
      const session = (await res.json()) as AuthResponse;
      setAccessToken(session.accessToken);
      return session;
    })
    .catch(() => null)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

export function apiErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message: string | string[] }).message;
    return Array.isArray(message) ? (message[0] ?? fallback) : message;
  }
  return fallback;
}
