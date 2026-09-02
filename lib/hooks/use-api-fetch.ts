"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { ApiError, fetchJson } from "@/lib/fetch-utils";

export type ApiFetch = <T = unknown>(url: string, init?: RequestInit) => Promise<T>;

/**
 * fetchJson bound to the component lifecycle: in-flight requests are aborted
 * on unmount, and a 401 redirects to /sign-in (the session has expired).
 *
 * Both cases still reject, so wrap calls in try/catch and bail out with
 * isHandledFetchError(e) before surfacing the error to the user.
 */
export function useApiFetch(): ApiFetch {
  const router = useRouter();
  const lifecycleRef = useRef<AbortController | null>(null);
  const activeRef = useRef<Set<AbortController>>(new Set());

  useEffect(() => {
    const controller = new AbortController();
    lifecycleRef.current = controller;
    const active = activeRef.current;
    return () => {
      controller.abort();
      for (const c of active) c.abort();
      active.clear();
    };
  }, []);

  return useCallback(
    async <T>(url: string, init?: RequestInit): Promise<T> => {
      const requestController = new AbortController();
      activeRef.current.add(requestController);

      // Wire lifecycle abort -> request abort
      const onLifecycleAbort = () => requestController.abort();
      lifecycleRef.current?.signal.addEventListener("abort", onLifecycleAbort);

      // Wire caller-provided signal -> request abort
      const callerSignal = init?.signal as AbortSignal | undefined;
      const onCallerAbort = () => requestController.abort();
      if (callerSignal) callerSignal.addEventListener("abort", onCallerAbort);

      // Build final signal that aborts if either lifecycle or caller aborts
      const composedSignal =
        typeof AbortSignal !== "undefined" && "any" in AbortSignal
          ? (AbortSignal as unknown as { any: (s: AbortSignal[]) => AbortSignal }).any(
              [requestController.signal, lifecycleRef.current?.signal, callerSignal].filter(
                Boolean,
              ) as AbortSignal[],
            )
          : requestController.signal;

      try {
        return await fetchJson<T>(url, {
          ...init,
          signal: composedSignal,
        });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          router.replace("/sign-in");
        }
        throw error;
      } finally {
        lifecycleRef.current?.signal.removeEventListener("abort", onLifecycleAbort);
        if (callerSignal) callerSignal.removeEventListener("abort", onCallerAbort);
        activeRef.current.delete(requestController);
      }
    },
    [router],
  );
}
