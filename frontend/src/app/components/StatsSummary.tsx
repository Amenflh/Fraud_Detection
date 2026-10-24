"use client";

import { Activity, Eye, ShieldAlert, ShieldCheck, Sigma, type LucideIcon } from "lucide-react";

import { ClaimsStats } from "../lib/types";
import AnimatedNumber from "./AnimatedNumber";

export default function StatsSummary({ stats }: { stats: ClaimsStats }) {
  const pct = (n: number) => (stats.total_claims ? (n / stats.total_claims) * 100 : 0);

  const cards: { label: string; value: number; format?: (v: number) => string; icon: LucideIcon; glow: string; text: string; bar?: number }[] = [
    { label: "Sinistres analysés", value: stats.total_claims, icon: Activity, glow: "from-cyan-400/30", text: "text-cyan-300" },
    {
      label: "Score de risque moyen",
      value: stats.avg_risk_score,
      format: (v) => v.toFixed(2),
      icon: Sigma,
      glow: "from-indigo-400/30",
      text: "text-indigo-300",
      bar: stats.avg_risk_score * 100,
    },
    { label: "Fraudes détectées", value: stats.fraud_count, icon: ShieldAlert, glow: "from-red-400/30", text: "text-red-400", bar: pct(stats.fraud_count) },
    { label: "En révision humaine", value: stats.needs_review_count, icon: Eye, glow: "from-amber-300/30", text: "text-amber-300", bar: pct(stats.needs_review_count) },
    { label: "Sinistres sains", value: stats.not_fraud_count, icon: ShieldCheck, glow: "from-emerald-400/30", text: "text-emerald-400", bar: pct(stats.not_fraud_count) },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
      {cards.map(({ label, value, format, icon: Icon, glow, text, bar }, i) => (
        <div
          key={label}
          className="group relative overflow-hidden rounded-2xl glass p-5 transition duration-300 hover:-translate-y-1 hover:border-white/20 animate-fade-up"
          style={{ animationDelay: `${i * 70}ms` }}
        >
          <div className={`absolute -right-8 -top-8 size-28 rounded-full bg-gradient-to-br ${glow} to-transparent blur-2xl transition duration-500 group-hover:scale-150`} />
          <div className="relative flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{label}</p>
            <Icon className={`size-4 ${text}`} />
          </div>
          <p className={`relative mt-3 text-3xl font-semibold ${i === 0 ? "" : text}`}>
            <AnimatedNumber value={value} format={format} />
          </p>
          {bar !== undefined && (
            <div className="relative mt-3 h-1 overflow-hidden rounded-full bg-white/10">
              <div className={`h-full rounded-full bg-current ${text} transition-all duration-1000`} style={{ width: `${bar}%` }} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
