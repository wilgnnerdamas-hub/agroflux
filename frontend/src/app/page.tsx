"use client";

import Link from "next/link";
import { ArrowRight, Building2, FileCheck2, Landmark, Search, ShieldCheck, Store, UserCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useRole } from "@/lib/role";
import { cx } from "@/components/ui";

const QUESTION_ICONS = [FileCheck2, UserCheck, ShieldCheck];

function RoleCard({ href, icon, title, text, cta, onPick, primary }: { href: string; icon: React.ReactNode; title: string; text: string; cta: string; onPick: () => void; primary?: boolean }) {
  return (
    <Link
      href={href}
      onClick={onPick}
      className={cx(
        "group flex flex-col rounded-2xl border p-6 transition-colors",
        primary ? "border-brand bg-brand text-white hover:bg-brand-hover" : "border-border bg-surface hover:border-brand",
      )}
      data-testid={href === "/distribuidor" ? "enter-distributor" : "enter-funder"}
    >
      <span className={cx("flex h-11 w-11 items-center justify-center rounded-xl", primary ? "bg-white/15" : "bg-brand-soft text-brand")}>{icon}</span>
      <span className="mt-4 text-lg font-bold">{title}</span>
      <span className={cx("mt-1 flex-1 text-sm", primary ? "text-white/85" : "text-muted")}>{text}</span>
      <span className={cx("mt-5 inline-flex items-center gap-2 text-sm font-semibold", primary ? "text-white" : "text-brand")}>
        {cta} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
    </Link>
  );
}

export default function LandingPage() {
  const { t } = useI18n();
  const { setRole } = useRole();
  const l = t.landing;

  return (
    <div className="space-y-16 pb-6">
      <section className="pt-4 text-center sm:pt-10">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand">{l.eyebrow}</p>
        <h1 className="mx-auto mt-3 max-w-3xl text-3xl font-bold tracking-tight text-ink sm:text-5xl">{l.title}</h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">{l.subtitle}</p>
        <div className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
          <Link
            href="/distribuidor"
            onClick={() => setRole("distributor")}
            className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-hover"
          >
            <Store className="h-4 w-4" aria-hidden /> {l.enterDistributor}
          </Link>
          <Link
            href="/financiador"
            onClick={() => setRole("funder")}
            className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-lg border border-border-strong bg-surface px-5 text-sm font-semibold text-ink hover:bg-subtle"
          >
            <Landmark className="h-4 w-4" aria-hidden /> {l.enterFunder}
          </Link>
        </div>
        <p className="mt-3 text-xs text-muted">{l.demoAccess}</p>
      </section>

      <section aria-labelledby="problem">
        <h2 id="problem" className="text-xl font-bold text-ink">{l.problemTitle}</h2>
        <p className="mt-1 text-sm text-muted">{l.problemIntro}</p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {l.questions.map((q, i) => {
            const Icon = QUESTION_ICONS[i];
            return (
              <div key={q.q} className="rounded-xl border border-border bg-surface p-5">
                <Icon className="h-6 w-6 text-chain" aria-hidden />
                <p className="mt-3 font-semibold text-ink">{q.q}</p>
                <p className="mt-1 text-sm text-muted">{q.a}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="how">
        <h2 id="how" className="text-xl font-bold text-ink">{l.howTitle}</h2>
        <ol className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {l.steps.map((s, i) => (
            <li key={s.t} className="flex gap-3 rounded-xl border border-border bg-surface p-5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand">{i + 1}</span>
              <div>
                <p className="font-semibold text-ink">{s.t}</p>
                <p className="mt-1 text-sm text-muted">{s.d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="roles">
        <h2 id="roles" className="text-xl font-bold text-ink">{l.rolesTitle}</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <RoleCard
            href="/distribuidor"
            primary
            icon={<Building2 className="h-5 w-5" aria-hidden />}
            title={l.distributorCard.title}
            text={l.distributorCard.text}
            cta={l.enterDistributor}
            onPick={() => setRole("distributor")}
          />
          <RoleCard
            href="/financiador"
            icon={<Landmark className="h-5 w-5" aria-hidden />}
            title={l.funderCard.title}
            text={l.funderCard.text}
            cta={l.enterFunder}
            onPick={() => setRole("funder")}
          />
        </div>
      </section>

      <section className="flex flex-col items-start gap-4 rounded-2xl border border-chain/25 bg-chain-soft p-6 sm:flex-row sm:items-center">
        <Search className="h-8 w-8 shrink-0 text-chain" aria-hidden />
        <div className="flex-1">
          <p className="font-semibold text-ink">{l.trustTitle}</p>
          <p className="text-sm text-muted">{l.trustText}</p>
        </div>
        <Link href="/transparencia" className="inline-flex items-center gap-2 text-sm font-semibold text-chain hover:underline">
          {l.trustLink} <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </section>

      <p className="rounded-lg border border-sim/30 bg-sim-soft p-4 text-sm font-medium text-sim" role="note">{l.disclaimer}</p>
    </div>
  );
}
