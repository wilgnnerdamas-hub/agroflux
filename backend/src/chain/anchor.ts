// Ancoragem de um memo na Devnet, compartilhada pelo registro do recebível e pela confirmação do sacado.
// `key` identifica a ancoragem no store (a última assinatura enviada fica guardada nela).
import type { Store } from "../store.js";
import type { ChainGateway, Confirmed } from "./solana.js";

const RESUME_POLL_MS = 2_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Uma tentativa anterior pode ter dado TIMEOUT e entrado na rede depois: confere antes de enviar outra.
export async function anchorMemo(store: Store, chain: ChainGateway, key: string, memo: string, timeoutMs: number): Promise<Confirmed> {
  const previous = store.getSubmission(key);
  const landed = previous ? await chain.checkSignature(previous).catch(() => null) : null;
  return landed ?? chain.sendMemo(memo, { timeoutMs, onSubmitted: (sig) => store.putSubmission(key, sig) });
}

// Depois de um reinício: acompanha a assinatura já enviada até o prazo. null se não confirmou.
export async function resumeAnchor(
  store: Store,
  chain: ChainGateway,
  key: string,
  timeoutMs: number,
): Promise<{ confirmed: Confirmed | null; signature: string | null }> {
  const signature = store.getSubmission(key) ?? null;
  const deadline = Date.now() + timeoutMs;
  while (signature && Date.now() < deadline) {
    const confirmed = await chain.checkSignature(signature).catch(() => null);
    if (confirmed) return { confirmed, signature };
    await sleep(RESUME_POLL_MS);
  }
  return { confirmed: null, signature };
}
