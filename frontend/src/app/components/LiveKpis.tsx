"use client";

import { Activity, Eye, ShieldAlert, Sigma, type LucideIcon } from "lucide-react";

import { CLAIMS_UPDATED_EVENT, getStats } from "../lib/api";
import { usePolling } from "../lib/hooks";
import AnimatedNumber from "./AnimatedNumber";

type Tile = {
  label: string;
  icon: LucideIcon;
  accent: string;
  value: number;
  format?: (v: number) => string;
};

export default function LiveKpis() {
  const { data: stats, error } = usePolling(getStats, { intervalMs: 20000, refreshOn: CLAIMS_UPDATED_EVENT });

  const tiles: Tile[] = [
    { label: "Sinistres analysés", icon: Activity, accent: "from-cyan-400/30", value: stats?.total_claims ?? 0 },
    {
      label: "Taux de fraude",
      icon: ShieldAlert,
      accent: "from-red-400/30",
      value: (stats?.fraud_rate ?? 0) * 100,
      format: (v) => `${v.toFixed(1)} %`,
    },
    {
      label: "Score de risque moyen",
      icon: Sigma,
      accent: "from-indigo-400/30",
      value: stats?.avg_risk_score ?? 0,
      format: (v) => v.toFixed(2),
    },
    { label: "En révision humaine", icon: Eye, accent: "from-amber-300/30", value: stats?.needs_review_count ?? 0 },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {tiles.map(({ label, icon: Icon, accent, value, format }, i) => (
        <div
          key={label}
          className="group relative overflow-hidden rounded-2xl glass p-4 transition hover:-translate-y-0.5 hover:border-white/20 animate-fade-up"
          style={{ animationDelay: `${150 + i * 90}ms` }}
        >
          <div className={`absolute -right-6 -top-6 size-24 rounded-full bg-gradient-to-br ${accent} to-transparent blur-2xl transition group-hover:scale-125`} />
          <Icon className="relative size-4 text-muted-foreground" />
          <p className="relative mt-3 text-2xl font-semibold">
            {stats ? <AnimatedNumber value={value} format={format} /> : <span className="text-muted-foreground">—</span>}
          </p>
          <p className="relative text-xs text-muted-foreground">{label}</p>
        </div>
      ))}
      {error && !stats && (
        <p className="col-span-2 text-xs text-muted-foreground">
          Statistiques indisponibles ({error}) — connectez-vous et vérifiez que l&apos;API est lancée.
        </p>
      )}
    </div>
  );
}
