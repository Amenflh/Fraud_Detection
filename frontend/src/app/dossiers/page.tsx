"use client";

import { Columns3, FolderKanban, List, Plus, RefreshCw, Search, Siren, Timer } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import AnimatedNumber from "../components/AnimatedNumber";
import DossierCard from "../components/dossier/DossierCard";
import { AlertBadge, EmptyState, NetworkBadge, SlaChip, StatusBadge, VerdictPill } from "../components/dossier/ui";
import { DOSSIERS_UPDATED_EVENT, listDossiers, type DossierSummary } from "../lib/dossiers";
import { timeAgo, useNow, usePolling } from "../lib/hooks";
import { useMe } from "../components/AuthProvider";
import { isStaff } from "../lib/auth";
import { formatAmount, REJECTED, slaState, STAGES } from "../lib/workflow";

const COLUMNS = [...STAGES.filter((s) => s.key !== "declare"), REJECTED];

export default function DossiersPage() {
  const { data, error, updatedAt, isLoading, refresh } = usePolling(listDossiers, {
    intervalMs: 15000,
    refreshOn: DOSSIERS_UPDATED_EVENT,
  });
  const now = useNow();
  const { me } = useMe();
  const staff = !me || isStaff(me.role);
  const canDeclare = !me || me.role === "gestionnaire" || me.role === "agent" || me.role === "assure";
  const [query, setQuery] = useState("");
  const [onlyAlerts, setOnlyAlerts] = useState(false);
  const [city, setCity] = useState<string | null>(null);
  const [view, setView] = useState<"board" | "list">("board");

  const dossiers = useMemo(() => data?.dossiers ?? [], [data]);
  const cities = useMemo(() => [...new Set(dossiers.map((d) => d.city))].sort(), [dossiers]);
  const filtered = dossiers.filter((d) => {
    const q = query.toLowerCase();
    return (
      (!q || [d.id, d.insured_name, d.plate].some((v) => v.toLowerCase().includes(q))) &&
      (!onlyAlerts || d.alerts > 0 || d.network_level !== "none") &&
      (!city || d.city === city)
    );
  });

  const open = dossiers.filter((d) => d.status !== "cloture" && d.status !== "rejete");
  const overdue = open.filter((d) => (slaState(d.stage_entered_at, d.sla_hours, now).ratio ?? 0) >= 1).length;
  const alerts = dossiers.filter((d) => d.alerts > 0).length;
  const exposure = open.reduce((s, d) => s + (d.quote_amount ?? d.claim_amount), 0);

  const tiles = [
    { label: "Dossiers ouverts", value: open.length, icon: FolderKanban, tone: "text-cyan-300" },
    { label: "Hors délai (SLA)", value: overdue, icon: Timer, tone: "text-amber-300" },
    ...(staff ? [{ label: "Alertes IA", value: alerts, icon: Siren, tone: "text-red-300" }] : [{ label: "Dossiers clôturés", value: dossiers.length - open.length, icon: Siren, tone: "text-emerald-300" }]),
    { label: "Engagement en cours", value: exposure, icon: Columns3, tone: "text-indigo-300", format: formatAmount },
  ];

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between animate-fade-up">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300/80">Gestion des sinistres</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Dossiers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Assuré, expert, garage et gestionnaire sur un même flux — enrichi par les agents IA · mis à jour {timeAgo(updatedAt, now)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs transition hover:bg-white/10"
          >
            <RefreshCw className={cn("size-3.5", isLoading && "animate-spin")} /> Rafraîchir
          </button>
          {canDeclare && <Link
            href="/declarer"
            className="flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-400 to-indigo-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:opacity-90"
          >
            <Plus className="size-3.5" /> Nouvelle déclaration
          </Link>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(({ label, value, icon: Icon, tone, format }, i) => (
          <div key={label} className="rounded-2xl glass p-4 animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              {label} <Icon className={cn("size-4", tone)} />
            </div>
            <p className={cn("mt-2 text-2xl font-semibold", tone)}>
              {data ? <AnimatedNumber value={value} format={format} /> : "—"}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="N° sinistre, assuré, immatriculation…" className="pl-8" />
          </div>
          {staff && <button
            onClick={() => setOnlyAlerts((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition",
              onlyAlerts ? "border-red-400/40 bg-red-500/15 text-red-200" : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground"
            )}
          >
            <Siren className="size-3.5" /> Alertes uniquement
          </button>}
          {cities.map((c) => (
            <button
              key={c}
              onClick={() => setCity(city === c ? null : c)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs transition",
                city === c ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-100" : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground"
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex rounded-full border border-white/10 bg-white/5 p-1">
          {([["board", Columns3, "Kanban"], ["list", List, "Liste"]] as const).map(([key, Icon, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={cn("flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition", view === key ? "bg-white/15" : "text-muted-foreground")}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      {error && !data && <EmptyState>Impossible de charger les dossiers ({error}). Le backend est-il lancé ?</EmptyState>}
      {!data && !error && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-96 rounded-2xl" />
          ))}
        </div>
      )}
      {data && data.total === 0 && (
        <EmptyState>
          Aucun dossier. Lancez <code className="text-cyan-200">python scripts/seed_demo_dossiers.py</code> ou créez une déclaration.
        </EmptyState>
      )}

      {data && data.total > 0 && view === "board" && (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
          <div className="grid min-w-[1500px] grid-cols-6 gap-4">
            {COLUMNS.map(({ key, label, icon: Icon, color }) => {
              const items = filtered.filter((d) => d.status === key);
              return (
                <section key={key} className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-md">
                  <header className="flex items-center justify-between border-b border-white/10 px-3.5 py-3">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <span className="grid size-6 place-items-center rounded-md" style={{ background: `${color}22`, color }}>
                        <Icon className="size-3.5" />
                      </span>
                      {label}
                    </span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] tabular-nums">{items.length}</span>
                  </header>
                  <div className="h-0.5" style={{ background: `linear-gradient(90deg, ${color}, transparent)` }} />
                  <div className="flex max-h-[70vh] flex-1 flex-col gap-2.5 overflow-y-auto p-2.5">
                    {items.length === 0 ? (
                      <p className="py-6 text-center text-xs text-muted-foreground/60">Vide</p>
                    ) : (
                      items.map((d, i) => <DossierCard key={d.id} d={d} index={i} />)
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {data && data.total > 0 && view === "list" && <DossierTable dossiers={filtered} />}
    </main>
  );
}

function DossierTable({ dossiers }: { dossiers: DossierSummary[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-md">
      <table className="w-full text-sm">
        <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            {["Dossier", "Assuré", "Étape", "Délai", "Risque", "Montant", "Expert", "Alertes"].map((h) => (
              <th key={h} className="px-3 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dossiers.map((d) => (
            <tr key={d.id} className="border-t border-white/5 transition hover:bg-white/[0.04]">
              <td className="px-3 py-2.5">
                <Link href={`/dossiers/${d.id}`} className="font-mono text-xs text-cyan-200 hover:underline">
                  {d.id}
                </Link>
              </td>
              <td className="px-3 py-2.5">
                <p>{d.insured_name}</p>
                <p className="text-xs text-muted-foreground">{d.city}</p>
              </td>
              <td className="px-3 py-2.5">
                <StatusBadge status={d.status} />
              </td>
              <td className="px-3 py-2.5">
                <SlaChip enteredAt={d.stage_entered_at} slaHours={d.status === "cloture" || d.status === "rejete" ? null : d.sla_hours} />
              </td>
              <td className="px-3 py-2.5">
                <VerdictPill verdict={d.verdict} score={d.risk_score} />
              </td>
              <td className="px-3 py-2.5 tabular-nums">{formatAmount(d.quote_amount ?? d.claim_amount)}</td>
              <td className="px-3 py-2.5 text-xs text-muted-foreground">{d.expert_name ?? "—"}</td>
              <td className="px-3 py-2.5">
                <div className="flex gap-1.5">
                  <AlertBadge count={d.alerts} />
                  <NetworkBadge level={d.network_level} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
