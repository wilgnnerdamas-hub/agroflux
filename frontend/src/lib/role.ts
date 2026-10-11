"use client";

// Perfil escolhido na entrada (sem login, decisão D18). Serve só para a navegação; a API não tem autenticação.
// v1.3: perfil "admin" (operação AgroFlux) e a distribuidora demo operada (dst_a, dst_b ou dst_c).
import { useCallback, useEffect, useState } from "react";
import type { DistributorId } from "./types";

export type Role = "distributor" | "funder" | "admin";
const KEY = "agroflux.role";
const DIST_KEY = "agroflux.distributor";
const EVENT = "agroflux-role";

export const DISTRIBUTORS: { id: DistributorId; name: string }[] = [
  { id: "dst_a", name: "Distribuidora Demo" },
  { id: "dst_b", name: "Cerrado Insumos (demo)" },
  { id: "dst_c", name: "Sul Sementes (demo)" },
];

export function roleFromPath(pathname: string): Role | null {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/financiador")) return "funder";
  if (pathname.startsWith("/distribuidor") || pathname.startsWith("/recebiveis")) return "distributor";
  return null;
}

function read<T extends string>(key: string, allowed: readonly T[]): T | null {
  try {
    const v = window.localStorage.getItem(key);
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* armazenamento indisponível */
  }
}

export function useRole() {
  const [role, setRoleState] = useState<Role | null>(null);
  const [distributorId, setDistributorState] = useState<DistributorId>("dst_a");
  useEffect(() => {
    const sync = () => {
      setRoleState(read<Role>(KEY, ["distributor", "funder", "admin"]));
      setDistributorState(read<DistributorId>(DIST_KEY, ["dst_a", "dst_b", "dst_c"]) ?? "dst_a");
    };
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  const setRole = useCallback((r: Role, dist?: DistributorId) => {
    write(KEY, r);
    if (dist) write(DIST_KEY, dist);
    setRoleState(r);
    if (dist) setDistributorState(dist);
    window.dispatchEvent(new Event(EVENT));
  }, []);
  const distributorName = DISTRIBUTORS.find((d) => d.id === distributorId)!.name;
  return { role, setRole, distributorId, distributorName };
}
