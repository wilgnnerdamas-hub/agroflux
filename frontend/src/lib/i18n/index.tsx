"use client";

// Idioma da interface (PT padrão, EN opcional). A escolha fica no navegador; a API continua respondendo em português,
// e no inglês as mensagens de erro e os rótulos são traduzidos pelo código (decisão D18 do contrato v1.2).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { setFormatLocale } from "../format";
import { en } from "./en";
import { pt, type Dict } from "./pt";

export type Locale = "pt" | "en";
const DICTS: Record<Locale, Dict> = { pt, en };
const STORAGE_KEY = "agroflux.locale";

interface I18n {
  locale: Locale;
  t: Dict;
  setLocale: (l: Locale) => void;
  /** Mensagem de erro no idioma atual: em inglês, traduz pelo código; em português, usa a do backend. */
  errorMessage: (e: { code: string; message: string }) => string;
}

const Ctx = createContext<I18n | null>(null);

function readStored(): Locale | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "en" || v === "pt" ? v : null;
  } catch {
    return null;
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("pt");
  // Ajusta a formatação antes de os filhos renderizarem.
  setFormatLocale(DICTS[locale].locale);

  useEffect(() => {
    const stored = readStored();
    if (stored && stored !== "pt") setLocaleState(stored);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === "en" ? "en" : "pt-BR";
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* armazenamento indisponível: vale só nesta visita */
    }
  }, []);

  const value = useMemo<I18n>(() => {
    const t = DICTS[locale];
    return {
      locale,
      t,
      setLocale,
      errorMessage: (e) => (locale === "en" ? (t.errors[e.code] ?? e.message) : e.message),
    };
  }, [locale, setLocale]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useI18n fora do I18nProvider");
  return ctx;
}
