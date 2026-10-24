"use client";

import { Radar } from "lucide-react";

import { cn } from "@/lib/utils";

type Inputs = { claim_amount: number; days_since_policy_start: number; prior_claims_count: number };

// Mirrors the backend feature engineering (app/ml/features.py) so the user sees, while
// typing, which risk signals the model will receive. Purely indicative.
function computeSignals({ claim_amount, days_since_policy_start, prior_claims_count }: Inputs) {
  const ratio = claim_amount / Math.max(days_since_policy_start, 1);
  return [
    { label: "Contrat récent (< 30 jours)", on: days_since_policy_start < 30, weight: 3 },
    { label: "Montant élevé (≥ 15 000 DT)", on: claim_amount >= 15000, weight: 2 },
    { label: "Sinistres antérieurs multiples (≥ 2)", on: prior_claims_count >= 2, weight: 3 },
    { label: `Ratio montant / ancienneté : ${Math.round(ratio).toLocaleString("fr-FR")} DT/jour`, on: ratio > 500, weight: 2 },
  ];
}

export default function LiveSignals(inputs: Inputs) {
  const signals = computeSignals({
    claim_amount: Number(inputs.claim_amount) || 0,
    days_since_policy_start: Number(inputs.days_since_policy_start) || 0,
    prior_claims_count: Number(inputs.prior_claims_count) || 0,
  });
  const total = signals.reduce((s, x) => s + x.weight, 0);
  const level = signals.reduce((s, x) => s + (x.on ? x.weight : 0), 0) / total;
  const color = level >= 0.5 ? "bg-red-400" : level > 0 ? "bg-amber-300" : "bg-emerald-400";

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-cyan-300/80">
          <Radar className="size-3.5 animate-spin-slow" /> Signaux en temps réel
        </span>
        <span className="text-[11px] text-muted-foreground">indicatif</span>
      </div>
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className={cn("h-full rounded-full transition-all duration-700", color)} style={{ width: `${Math.max(level * 100, 4)}%` }} />
      </div>
      <ul className="space-y-2">
        {signals.map((s) => (
          <li key={s.label.split(":")[0]} className="flex items-center gap-2.5 text-sm">
            <span
              className={cn(
                "size-2 shrink-0 rounded-full transition-all duration-500",
                s.on ? "bg-red-400 shadow-[0_0_10px_rgb(248_113_113)]" : "bg-white/15"
              )}
            />
            <span className={cn("transition-colors duration-500", s.on ? "text-foreground" : "text-muted-foreground/60")}>
              {s.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
