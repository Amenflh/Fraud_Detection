"use client";

import { AlarmClock, Ban, Clock, Coins, Gauge, Rocket, Search, Star, TrendingUp, Wrench, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import AnimatedNumber from "../components/AnimatedNumber";
import { EmptyState } from "../components/dossier/ui";
import { DOSSIERS_UPDATED_EVENT, getWorkflowKpis, type PartnerKpi, type StageKpi } from "../lib/dossiers";
import { timeAgo, useNow, usePolling } from "../lib/hooks";
import { formatAmount, formatDuration, STAGE_META } from "../lib/workflow";

const tooltipStyle = {
  contentStyle: { background: "rgb(15 20 40 / 0.95)", border: "1px solid rgb(255 255 255 / 0.1)", borderRadius: 10, fontSize: 12 },
  labelStyle: { color: "#e2e8f0" },
};

function StageBar({ s, max }: { s: StageKpi; max: number }) {
  const meta = STAGE_META[s.key];
  const avg = s.avg_hours ?? 0;
  const late = s.sla_hours != null && avg > s.sla_hours;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2">
          <meta.icon className="size-4" style={{ color: meta.color }} /> {s.label}
          <span className="text-xs text-muted-foreground">· {s.open} en cours</span>
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          <span className={cn("font-semibold", late ? "text-red-300" : "text-foreground")}>{s.avg_hours != null ? formatDuration(avg) : "—"}</span>
          {s.sla_hours != null && ` / SLA ${formatDuration(s.sla_hours)}`}
        </span>
      </div>
      <div className="relative h-2.5 rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${Math.min((avg / max) * 100, 100)}%`, background: `linear-gradient(90deg, ${meta.color}66, ${meta.color})` }}
        />
        {s.sla_hours != null && (
          <span className="absolute -top-1 h-[18px] w-0.5 rounded-full bg-white/70" style={{ left: `${Math.min((s.sla_hours / max) * 100, 100)}%` }} title="Objectif SLA" />
        )}
      </div>
      {s.sla_rate != null && (
        <p className="text-[11px] text-muted-foreground">
          {Math.round(s.sla_rate * 100)} % des dossiers traités dans les délais ({s.completed} terminés)
        </p>
      )}
    </div>
  );
}

function PartnerTable({ rows, kind }: { rows: PartnerKpi[]; kind: "expert" | "garage" }) {
  const maxLoad = Math.max(1, ...rows.map((r) => r.open));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="pb-2 font-medium">#</th>
            <th className="pb-2 font-medium">{kind === "expert" ? "Expert" : "Garage"}</th>
            <th className="pb-2 font-medium">{kind === "expert" ? "Délai expertise" : "Délai réparation"}</th>
            <th className="pb-2 font-medium">SLA</th>
            <th className="pb-2 font-medium">Charge</th>
            {kind === "garage" && <th className="pb-2 font-medium">Devis / attendu</th>}
            <th className="pb-2 font-medium">Note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className="border-t border-white/5">
              <td className="py-2.5 pr-2 text-muted-foreground">{i + 1}</td>
              <td className="py-2.5 pr-3">
                <p>{r.name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.city} · {r.dossiers} dossiers{r.suspicious ? ` · ${r.suspicious} suspects` : ""}
                </p>
              </td>
              <td className="py-2.5 pr-3 tabular-nums">{r.avg_hours != null ? formatDuration(r.avg_hours) : "—"}</td>
              <td className="py-2.5 pr-3">
                {r.sla_rate != null ? (
                  <span className={cn("tabular-nums", r.sla_rate >= 0.9 ? "text-emerald-300" : r.sla_rate >= 0.7 ? "text-amber-300" : "text-red-300")}>
                    {Math.round(r.sla_rate * 100)} %
                  </span>
                ) : (
                  "—"
                )}
              </td>
              <td className="py-2.5 pr-3">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-cyan-300" style={{ width: `${(r.open / maxLoad) * 100}%` }} />
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground">{r.open}</span>
                </div>
              </td>
              {kind === "garage" && (
                <td className="py-2.5 pr-3 tabular-nums">
                  {r.avg_quote_ratio != null ? (
                    <span className={cn(r.flagged_quotes ? "text-red-300" : "")}>
                      {Math.round(r.avg_quote_ratio * 100)} %{r.flagged_quotes ? ` · ${r.flagged_quotes} ⚠` : ""}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              )}
              <td className="py-2.5">
                <span className="flex items-center gap-1 text-amber-300">
                  <Star className="size-3 fill-current" /> {r.rating.toFixed(1)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PerformancePage() {
  const { data: k, error, updatedAt } = usePolling(getWorkflowKpis, { intervalMs: 30000, refreshOn: DOSSIERS_UPDATED_EVENT });
  const now = useNow();

  if (error && !k) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
        <EmptyState>Indicateurs indisponibles ({error}).</EmptyState>
      </main>
    );
  }

  const tiles: { label: string; value: number; icon: LucideIcon; tone: string; format?: (v: number) => string; hint: string }[] = k
    ? [
        { label: "Dossiers ouverts", value: k.totals.open, icon: Gauge, tone: "text-cyan-300", hint: `${k.totals.dossiers} au total` },
        { label: "Hors délai", value: k.totals.overdue, icon: AlarmClock, tone: "text-amber-300", hint: "étape actuelle > SLA" },
        {
          label: "Cycle moyen",
          value: k.totals.avg_cycle_hours ?? 0,
          icon: Clock,
          tone: "text-indigo-300",
          format: (v) => (k.totals.avg_cycle_hours == null ? "—" : formatDuration(v)),
          hint: "déclaration → clôture",
        },
        { label: "Traitement accéléré", value: k.totals.fast_track_rate * 100, icon: Rocket, tone: "text-emerald-300", format: (v) => `${v.toFixed(0)} %`, hint: "dossiers à faible risque" },
        { label: "Fraude bloquée", value: k.totals.blocked_amount, icon: Ban, tone: "text-red-300", format: formatAmount, hint: `${k.totals.rejected} dossier(s) rejeté(s)` },
        { label: "Économies devis", value: k.totals.quote_savings, icon: Coins, tone: "text-fuchsia-300", format: formatAmount, hint: "surfacturations détectées" },
      ]
    : [];
  const maxStage = k ? Math.max(...k.stages.map((s) => Math.max(s.avg_hours ?? 0, s.sla_hours ?? 0)), 1) : 1;
  const trend = k?.trend.map((t) => ({ ...t, day: new Date(t.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) }));

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <div className="animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300/80">Pilotage</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Performance du processus sinistre</h1>
        <p className="mt-1 text-sm text-muted-foreground">KPIs à chaque étape et pour chaque acteur · mis à jour {timeAgo(updatedAt, now)}</p>
      </div>

      {!k ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {tiles.map(({ label, value, icon: Icon, tone, format, hint }, i) => (
              <div key={label} className="rounded-2xl glass p-4 animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  {label} <Icon className={cn("size-4", tone)} />
                </div>
                <p className={cn("mt-2 text-xl font-semibold", tone)}>
                  <AnimatedNumber value={value} format={format} />
                </p>
                <p className="text-[11px] text-muted-foreground">{hint}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Clock className="size-4 text-cyan-300" /> Durée moyenne par étape vs objectif
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {k.stages
                  .filter((s) => s.key !== "declare")
                  .map((s) => (
                    <StageBar key={s.key} s={s} max={maxStage} />
                  ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <TrendingUp className="size-4 text-cyan-300" /> Tendance sur 30 jours
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={trend} margin={{ left: -20, right: 8, top: 8 }}>
                    <defs>
                      {[
                        ["created", "#22d3ee"],
                        ["suspicious", "#f87171"],
                        ["closed", "#34d399"],
                      ].map(([key, color]) => (
                        <linearGradient key={key} id={`g-${key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={color} stopOpacity={0.45} />
                          <stop offset="100%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid vertical={false} stroke="rgb(255 255 255 / 0.06)" />
                    <XAxis dataKey="day" fontSize={10} tick={{ fill: "rgb(160 170 195)" }} axisLine={false} tickLine={false} interval={4} />
                    <YAxis allowDecimals={false} fontSize={10} tick={{ fill: "rgb(160 170 195)" }} axisLine={false} tickLine={false} />
                    <Tooltip {...tooltipStyle} />
                    <Area type="monotone" dataKey="created" name="Déclarés" stroke="#22d3ee" fill="url(#g-created)" strokeWidth={2} />
                    <Area type="monotone" dataKey="closed" name="Clôturés" stroke="#34d399" fill="url(#g-closed)" strokeWidth={2} />
                    <Area type="monotone" dataKey="suspicious" name="Suspects" stroke="#f87171" fill="url(#g-suspicious)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
                <div className="mt-2 flex justify-center gap-4 text-xs text-muted-foreground">
                  {[
                    ["Déclarés", "#22d3ee"],
                    ["Clôturés", "#34d399"],
                    ["Suspects", "#f87171"],
                  ].map(([l, c]) => (
                    <span key={l} className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ background: c }} /> {l}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <AlarmClock className="size-4 text-amber-300" /> Dossiers hors délai ({k.overdue.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {k.overdue.length === 0 ? (
                <EmptyState>Tous les dossiers sont dans les délais 🎉</EmptyState>
              ) : (
                <ul className="grid gap-2 md:grid-cols-2">
                  {k.overdue.map((o) => {
                    const ratio = o.hours / o.sla_hours;
                    return (
                      <li key={o.dossier_id}>
                        <Link
                          href={`/dossiers/${o.dossier_id}`}
                          className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 transition hover:border-amber-300/40"
                        >
                          <span className="font-mono text-xs text-cyan-200">{o.dossier_id}</span>
                          <span className="flex-1 truncate text-xs text-muted-foreground">
                            {o.stage_label} · {o.owner}
                          </span>
                          <span className={cn("text-xs font-semibold tabular-nums", ratio >= 2 ? "text-red-300" : "text-amber-300")}>
                            {formatDuration(o.hours)} <span className="font-normal text-muted-foreground">/ {formatDuration(o.sla_hours)}</span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Search className="size-4 text-indigo-300" /> Classement des experts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PartnerTable rows={k.experts} kind="expert" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Wrench className="size-4 text-amber-300" /> Classement des garages
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PartnerTable rows={k.garages} kind="garage" />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </main>
  );
}
