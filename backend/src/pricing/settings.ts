// Configurações de operação da AgroFlux (contrato v1.3, §15.5). Editáveis no painel de administração.
import { ApiError } from "../errors.js";
import type { FunderType, Rating, Settings } from "../types.js";

export const RATINGS: Rating[] = ["AA", "A", "B", "C", "D", "E", "F", "G", "H"];
const FUNDER_TYPES: FunderType[] = ["simulated_fidc", "simulated_bank", "simulated_cooperative"];

// IOF de operação de crédito PJ (premissa da demo, a validar com especialista tributário).
export const IOF_RULE = { dailyRate: 0.000041, additionalRate: 0.0038 };

export function defaultSettings(): Settings {
  return {
    cdi: { source: "bcb", manualAnnualBps: 1365 },
    platformFeeBps: 50,
    registryFeeCents: 2_500,
    iofByFunderType: { simulated_fidc: false, simulated_bank: true, simulated_cooperative: false },
    lgdBps: { withCoobligation: 3_500, withoutCoobligation: 6_000 },
    ratings: {
      AA: { pdAnnualBps: 50, spreadBps: 150 },
      A: { pdAnnualBps: 100, spreadBps: 220 },
      B: { pdAnnualBps: 200, spreadBps: 300 },
      C: { pdAnnualBps: 400, spreadBps: 420 },
      D: { pdAnnualBps: 800, spreadBps: 600 },
      E: { pdAnnualBps: 1_500, spreadBps: 850 },
      F: { pdAnnualBps: 2_500, spreadBps: 1_150 },
      G: { pdAnnualBps: 4_000, spreadBps: 1_600 },
      H: { pdAnnualBps: 6_000, spreadBps: 2_200 },
    },
  };
}

const int = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/** Valida e mescla uma atualização parcial. Lança 422 com `fieldErrors`. */
export function mergeSettings(current: Settings, body: unknown): Settings {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, any>;
  const e: Record<string, string> = {};
  const next: Settings = JSON.parse(JSON.stringify(current));

  if (b.cdi !== undefined) {
    if (b.cdi.source !== undefined) {
      if (b.cdi.source !== "bcb" && b.cdi.source !== "manual") e["cdi.source"] = "Use bcb ou manual.";
      else next.cdi.source = b.cdi.source;
    }
    if (b.cdi.manualAnnualBps !== undefined) {
      if (!int(b.cdi.manualAnnualBps, 100, 5_000)) e["cdi.manualAnnualBps"] = "Informe o CDI entre 1,00% e 50,00% ao ano.";
      else next.cdi.manualAnnualBps = b.cdi.manualAnnualBps;
    }
  }
  if (b.platformFeeBps !== undefined) {
    if (!int(b.platformFeeBps, 0, 500)) e.platformFeeBps = "Informe a taxa entre 0% e 5% do valor de face.";
    else next.platformFeeBps = b.platformFeeBps;
  }
  if (b.registryFeeCents !== undefined) {
    if (!int(b.registryFeeCents, 0, 100_000)) e.registryFeeCents = "Informe a tarifa entre R$ 0 e R$ 1.000.";
    else next.registryFeeCents = b.registryFeeCents;
  }
  if (b.iofByFunderType !== undefined) {
    for (const t of FUNDER_TYPES) {
      const v = b.iofByFunderType?.[t];
      if (v === undefined) continue;
      if (typeof v !== "boolean") e[`iofByFunderType.${t}`] = "Use verdadeiro ou falso.";
      else next.iofByFunderType[t] = v;
    }
  }
  if (b.lgdBps !== undefined) {
    for (const k of ["withCoobligation", "withoutCoobligation"] as const) {
      const v = b.lgdBps?.[k];
      if (v === undefined) continue;
      if (!int(v, 0, 10_000)) e[`lgdBps.${k}`] = "Informe a perda entre 0% e 100%.";
      else next.lgdBps[k] = v;
    }
  }
  if (b.ratings !== undefined) {
    for (const r of RATINGS) {
      const v = b.ratings?.[r];
      if (!v) continue;
      if (v.pdAnnualBps !== undefined) {
        if (!int(v.pdAnnualBps, 0, 10_000)) e[`ratings.${r}.pdAnnualBps`] = "Informe a PD entre 0% e 100%.";
        else next.ratings[r].pdAnnualBps = v.pdAnnualBps;
      }
      if (v.spreadBps !== undefined) {
        if (!int(v.spreadBps, 0, 5_000)) e[`ratings.${r}.spreadBps`] = "Informe o spread entre 0% e 50% ao ano.";
        else next.ratings[r].spreadBps = v.spreadBps;
      }
    }
  }
  if (Object.keys(e).length) throw new ApiError(422, "VALIDATION_ERROR", "Alguns campos precisam de ajuste.", e);
  return next;
}
