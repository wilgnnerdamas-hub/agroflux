// Financiadores demo, SIMULADOS (§3.13 do contrato v1.2). A é operado pela tela do financiador; B e C propõem sozinhos.
import type { Funder, FunderId, FunderMode, FunderType } from "./types.js";

export interface FunderDef {
  id: FunderId;
  name: string;
  type: FunderType;
  mode: FunderMode;
  // Faixas das propostas automáticas: taxa (bps a.m.) e tarifas (centavos).
  bps: [number, number];
  fees: [number, number];
}

export const FUNDER_DEFS: FunderDef[] = [
  { id: "fnd_a", name: "Financiador Demo A", type: "simulated_fidc", mode: "interactive", bps: [120, 160], fees: [10_000, 20_000] },
  { id: "fnd_b", name: "Financiador Demo B", type: "simulated_bank", mode: "automatic", bps: [160, 200], fees: [5_000, 12_000] },
  { id: "fnd_c", name: "Financiador Demo C", type: "simulated_cooperative", mode: "automatic", bps: [200, 250], fees: [15_000, 30_000] },
];

export const FUNDER_IDS = FUNDER_DEFS.map((f) => f.id);
export const isFunderId = (id: unknown): id is FunderId => typeof id === "string" && (FUNDER_IDS as string[]).includes(id);
export const funderDef = (id: FunderId) => FUNDER_DEFS.find((f) => f.id === id)!;

export type FunderWallets = Record<FunderId, string>;

export function toFunder(def: FunderDef, wallets: FunderWallets | null): Funder {
  return { id: def.id, name: def.name, type: def.type, mode: def.mode, wallet: wallets?.[def.id] ?? null, isSimulated: true };
}

export const listFunders = (wallets: FunderWallets | null): Funder[] => FUNDER_DEFS.map((d) => toFunder(d, wallets));
