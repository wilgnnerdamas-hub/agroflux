"use client";

// Perfil escolhido na entrada (sem login, decisão D18). Serve só para a navegação; a API não tem autenticação.
// v1.3: perfil "admin" (operação AgroFlux) e a distribuidora demo operada (dst_a, dst_b ou dst_c).
// v1.3.1: o financiador demo operado também é escolhido na entrada (fnd_a, fnd_b ou fnd_c).
import { useCallback, useEffect, useState } from "react";
import type { DistributorId, FunderId } from "./types";

export type Role = "distributor" | "funder" | "admin";
const KEY = "agroflux.role";
const DIST_KEY = "agroflux.distributor";
const FUNDER_KEY = "agroflux.funder";
const EVENT = "agroflux-role";

export const DISTRIBUTORS: { id: DistributorId; name: string }[] = [
  { id: "dst_a", name: "Distribuidora Demo" },
  { id: "dst_b", name: "Cerrado Insumos (demo)" },
  { id: "dst_c", name: "Sul Sementes (demo)" },
];

export const FUNDERS: { id: FunderId; name: string }[] = [
  { id: "fnd_a", name: "Financiador Demo A" },
  { id: "fnd_b", name: "Financiador Demo B" },
  { id: "fnd_c", name: "Financiador Demo C" },
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
  const [funderId, setFunderState] = useState<FunderId>("fnd_a");
  useEffect(() => {
    const sync = () => {
      setRoleState(read<Role>(KEY, ["distributor", "funder", "admin"]));
      setDistributorState(read<DistributorId>(DIST_KEY, ["dst_a", "dst_b", "dst_c"]) ?? "dst_a");
      setFunderState(read<FunderId>(FUNDER_KEY, ["fnd_a", "fnd_b", "fnd_c"]) ?? "fnd_a");
    };
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  // O segundo argumento é a distribuidora (perfil "distributor") ou o financiador (perfil "funder") operado.
  const setRole = useCallback((r: Role, who?: DistributorId | FunderId) => {
    write(KEY, r);
    setRoleState(r);
    if (r === "distributor" && who?.startsWith("dst_")) {
      write(DIST_KEY, who);
      setDistributorState(who as DistributorId);
    }
    if (r === "funder" && who?.startsWith("fnd_")) {
      write(FUNDER_KEY, who);
      setFunderState(who as FunderId);
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  const distributorName = DISTRIBUTORS.find((d) => d.id === distributorId)!.name;
  const funderName = FUNDERS.find((f) => f.id === funderId)!.name;
  return { role, setRole, distributorId, distributorName, funderId, funderName };
}
