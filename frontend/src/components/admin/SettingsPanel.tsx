"use client";

import { useEffect, useMemo, useState } from "react";
import { api, toApiError } from "@/lib/api";
import { formatBps } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useAsync } from "@/lib/useAsync";
import type { FunderType, PricingReference, Settings } from "@/lib/types";
import { ErrorState, LoadingBlock, cx } from "@/components/ui";
import { ratingBar, ratingTone } from "@/components/RiskCard";
import { Panel, RATINGS } from "./shared";

const TYPES: FunderType[] = ["simulated_fidc", "simulated_bank", "simulated_cooperative"];
const clone = (s: Settings) => JSON.parse(JSON.stringify(s)) as Settings;

/** Folhas comparáveis das configurações (caminho → valor), para contar e marcar alterações. */
function leaves(s: Settings): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {
    "cdi.source": s.cdi.source,
    "cdi.manualAnnualBps": s.cdi.manualAnnualBps,
    platformFeeBps: s.platformFeeBps,
    registryFeeCents: s.registryFeeCents,
    "lgd.with": s.lgdBps.withCoobligation,
    "lgd.without": s.lgdBps.withoutCoobligation,
  };
  for (const t of TYPES) out[`iof.${t}`] = s.iofByFunderType[t];
  for (const r of RATINGS) {
    out[`pd.${r}`] = s.ratings[r].pdAnnualBps;
    out[`spread.${r}`] = s.ratings[r].spreadBps;
  }
  return out;
}

/** Campo numérico em "pontos-base" exibido com casas decimais e unidade como sufixo. */
function NumField({
  value,
  digits = 2,
  suffix,
  disabled,
  dirty,
  onValue,
  label,
  testId,
  compact,
}: {
  value: number;
  digits?: number;
  suffix?: string;
  disabled?: boolean;
  dirty?: boolean;
  onValue: (v: number) => void;
  label: string;
  testId?: string;
  compact?: boolean;
}) {
  const { locale } = useI18n();
  const sep = locale === "pt" ? "," : ".";
  const show = (v: number) => (v / 100).toFixed(digits).replace(".", sep);
  const [text, setText] = useState(show(value));
  // Valor externo mudou (descartar, salvar): reflete no campo.
  useEffect(() => {
    setText((cur) => (Math.round(Number(cur.replace(",", ".")) * 100) === value ? cur : show(value)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, locale]);
  return (
    <span className={cx("relative inline-flex", disabled && "opacity-50")}>
      <input
        value={text}
        disabled={disabled}
        inputMode="decimal"
        aria-label={label}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value.replace(",", "."));
          if (e.target.value.trim() !== "" && Number.isFinite(n)) onValue(Math.round(n * 100));
        }}
        onBlur={() => setText(show(value))}
        className={cx(
          "agf-input tnum rounded-[10px] border bg-surface text-sm",
          compact ? "h-[38px] w-[64px] text-center" : "h-10 w-[140px] pl-3 text-right",
          !compact && (suffix ? "pr-14" : "pr-3"),
          dirty ? "border-amber bg-[#fffbf2]" : "border-border",
        )}
        data-testid={testId}
      />
      {suffix && !compact && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-faint">{suffix}</span>}
    </span>
  );
}

function FieldRow({ label, hint, dirty, children }: { label: string; hint?: string; dirty?: boolean; children: React.ReactNode }) {
  const changedSr = useI18n().t.admin.changedSr;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-divider py-3.5 first:border-t-0 first:pt-0">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm">
          {label}
          {dirty && <span className="h-1.5 w-1.5 rounded-full bg-amber" aria-hidden />}
          {dirty && <span className="sr-only">{changedSr}</span>}
        </p>
        {hint && <p className="text-xs text-faint">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Switch({ on, label, state, dirty, onToggle, testId }: { on: boolean; label: string; state: string; dirty?: boolean; onToggle: () => void; testId?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-4 border-t border-divider py-3.5 text-left first:border-t-0 first:pt-0"
      data-testid={testId}
    >
      <span className="flex items-center gap-2 text-sm">
        {label}
        {dirty && <span className="h-1.5 w-1.5 rounded-full bg-amber" aria-hidden />}
      </span>
      <span className="flex items-center gap-3">
        <span className={cx("text-xs", on ? "text-brand" : "text-faint")}>{state}</span>
        <span className={cx("relative inline-block h-5 w-[34px] rounded-full transition-colors duration-200", on ? "bg-brand" : "bg-border-strong", dirty && "ring-2 ring-amber/60")}>
          <span className={cx("absolute top-[3px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-[left] duration-200", on ? "left-[17px]" : "left-[3px]")} />
        </span>
      </span>
    </button>
  );
}

export function SettingsPanel({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const { t, errorMessage } = useI18n();
  const a = t.admin;
  const { state, setState } = useAsync(() => api.getSettings(), []);
  const [ref, setRef] = useState<PricingReference | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const saved = state.data;

  useEffect(() => {
    if (saved && !draft) setDraft(clone(saved));
  }, [saved, draft]);
  useEffect(() => {
    api.getPricingReference().then(setRef, () => setRef(null));
  }, []);

  const changed = useMemo(() => {
    if (!saved || !draft) return new Set<string>();
    const s = leaves(saved);
    const d = leaves(draft);
    return new Set(Object.keys(d).filter((k) => d[k] !== s[k]));
  }, [saved, draft]);
  const dirty = changed.size > 0;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  // Aviso ao sair da página (fechar, recarregar) com alterações não salvas.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  if (!draft || !saved) return state.status === "error" ? <ErrorState message={errorMessage(state.error)} /> : <div className="rounded-[14px] border border-border bg-surface p-6"><LoadingBlock lines={5} /></div>;

  const set = (fn: (d: Settings) => void) =>
    setDraft((d) => {
      const next = clone(d!);
      fn(next);
      return next;
    });

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const s = await api.updateSettings(draft!);
      setState({ status: "success", data: s });
      setDraft(clone(s));
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1800);
    } catch (e) {
      const ae = toApiError(e);
      setError([errorMessage(ae), ...Object.values(ae.fieldErrors ?? {})].join(" "));
    } finally {
      setBusy(false);
    }
  }

  const bcb = draft.cdi.source === "bcb";
  const maxPd = Math.max(1, ...RATINGS.map((r) => draft.ratings[r].pdAnnualBps));

  return (
    <div className="space-y-6 pb-4" data-testid="settings-form">
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={a.ratesTitle}>
          <FieldRow label={a.cdiSource} hint={bcb ? (ref ? a.cdiAutoHint(formatBps(ref.cdiAnnualBps)) : a.cdiAutoHintShort) : a.cdiManualHint} dirty={changed.has("cdi.source")}>
            <div role="radiogroup" aria-label={a.cdiSource} className={cx("inline-flex rounded-[10px] border bg-surface p-0.5", changed.has("cdi.source") ? "border-amber" : "border-border")}>
              {(["bcb", "manual"] as const).map((src) => (
                <button
                  key={src}
                  type="button"
                  role="radio"
                  aria-checked={draft.cdi.source === src}
                  onClick={() => set((d) => void (d.cdi.source = src))}
                  className={cx("rounded-lg px-3 py-1.5 text-xs font-medium transition-colors", draft.cdi.source === src ? "bg-ink text-white" : "text-muted hover:text-ink")}
                  data-testid={`cdi-source-${src}`}
                >
                  {src === "bcb" ? a.segBcb : a.segManual}
                </button>
              ))}
            </div>
          </FieldRow>
          <FieldRow label={a.cdiManualLabel} hint={a.cdiManualFieldHint} dirty={changed.has("cdi.manualAnnualBps")}>
            <NumField value={draft.cdi.manualAnnualBps} suffix={`% ${t.pricing.perYear}`} disabled={bcb} dirty={changed.has("cdi.manualAnnualBps")} onValue={(v) => set((d) => void (d.cdi.manualAnnualBps = v))} label={a.cdiManualLabel} />
          </FieldRow>
          <FieldRow label={a.platformFeeLabel} hint={a.platformFeeHint} dirty={changed.has("platformFeeBps")}>
            <NumField value={draft.platformFeeBps} suffix="%" dirty={changed.has("platformFeeBps")} onValue={(v) => set((d) => void (d.platformFeeBps = v))} label={a.platformFeeLabel} testId="platform-fee-input" />
          </FieldRow>
          <FieldRow label={a.registryFeeLabel} hint={a.registryFeeHint} dirty={changed.has("registryFeeCents")}>
            <NumField value={draft.registryFeeCents} suffix="R$" dirty={changed.has("registryFeeCents")} onValue={(v) => set((d) => void (d.registryFeeCents = v))} label={a.registryFeeLabel} />
          </FieldRow>
        </Panel>

        <Panel title={a.iofTitle}>
          {TYPES.map((ty) => (
            <Switch
              key={ty}
              on={draft.iofByFunderType[ty]}
              label={t.status.funderType[ty]}
              state={draft.iofByFunderType[ty] ? a.paysIof : a.exempt}
              dirty={changed.has(`iof.${ty}`)}
              onToggle={() => set((d) => void (d.iofByFunderType[ty] = !d.iofByFunderType[ty]))}
              testId={`iof-${ty}`}
            />
          ))}
          <FieldRow label={a.lgdWithLabel} dirty={changed.has("lgd.with")}>
            <NumField value={draft.lgdBps.withCoobligation} digits={0} suffix="%" dirty={changed.has("lgd.with")} onValue={(v) => set((d) => void (d.lgdBps.withCoobligation = v))} label={a.lgdWithLabel} />
          </FieldRow>
          <FieldRow label={a.lgdWithoutLabel} dirty={changed.has("lgd.without")}>
            <NumField value={draft.lgdBps.withoutCoobligation} digits={0} suffix="%" dirty={changed.has("lgd.without")} onValue={(v) => set((d) => void (d.lgdBps.withoutCoobligation = v))} label={a.lgdWithoutLabel} />
          </FieldRow>
        </Panel>
      </div>

      <Panel title={a.ratingGrid} aside="%">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-x-1.5 border-spacing-y-2">
            <thead>
              <tr>
                <th scope="col" className="w-28 text-left text-xs font-normal text-faint"><span className="sr-only">{t.risk.rating}</span></th>
                {RATINGS.map((r) => (
                  <th key={r} scope="col" className="font-normal">
                    <span className={cx("inline-block w-full rounded-md border py-0.5 text-center font-mono text-[11px] font-semibold", ratingTone(r))}>{r}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(["pd", "spread"] as const).map((row) => (
                <tr key={row}>
                  <th scope="row" className="text-left text-sm font-normal text-muted">{row === "pd" ? a.pdRow : a.spreadRow}</th>
                  {RATINGS.map((r) => {
                    const key = `${row}.${r}`;
                    return (
                      <td key={r} className="text-center">
                        <NumField
                          compact
                          value={row === "pd" ? draft.ratings[r].pdAnnualBps : draft.ratings[r].spreadBps}
                          dirty={changed.has(key)}
                          onValue={(v) => set((d) => void (row === "pd" ? (d.ratings[r].pdAnnualBps = v) : (d.ratings[r].spreadBps = v)))}
                          label={`${row === "pd" ? a.pdRow : a.spreadRow} ${r}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <th scope="row" className="pt-2 text-left text-xs font-normal text-faint">{a.pdCurve}</th>
                {RATINGS.map((r) => (
                  <td key={r} className="pt-2">
                    <span className="flex h-9 items-end justify-center" aria-hidden>
                      <span className={cx("w-5 rounded-t-[2px] transition-[height] duration-300", ratingBar(r))} style={{ height: `${Math.max(2, (draft.ratings[r].pdAnnualBps / maxPd) * 36)}px` }} />
                    </span>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-faint">{a.pdLegend}</p>
      </Panel>

      <p className="text-xs text-faint">{a.settingsNote}</p>
      {error && <p className="rounded-[10px] border border-terra-line bg-terra-soft px-4 py-3 text-sm text-terra" role="alert">{error}</p>}

      {(dirty || savedFlash) && (
        <div className="agf-up sticky bottom-5 z-30 flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-ink px-5 py-3 text-sm text-white shadow-lg" role="status" data-testid="unsaved-bar">
          {savedFlash && !dirty ? (
            <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#4ade80]" aria-hidden /> {a.savedShort}</span>
          ) : (
            <>
              <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-amber" aria-hidden /> {a.unsaved(changed.size)}</span>
              <span className="flex gap-2">
                <button type="button" onClick={() => setDraft(clone(saved))} disabled={busy} className="rounded-[10px] border border-white/30 px-3 py-1.5 font-medium hover:border-white">
                  {a.discard}
                </button>
                <button type="button" onClick={() => void save()} disabled={busy} className="rounded-[10px] bg-white px-3 py-1.5 font-medium text-ink hover:bg-white/90 disabled:opacity-70">
                  {busy ? a.saving : a.save}
                </button>
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
