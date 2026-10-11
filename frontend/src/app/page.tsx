"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { api, API_MODE } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { DISTRIBUTORS, useRole } from "@/lib/role";
import type { Receivable } from "@/lib/types";
import { cx } from "@/components/ui";

const WRAP = "mx-auto w-full max-w-[1200px] px-4 sm:px-8 lg:px-14";

// ---------- Passaporte animado (ilustração com dados fictícios) ----------

const DEMO_HASH = "9f2c4a71e0b85d36c1a9f47e2b06d8c35a1e7f90b4c2d68e13f5a7b9c0d2e4f6";
const LOOP_MS = 9000;
const TYPE_MS = 1600;
const FIRST_STAMP_MS = 2000;
const STAMP_GAP_MS = 1400;
const STAMPS = 4;

/** Relógio do loop. Começa no estado final (servidor, sem JS e `prefers-reduced-motion`). */
function usePassportClock() {
  const [frame, setFrame] = useState({ chars: DEMO_HASH.length, lit: STAMPS });
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t0 = performance.now();
    const timer = setInterval(() => {
      const t = (performance.now() - t0) % LOOP_MS;
      const chars = Math.min(DEMO_HASH.length, Math.floor((t / TYPE_MS) * DEMO_HASH.length));
      const lit = t < FIRST_STAMP_MS ? 0 : Math.min(STAMPS, Math.floor((t - FIRST_STAMP_MS) / STAMP_GAP_MS) + 1);
      setFrame((f) => (f.chars === chars && f.lit === lit ? f : { chars, lit }));
    }, 40);
    return () => clearInterval(timer);
  }, []);
  return frame;
}

function PassportCard() {
  const { t } = useI18n();
  const p = t.landing.passport;
  const { chars, lit } = usePassportClock();
  const typing = chars < DEMO_HASH.length;

  return (
    <figure className="m-0">
      <div
        className="rounded-[18px] border border-[var(--lp-border)] bg-[var(--lp-surface)] p-5 sm:p-6"
        style={{ boxShadow: "0 30px 60px -36px rgba(22,32,27,.28)" }}
        data-testid="landing-passport"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="lp-mono text-[11px] uppercase tracking-[0.08em] text-[var(--lp-faint)]">{p.label}</p>
            <p className="lp-mono mt-1 text-sm font-medium">{p.reference}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-[var(--lp-green-soft)] px-2.5 py-1 text-xs font-medium text-[var(--lp-green)]">
              {p.statuses[lit]}
            </span>
            <span className="lp-mono rounded-full border border-[var(--lp-chain-border)] px-2.5 py-1 text-xs text-[var(--lp-chain)]">devnet</span>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-[var(--lp-divider)] pt-5">
          {p.fields.map((f) => (
            <div key={f.k} className="min-w-0">
              <dt className="text-[11px] text-[var(--lp-faint)]">{f.k}</dt>
              <dd className="mt-0.5 text-sm">{f.v}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5 border-t border-[var(--lp-divider)] pt-4">
          <p className="text-[11px] text-[var(--lp-faint)]">{p.fingerprint}</p>
          <p className="lp-mono mt-1 break-all text-[12px] leading-relaxed text-[var(--lp-muted)]">
            <span className="text-[var(--lp-faint)]">sha256 </span>
            <span className="sr-only">{DEMO_HASH}</span>
            <span aria-hidden>
              {DEMO_HASH.slice(0, chars)}
              {typing && <span className="lp-caret" />}
            </span>
          </p>
        </div>

        <ol className="mt-4 space-y-2">
          {p.stamps.map((s, i) => {
            const on = i < lit;
            return (
              <li key={s.t} className="lp-stamp flex items-center gap-3 rounded-[10px] px-3 py-2.5" data-on={on}>
                <span className="lp-check flex h-5 w-5 shrink-0 items-center justify-center rounded-full">
                  <Check className="lp-stamp-fade h-3 w-3 text-white" strokeWidth={2.5} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{s.t}</span>
                  <span className="block text-[11px] text-[var(--lp-faint)]">{s.h}</span>
                </span>
                <span className="lp-stamp-fade lp-mono shrink-0 text-[11px] text-[var(--lp-chain)]">{s.tx}</span>
              </li>
            );
          })}
        </ol>
      </div>
      <figcaption className="mt-3 text-center text-xs text-[var(--lp-faint)]">{p.caption}</figcaption>
    </figure>
  );
}

// ---------- Faixa "Tudo verificável": assinaturas e endereços reais vindos do backend ----------

type ChainItem = { kind: string; value: string; href: string };

const short = (v: string) => `${v.slice(0, 4)}…${v.slice(-4)}`;
const addressUrl = (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`;

/** Endereços públicos dos programas da demo: usados enquanto o backend não responde (são endereços, não assinaturas). */
function fallbackItems(k: Record<string, string>): ChainItem[] {
  return [
    { kind: k.memo, value: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr" },
    { kind: k.escrow, value: "B3PdnyjFAJua4FbzdfotdZLN3S6LfAXKwavbJNkLxRXa" },
    { kind: k.token2022, value: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" },
    { kind: k.tbrl, value: "8ncLEzjpEpHnEXExg2pSk8ByMRxytCtpmMwDf2BGtovn" },
    { kind: k.treasury, value: "8j5HxEYAX1hFToDWjBQsvvKYafAc67qr76xjq5K53XVq" },
  ].map((i) => ({ ...i, href: addressUrl(i.value) }));
}

function signaturesOf(r: Receivable, k: Record<string, string>): ChainItem[] {
  const out: ChainItem[] = [];
  const push = (kind: string, sig: string | null | undefined, href: string | null | undefined) => {
    if (sig && href) out.push({ kind, value: sig, href });
  };
  push(k.memo, r.chain.signature, r.chain.explorerUrl);
  push(k.confirmation, r.debtorConfirmation.chain?.signature, r.debtorConfirmation.chain?.explorerUrl);
  push(k.terms, r.listing.chain?.signature, r.listing.chain?.explorerUrl);
  push(k.mint, r.assignment.mintSignature, r.assignment.explorerUrls.mint);
  push(k.escrow, r.assignment.settlementSignature, r.assignment.explorerUrls.settlement);
  return out;
}

function useChainItems() {
  const { t } = useI18n();
  const k = t.landing.txKinds;
  const [live, setLive] = useState<ChainItem[] | null>(null);

  useEffect(() => {
    if (API_MODE === "mock") return; // o modo mock não tem nada na rede
    let alive = true;
    (async () => {
      const [tr, list] = await Promise.allSettled([api.getTransparency(), api.listReceivables()]);
      const items: ChainItem[] = [];
      if (list.status === "fulfilled") {
        // Até dois recebíveis com mais etapas na rede (cedido primeiro).
        const rank = (s: string) => (s === "assigned" ? 0 : s === "published" || s === "offer_selected" ? 1 : 2);
        const picks = [...list.value.items].filter((r) => r.chain.status === "confirmed").sort((a, b) => rank(a.status) - rank(b.status)).slice(0, 2);
        const details = await Promise.allSettled(picks.map((r) => api.getReceivable(r.id)));
        for (const d of details) if (d.status === "fulfilled") items.push(...signaturesOf(d.value, k));
      }
      if (tr.status === "fulfilled") {
        const v = tr.value;
        if (v.settlementAsset) items.push({ kind: k.tbrl, value: v.settlementAsset.mint, href: v.settlementAsset.explorerUrl });
        const escrow = v.programs.find((p) => p.role === "escrow");
        if (escrow) items.push({ kind: k.escrow, value: escrow.address, href: escrow.explorerUrl });
        const treasury = v.wallets.find((w) => w.role === "treasury");
        if (treasury) items.push({ kind: k.treasury, value: treasury.address, href: treasury.explorerUrl });
      }
      if (alive && items.length >= 3) setLive(items);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- busca uma vez; os rótulos trocam no render
  }, []);

  return live ?? fallbackItems(k);
}

function ChainStrip() {
  const { t } = useI18n();
  const l = t.landing;
  const items = useChainItems();
  const row = (hidden: boolean) =>
    items.map((it, i) => (
      <a
        key={`${hidden ? "b" : "a"}-${i}`}
        href={it.href}
        target="_blank"
        rel="noopener noreferrer"
        tabIndex={hidden ? -1 : undefined}
        className="inline-flex shrink-0 items-center gap-2 px-5 py-1 text-sm hover:underline"
      >
        <span className="text-[var(--lp-faint)]">{it.kind}</span>
        <span className="lp-mono text-[var(--lp-chain)]">{short(it.value)}</span>
      </a>
    ));

  return (
    <section aria-label={l.trustTitle} className="border-y border-[var(--lp-border)] bg-[var(--lp-bg)]" data-testid="chain-strip">
      <div className={cx(WRAP, "grid grid-cols-1 items-center gap-3 py-4 md:grid-cols-[auto_1fr_auto] md:gap-6")}>
        <p className="text-sm font-medium">{l.trustTitle}</p>
        <div className="lp-marquee order-3 md:order-none">
          <div className="lp-marquee-track">
            <div className="flex">{row(false)}</div>
            <div className="flex" aria-hidden>{row(true)}</div>
          </div>
        </div>
        <Link href="/transparencia" className="text-sm font-medium text-[var(--lp-chain)] hover:underline md:justify-self-end">
          {l.explorerLink}
        </Link>
      </div>
    </section>
  );
}

// ---------- Página ----------

function SectionHead({ id, title, intro }: { id: string; title: string; intro: string }) {
  return (
    <>
      <h2 id={id} className="text-[28px] font-medium tracking-[-0.02em]">{title}</h2>
      <p className="mt-1.5 text-[15px] text-[var(--lp-muted)]">{intro}</p>
    </>
  );
}

export default function LandingPage() {
  const { t } = useI18n();
  const { setRole } = useRole();
  const l = t.landing;
  const [mainDistributor, ...otherDistributors] = DISTRIBUTORS;

  return (
    <div className="text-[var(--lp-ink)]">
      {/* Hero */}
      <section className={cx(WRAP, "grid items-start gap-12 py-12 sm:py-16 min-[900px]:grid-cols-2 min-[900px]:gap-16 min-[900px]:pb-[88px] min-[900px]:pt-16")}>
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-medium text-[var(--lp-green)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--lp-green)]" aria-hidden />
            {l.eyebrow}
          </p>
          <h1 className="mt-5 text-[38px] font-medium leading-[1.04] tracking-[-0.035em] [text-wrap:balance] sm:text-[48px] min-[900px]:text-[58px]">
            {l.title}
          </h1>
          <p className="mt-6 max-w-[500px] text-[17px] leading-relaxed text-[var(--lp-muted)]">{l.subtitle}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/distribuidor"
              onClick={() => setRole("distributor", mainDistributor.id)}
              className="inline-flex min-h-[46px] items-center justify-center rounded-[10px] bg-[var(--lp-green)] px-5 text-sm font-medium text-white transition-colors hover:bg-[var(--lp-ink)]"
            >
              {l.enterDistributor}
            </Link>
            <Link
              href="/financiador"
              onClick={() => setRole("funder")}
              className="inline-flex min-h-[46px] items-center justify-center rounded-[10px] border border-[var(--lp-border)] bg-[var(--lp-surface)] px-5 text-sm font-medium transition-colors hover:border-[var(--lp-ink)]"
            >
              {l.enterFunder}
            </Link>
          </div>
          <p className="mt-3 text-xs text-[var(--lp-faint)]">{l.demoAccess}</p>
        </div>
        <PassportCard />
      </section>

      {/* O problema */}
      <section aria-labelledby="problem" className={cx(WRAP, "pb-20")}>
        <SectionHead id="problem" title={l.problemTitle} intro={l.problemIntro} />
        <div className="mt-7 grid gap-4 min-[900px]:grid-cols-3">
          {l.questions.map((q) => (
            <div key={q.q} className="lp-lift rounded-[14px] border border-[var(--lp-border)] bg-[var(--lp-surface)] p-6 hover:-translate-y-0.5 hover:border-[var(--lp-green)]">
              <span className="lp-mono inline-block rounded-full bg-[var(--lp-green-soft)] px-2.5 py-0.5 text-[11px] text-[var(--lp-green)]">{q.tag}</span>
              <p className="mt-4 text-[19px] font-medium leading-snug tracking-[-0.01em]">{q.q}</p>
              <p className="mt-4 text-[11px] font-medium text-[var(--lp-green)]">{l.howWeSolve}</p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--lp-muted)]">{q.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Como funciona */}
      <section aria-labelledby="how" className={cx(WRAP, "pb-20")}>
        <SectionHead id="how" title={l.howTitle} intro={l.howIntro} />
        <ol className="mt-7 grid gap-px overflow-hidden rounded-[14px] border border-[var(--lp-border)] bg-[var(--lp-border)] sm:grid-cols-2 lg:grid-cols-5">
          {l.steps.map((s, i) => (
            <li key={s.t} className="bg-[var(--lp-surface)] p-6 transition-colors hover:bg-[var(--lp-bg)]">
              <span className="lp-mono text-xs text-[var(--lp-green)]">{String(i + 1).padStart(2, "0")}</span>
              <p className="mt-3 text-base font-medium">{s.t}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--lp-muted)]">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Perfis */}
      <section aria-labelledby="roles" className={cx(WRAP, "pb-20")}>
        <h2 id="roles" className="text-[28px] font-medium tracking-[-0.02em]">{l.rolesTitle}</h2>
        <div className="mt-7 grid gap-4 min-[900px]:grid-cols-2">
          <div className="lp-lift flex flex-col rounded-2xl bg-[var(--lp-green)] p-8 text-white hover:-translate-y-[3px]" data-testid="enter-distributor">
            <p className="text-xl font-medium">{l.distributorCard.title}</p>
            <p className="mt-2 flex-1 text-[15px] leading-relaxed text-white/85">{l.distributorCard.text}</p>
            <Link
              href="/distribuidor"
              onClick={() => setRole("distributor", mainDistributor.id)}
              className="group mt-6 inline-flex items-center gap-2 self-start text-sm font-medium hover:underline"
              data-testid={`enter-${mainDistributor.id}`}
            >
              {l.enterDistributor} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={1.5} aria-hidden />
            </Link>
            <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/20 pt-4 text-xs text-white/75">
              {l.otherDistributors}
              {otherDistributors.map((d) => (
                <Link
                  key={d.id}
                  href="/distribuidor"
                  onClick={() => setRole("distributor", d.id)}
                  className="rounded-full border border-white/30 px-2.5 py-0.5 font-medium text-white hover:bg-white/10"
                  data-testid={`enter-${d.id}`}
                >
                  {d.name}
                </Link>
              ))}
            </p>
          </div>
          <Link
            href="/financiador"
            onClick={() => setRole("funder")}
            className="lp-lift group flex flex-col rounded-2xl border border-[var(--lp-border)] bg-[var(--lp-surface)] p-8 hover:-translate-y-[3px] hover:border-[var(--lp-green)]"
            data-testid="enter-funder"
          >
            <span className="text-xl font-medium">{l.funderCard.title}</span>
            <span className="mt-2 flex-1 text-[15px] leading-relaxed text-[var(--lp-muted)]">{l.funderCard.text}</span>
            <span className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-[var(--lp-green)]">
              {l.enterFunder} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={1.5} aria-hidden />
            </span>
          </Link>
        </div>
        <Link
          href="/admin"
          onClick={() => setRole("admin")}
          className="group mt-4 flex flex-col gap-1 rounded-[14px] border border-[var(--lp-border)] bg-[var(--lp-surface)] px-6 py-4 transition-colors hover:border-[var(--lp-green)] sm:flex-row sm:items-center sm:gap-4"
          data-testid="enter-admin"
        >
          <span className="text-sm font-medium">{l.adminCard.title}</span>
          <span className="flex-1 text-sm text-[var(--lp-muted)]">{l.adminCard.text}</span>
          <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--lp-green)]">
            {l.enterAdmin} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={1.5} aria-hidden />
          </span>
        </Link>
      </section>

      <ChainStrip />

      <div className={WRAP}>
        <p className="mx-auto max-w-[820px] py-10 text-center text-xs leading-relaxed text-[var(--lp-faint)]">{l.disclaimer}</p>
      </div>
    </div>
  );
}
