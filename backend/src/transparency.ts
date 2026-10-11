// GET /transparency (§5.23 do contrato v1.2): só endereços públicos, saldos lidos na hora e números da demo.
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { explorerAddressUrl } from "./assignment.js";
import type { AssignmentGateway } from "./chain/assignment.js";
import { MEMO_PROGRAM_ID } from "./chain/payload.js";
import type { ChainGateway } from "./chain/solana.js";
import { DISTRIBUTOR_DEFS } from "./distributors.js";
import { FUNDER_DEFS } from "./funders.js";
import { REGISTRAR_NAME } from "./receivables.js";
import type { Store } from "./store.js";
import type { Transparency, TransparencyWallet } from "./types.js";

export async function transparency(store: Store, chain: ChainGateway, gateway: AssignmentGateway | null): Promise<Transparency> {
  const all = store.all();
  const programs: Transparency["programs"] = [{ role: "memo", label: "SPL Memo", address: MEMO_PROGRAM_ID, explorerUrl: explorerAddressUrl(MEMO_PROGRAM_ID) }];
  const wallets: TransparencyWallet[] = [];

  const health = await chain.health();
  if (chain.feePayerAddress) {
    wallets.push({
      role: "fee_payer",
      label: "Carteira pagadora (taxas da demo)",
      address: chain.feePayerAddress,
      explorerUrl: explorerAddressUrl(chain.feePayerAddress),
      solLamports: health.feePayerBalanceLamports,
      settlementUnits: null,
    });
  }

  let settlementAsset: Transparency["settlementAsset"] = null;
  if (gateway) {
    const p = gateway.parties;
    const t22 = TOKEN_2022_PROGRAM_ID.toBase58();
    programs.push(
      { role: "escrow", label: "Escrow AgroFlux (Anchor)", address: p.escrowProgramId, explorerUrl: explorerAddressUrl(p.escrowProgramId) },
      { role: "token_2022", label: "Token-2022 (token da cessão)", address: t22, explorerUrl: explorerAddressUrl(t22) },
    );
    settlementAsset = { symbol: "tBRL-DEMO", mint: p.settlementMint, decimals: 2, explorerUrl: explorerAddressUrl(p.settlementMint) };
    const parties: Omit<TransparencyWallet, "solLamports" | "settlementUnits" | "explorerUrl">[] = [
      { role: "treasury", label: "Tesouraria AgroFlux (taxas)", address: p.treasuryWallet },
      ...DISTRIBUTOR_DEFS.filter((d) => p.distributorWallets[d.id]).map((d) => ({ role: "distributor" as const, distributorId: d.id, label: d.name, address: p.distributorWallets[d.id] })),
      ...FUNDER_DEFS.filter((f) => p.funderWallets[f.id]).map((f) => ({ role: "funder" as const, funderId: f.id, label: f.name, address: p.funderWallets[f.id] })),
    ];
    const balances = await gateway.readBalances(parties.map((w) => w.address)).catch(() => []);
    for (const w of parties) {
      const b = balances.find((x) => x.address === w.address);
      wallets.push({ ...w, explorerUrl: explorerAddressUrl(w.address), solLamports: b?.solLamports ?? null, settlementUnits: b?.settlementUnits ?? null });
    }
  }

  return {
    isSimulated: true,
    cluster: "devnet",
    checkedAt: new Date().toISOString(),
    programs,
    settlementAsset,
    wallets,
    registry: { name: REGISTRAR_NAME, isSimulated: true, titles: all.filter((r) => r.registry.status === "registered").length },
    stats: {
      receivables: all.length,
      registeredOnChain: all.filter((r) => r.chain.status === "confirmed").length,
      debtorAccepted: all.filter((r) => r.debtorConfirmation.chain?.status === "confirmed").length,
      published: all.filter((r) => r.listing.status === "published").length,
      assigned: all.filter((r) => r.status === "assigned").length,
      doubleSpendRejected: all.filter((r) => r.assignment.doubleSpendProof?.status === "rejected").length,
    },
  };
}
