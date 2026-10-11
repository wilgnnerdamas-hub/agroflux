// Distribuidoras demo, SIMULADAS (contrato v1.3, §15.4). Cada uma com carteira de demonstração própria.
import type { Distributor, DistributorId } from "./types.js";

export const DISTRIBUTOR_DEFS: { id: DistributorId; name: string }[] = [
  { id: "dst_a", name: "Distribuidora Demo" },
  { id: "dst_b", name: "Cerrado Insumos (demo)" },
  { id: "dst_c", name: "Sul Sementes (demo)" },
];

export const isDistributorId = (id: unknown): id is DistributorId => typeof id === "string" && DISTRIBUTOR_DEFS.some((d) => d.id === id);
export const distributorName = (id: DistributorId) => DISTRIBUTOR_DEFS.find((d) => d.id === id)!.name;

export type DistributorWallets = Record<DistributorId, string>;

export const listDistributors = (wallets: DistributorWallets | null): Distributor[] =>
  DISTRIBUTOR_DEFS.map((d) => ({ ...d, wallet: wallets?.[d.id] ?? null, isSimulated: true }));
