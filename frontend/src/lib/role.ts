"use client";

// Perfil escolhido na entrada (sem login, decisão D18). Serve só para a navegação; a API não tem autenticação.
import { useCallback, useEffect, useState } from "react";

export type Role = "distributor" | "funder";
const KEY = "agroflux.role";

export function roleFromPath(pathname: string): Role | null {
  if (pathname.startsWith("/financiador")) return "funder";
  if (pathname.startsWith("/distribuidor") || pathname.startsWith("/recebiveis")) return "distributor";
  return null;
}

export function useRole() {
  const [stored, setStored] = useState<Role | null>(null);
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(KEY);
      if (v === "distributor" || v === "funder") setStored(v);
    } catch {
      /* armazenamento indisponível */
    }
  }, []);
  const setRole = useCallback((r: Role) => {
    setStored(r);
    try {
      window.localStorage.setItem(KEY, r);
    } catch {
      /* armazenamento indisponível */
    }
  }, []);
  return { role: stored, setRole };
}
