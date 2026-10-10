"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FlaskConical, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/** Painel lateral "Sobre a demo": o único lugar com todos os avisos de simulação (R8 e §6.4 do contrato v1.2). */
function AboutDrawer({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 ml-auto h-full max-h-none w-full max-w-md overflow-y-auto border-l border-border bg-surface p-0 text-ink backdrop:bg-ink/40"
      aria-labelledby="about-title"
      data-testid="about-drawer"
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 id="about-title" className="text-lg font-bold">{t.about.title}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-subtle hover:text-ink" aria-label={t.about.close}>
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <p className="mt-2 text-sm text-muted">{t.about.intro}</p>
        <dl className="mt-5 space-y-4">
          {t.about.items.map((it) => (
            <div key={it.t}>
              <dt className="text-sm font-semibold">{it.t}</dt>
              <dd className="mt-0.5 text-sm text-muted">{it.d}</dd>
            </div>
          ))}
        </dl>
        <Link href="/transparencia" onClick={onClose} className="mt-6 inline-block text-sm font-semibold text-chain hover:underline">
          {t.landing.trustLink} →
        </Link>
      </div>
    </dialog>
  );
}

/** Faixa fina e fixa no topo de todas as telas. */
export function DemoStrip({ width = "max-w-6xl" }: { width?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-sim/20 bg-sim-soft text-sim" data-testid="demo-strip">
      <div className={`mx-auto flex ${width} items-center gap-2 px-4 py-1.5 text-xs sm:px-6`}>
        <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium">{t.about.strip}</span>
        <button type="button" onClick={() => setOpen(true)} className="shrink-0 font-semibold underline underline-offset-2 hover:no-underline">
          {t.about.open}
        </button>
      </div>
      {open && <AboutDrawer onClose={() => setOpen(false)} />}
    </div>
  );
}
