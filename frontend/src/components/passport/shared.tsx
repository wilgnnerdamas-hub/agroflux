"use client";

import { useState } from "react";
import { toApiError, type ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { newIdempotencyKey } from "@/lib/idempotency";
import type { Receivable } from "@/lib/types";

/**
 * Ação que muda o recebível, com Idempotency-Key reaproveitada enquanto a tentativa não termina
 * (um clique duplo não cria duas transações). Em falha de rede a chave é mantida para a nova tentativa.
 */
export function useReceivableAction(
  fn: (key: string) => Promise<Receivable>,
  onUpdated: (r: Receivable) => void,
  onError?: (e: ApiError) => void,
) {
  const { errorMessage } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);

  async function run() {
    setError(null);
    setBusy(true);
    const k = key ?? newIdempotencyKey();
    setKey(k);
    try {
      onUpdated(await fn(k));
      setKey(null);
    } catch (e) {
      const ae = toApiError(e);
      setError(errorMessage(ae));
      if (ae.code !== "NETWORK_ERROR") setKey(null);
      onError?.(ae);
    } finally {
      setBusy(false);
    }
  }

  return { run, busy, error };
}

export type StepProps = { receivable: Receivable; onUpdated: (r: Receivable) => void };
