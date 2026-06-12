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
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    return () => controller.abort();
  }, []);

  return useCallback(
    async <T,>(url: string, init?: RequestInit): Promise<T> => {
      try {
        return await fetchJson<T>(url, {
          ...init,
          signal: init?.signal ?? controllerRef.current?.signal ?? null,
        });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          router.replace("/sign-in");
        }
        throw error;
      }
    },
    [router],
  );
}
