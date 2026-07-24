"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { isForbiddenError, isNotFoundError } from "@/lib/api/graphql";

export type ConsoleGateState =
  | "loading"
  | "ready"
  | "forbidden"
  | "missing"
  | "error";

export type ConsoleGate<T> = {
  state: ConsoleGateState;
  data: T | null;
  reload: () => void;
};

export function useConsoleGate<T>(
  next: string,
  load: () => Promise<T>,
  onForbidden?: () => Promise<boolean>,
): ConsoleGate<T> {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<ConsoleGateState>("loading");
  const [data, setData] = useState<T | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => {
    setState("loading");
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (loading) {
      return;
    }
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await load();
        if (cancelled) {
          return;
        }
        setData(loaded);
        setState("ready");
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (isForbiddenError(error)) {
          if (onForbidden && (await onForbidden())) {
            return;
          }
          if (!cancelled) {
            setState("forbidden");
          }
          return;
        }
        setState(isNotFoundError(error) ? "missing" : "error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loading, router, next, load, onForbidden, reloadKey]);

  return { state, data, reload };
}
