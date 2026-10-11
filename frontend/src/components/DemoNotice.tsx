"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
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
          <h2 id="about-title" className="text-lg font-medium">{t.about.title}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-subtle hover:text-ink" aria-label={t.about.close}>
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <p className="mt-2 text-sm text-muted">{t.about.intro}</p>
        <dl className="mt-5 space-y-4">
          {t.about.items.map((it) => (
            <div key={it.t}>
              <dt className="text-sm font-medium">{it.t}</dt>
              <dd className="mt-0.5 text-sm text-muted">{it.d}</dd>
            </div>
          ))}
        </dl>
        <Link href="/transparencia" onClick={onClose} className="mt-6 inline-block text-sm font-medium text-chain hover:underline">
          {t.landing.trustLink} →
        </Link>
      </div>
    </dialog>
  );
}

/** Faixa fina e fixa no topo de todas as telas. */
export function DemoStrip({ width = "max-w-[1200px]" }: { width?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-amber-line bg-amber-soft text-amber-ink" data-testid="demo-strip">
      <div className={`mx-auto flex h-8 ${width} items-center gap-2 px-4 text-xs sm:px-8 lg:px-14`}>
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{t.about.strip}</span>
        <button type="button" onClick={() => setOpen(true)} className="shrink-0 font-medium underline underline-offset-2 hover:no-underline">
          {t.about.open}
        </button>
      </div>
      {open && <AboutDrawer onClose={() => setOpen(false)} />}
    </div>
  );
}
