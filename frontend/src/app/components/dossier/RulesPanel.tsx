"use client";

import { Building2, Copy, Gauge, ListChecks } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { useCountUp } from "../../lib/hooks";
import { LEVEL_META, type RulesResult } from "../../lib/rules";
import { EmptyState, SectionTitle } from "./ui";

const CATEGORY_COLORS: Record<string, string> = {
  contrat: "#22d3ee",
  sinistre: "#818cf8",
  photo: "#f472b6",
  devis: "#fbbf24",
  reseau: "#e879f9",
  constat: "#34d399",
  comportement: "#fb923c",
};

function IndexRing({ value, color }: { value: number; color: string }) {
  const v = useCountUp(value, 1100);
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-32 shrink-0">
      <svg viewBox="0 0 110 110" className="size-full -rotate-90">
        <circle cx="55" cy="55" r={r} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="9" />
        <circle
          cx="55"
          cy="55"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-3xl font-bold tabular-nums" style={{ color }}>
            {Math.round(v)}
          </p>
          <p className="text-[9px] uppercase tracking-widest text-muted-foreground">/ 100</p>
        </div>
      </div>
    </div>
  );
}

export default function RulesPanel({ rules }: { rules?: RulesResult }) {
  if (!rules) return <EmptyState>Moteur de règles non encore exécuté sur ce dossier.</EmptyState>;
  const meta = LEVEL_META[rules.level];
  const byCategory = rules.hits.reduce<Record<string, typeof rules.hits>>((acc, h) => {
    (acc[h.category] ??= []).push(h);
    return acc;
  }, {});

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-5 rounded-2xl border p-5 sm:flex-row sm:items-center" style={{ borderColor: `${meta.color}55`, background: `${meta.color}0d` }}>
        <IndexRing value={rules.fraud_index} color={meta.color} />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              <Gauge className="size-3.5" /> Indice de fraude
            </p>
            <p className="text-xl font-semibold" style={{ color: meta.color }}>
              {meta.label}
            </p>
          </div>
          {[
            ["Modèle ML (XGBoost + IsolationForest)", rules.ml_score * 100, "#818cf8"],
            [`Moteur de règles (${rules.hits.length} / ${rules.evaluated} déclenchées)`, rules.score, meta.color],
          ].map(([label, v, color]) => (
            <div key={label as string}>
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>{label as string}</span>
                <span className="tabular-nums">{Math.round(v as number)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${v}%`, background: color as string }} />
              </div>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">Indice = 1 − (1 − ML) × (1 − règles) : chaque signal peut alerter seul, les deux se renforcent.</p>
        </div>
      </div>

      {rules.consortium.length > 0 && (
        <div className="rounded-xl border border-fuchsia-400/30 bg-fuchsia-500/[0.07] p-4">
          <SectionTitle icon={Building2}>Signalé dans la base mutualisée</SectionTitle>
          <ul className="space-y-1.5 text-sm">
            {rules.consortium.map((h, i) => (
              <li key={i}>
                <b className="text-fuchsia-200">{h.kind_label}</b> signalé(e) par <b>{h.company}</b> — {h.reason}{" "}
                <span className="text-xs text-muted-foreground">({new Date(h.reported_at).toLocaleDateString("fr-FR")})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rules.similar.length > 0 && (
        <div className="rounded-xl border border-amber-300/25 bg-amber-400/[0.05] p-4 text-sm">
          <SectionTitle icon={Copy}>Récits quasi identiques (analyse transversale)</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {rules.similar.map((s) => (
              <Link key={s.dossier_id} href={`/dossiers/${s.dossier_id}`} className="rounded-lg bg-black/20 px-2 py-1 font-mono text-xs text-amber-200 hover:underline">
                {s.dossier_id} · {Math.round(s.similarity * 100)} %
              </Link>
            ))}
          </div>
        </div>
      )}

      <div>
        <SectionTitle icon={ListChecks}>Règles déclenchées</SectionTitle>
        {rules.hits.length === 0 ? (
          <EmptyState>Aucune des {rules.evaluated} règles actives ne s&apos;est déclenchée.</EmptyState>
        ) : (
          <div className="space-y-4">
            {Object.entries(byCategory).map(([cat, hits]) => (
              <div key={cat}>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest" style={{ color: CATEGORY_COLORS[cat] }}>
                  {hits[0].category_label}
                </p>
                <ul className="space-y-1.5">
                  {hits.map((h, i) => (
                    <li
                      key={h.id}
                      className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5 animate-fade-up"
                      style={{ animationDelay: `${i * 60}ms` }}
                    >
                      <code className="mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: CATEGORY_COLORS[cat], background: `${CATEGORY_COLORS[cat]}1a` }}>
                        {h.id}
                      </code>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">{h.title}</p>
                        <p className="text-xs text-muted-foreground">{h.evidence}</p>
                      </div>
                      <span className={cn("shrink-0 text-xs font-semibold tabular-nums", h.weight >= 20 ? "text-red-300" : h.weight >= 10 ? "text-amber-300" : "text-muted-foreground")}>
                        +{h.weight}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
