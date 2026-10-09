"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toApiError, type ApiError } from "./api";

export type AsyncState<T> =
  | { status: "loading"; data?: T; error?: undefined }
  | { status: "success"; data: T; error?: undefined }
  | { status: "error"; data?: T; error: ApiError };

/** Carrega dados com estados explícitos. `reload(true)` recarrega sem voltar ao skeleton. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<AsyncState<T>>({ status: "loading" });
  const reqId = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const reload = useCallback(async (silent = false) => {
    const id = ++reqId.current;
    if (!silent) setState((s) => ({ status: "loading", data: s.data }));
    try {
      const data = await fnRef.current();
      if (id === reqId.current) setState({ status: "success", data });
      return data;
    } catch (e) {
      if (id === reqId.current) setState((s) => ({ status: "error", data: s.data, error: toApiError(e) }));
      return undefined;
    }
  }, []);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { state, setState, reload };
}
