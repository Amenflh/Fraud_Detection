"use client";

import { BadgeCheck, Gauge, Loader2, MapPin, Phone, Search, Star, Wrench } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { assignExpert, type Actor, type DossierDetail, type QuoteAnalysis, type Role } from "../../lib/dossiers";
import { formatAmount } from "../../lib/workflow";
import { EmptyState, SectionTitle } from "./ui";

function ActorCard({ actor, icon: Icon, accent }: { actor: Actor; icon: typeof Search; accent: string }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.04] p-4">
      <span className="grid size-12 shrink-0 place-items-center rounded-xl" style={{ background: `${accent}22`, color: accent }}>
        <Icon className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{actor.name}</p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <MapPin className="size-3" /> {actor.city}
          </span>
          {actor.phone && (
            <span className="flex items-center gap-1">
              <Phone className="size-3" /> {actor.phone}
            </span>
          )}
          <span className="flex items-center gap-1 text-amber-300">
            <Star className="size-3 fill-current" /> {actor.rating.toFixed(1)}
          </span>
        </p>
        {actor.specialties.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {actor.specialties.map((s) => (
              <span key={s} className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {s}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ExpertTab({ dossier, role, onChange }: { dossier: DossierDetail; role: Role; onChange: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const closed = dossier.status === "cloture" || dossier.status === "rejete";
  const best = dossier.ai.dispatch[0]?.score || 1;

  async function assign(expertId: string) {
    setBusy(expertId);
    try {
      await assignExpert(dossier.id, expertId, role);
      toast.success("Expert missionné — notification envoyée");
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <SectionTitle icon={Search}>Expert missionné</SectionTitle>
        {dossier.expert ? <ActorCard actor={dossier.expert} icon={Search} accent="#818cf8" /> : <EmptyState>Aucun expert missionné pour l&apos;instant.</EmptyState>}
      </section>

      <section>
        <SectionTitle icon={Gauge}>Agent Dispatch — recommandations</SectionTitle>
        {dossier.ai.dispatch.length === 0 ? (
          <EmptyState>Aucune recommandation disponible.</EmptyState>
        ) : (
          <ol className="space-y-3">
            {dossier.ai.dispatch.map((s, i) => {
              const assigned = dossier.expert?.id === s.expert_id;
              return (
                <li
                  key={s.expert_id}
                  className={cn(
                    "rounded-xl border p-4 transition animate-fade-up",
                    i === 0 ? "border-indigo-400/30 bg-indigo-500/[0.07]" : "border-white/10 bg-white/[0.03]"
                  )}
                  style={{ animationDelay: `${i * 90}ms` }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className={cn("grid size-7 place-items-center rounded-full text-xs font-bold", i === 0 ? "bg-indigo-400 text-slate-950" : "bg-white/10")}>
                        {i + 1}
                      </span>
                      <div>
                        <p className="font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.city}</p>
                      </div>
                    </div>
                    {assigned ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-300">
                        <BadgeCheck className="size-4" /> Missionné
                      </span>
                    ) : (
                      <button
                        disabled={closed || busy !== null}
                        onClick={() => assign(s.expert_id)}
                        className="flex items-center gap-1.5 rounded-lg bg-indigo-500/80 px-3 py-1.5 text-xs font-semibold transition hover:bg-indigo-500 disabled:opacity-40"
                      >
                        {busy === s.expert_id && <Loader2 className="size-3 animate-spin" />}
                        {dossier.expert ? "Réaffecter" : "Missionner"}
                      </button>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-cyan-300 transition-all duration-1000" style={{ width: `${(s.score / best) * 100}%` }} />
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground">{s.score} pts</span>
                  </div>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {s.reasons.map((r) => (
                      <li key={r} className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-muted-foreground">
                        {r}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

export function QuoteCard({ quote }: { quote: QuoteAnalysis }) {
  const tone = quote.level === "high" ? "#f87171" : quote.level === "warning" ? "#fbbf24" : "#34d399";
  const pct = Math.min(quote.ratio / 2, 1) * 100;
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: `${tone}55`, background: `${tone}0d` }}>
      <div className="flex items-center justify-between">
        <SectionTitle icon={Gauge}>Agent Devis</SectionTitle>
        <span className="text-xs font-semibold" style={{ color: tone }}>
          {quote.level === "ok" ? "Devis cohérent" : quote.level === "warning" ? "À justifier" : "Surfacturation probable"}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-[11px] text-muted-foreground">Devis garage</p>
          <p className="font-semibold tabular-nums">{formatAmount(quote.amount)}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Montant attendu</p>
          <p className="font-semibold tabular-nums">{formatAmount(quote.reference)}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Économie potentielle</p>
          <p className="font-semibold tabular-nums" style={{ color: quote.potential_saving ? tone : undefined }}>
            {formatAmount(quote.potential_saving)}
          </p>
        </div>
      </div>
      <div className="relative mt-4 h-2 rounded-full bg-gradient-to-r from-emerald-400/30 via-amber-300/30 to-red-400/30">
        <span className="absolute top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-white/70" style={{ left: "50%" }} title="Référence" />
        <span
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white/80 transition-all duration-1000"
          style={{ left: `${pct}%`, background: tone, boxShadow: `0 0 12px ${tone}` }}
        />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Ratio {Math.round(quote.ratio * 100)} % de l&apos;attendu · référence : {quote.basis}
      </p>
      {quote.flags.map((f) => (
        <p key={f} className="mt-1 text-xs" style={{ color: tone }}>
          {f}
        </p>
      ))}
    </div>
  );
}

export function GarageTab({ dossier }: { dossier: DossierDetail }) {
  return (
    <div className="space-y-6">
      <section>
        <SectionTitle icon={Wrench}>Garage</SectionTitle>
        {dossier.garage ? <ActorCard actor={dossier.garage} icon={Wrench} accent="#fbbf24" /> : <EmptyState>Aucun garage choisi.</EmptyState>}
      </section>
      {dossier.ai.quote ? (
        <QuoteCard quote={dossier.ai.quote} />
      ) : (
        <EmptyState>Aucun devis reçu. Le garage peut le déposer depuis l&apos;onglet Documents (rôle « Garage »).</EmptyState>
      )}
    </div>
  );
}
