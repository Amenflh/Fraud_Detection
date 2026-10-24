"use client";

import { Network, Siren, Timer } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { StatusKey } from "../../lib/dossiers";
import { LEVEL_META, type RulesResult } from "../../lib/rules";
import { useNow } from "../../lib/hooks";
import { VERDICT_META, type Verdict } from "../../lib/verdict";
import { formatDuration, slaState, STAGE_META } from "../../lib/workflow";

export function StatusBadge({ status, className }: { status: StatusKey; className?: string }) {
  const meta = STAGE_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1", className)}
      style={{ color: meta.color, background: `${meta.color}1a`, borderColor: `${meta.color}55`, boxShadow: `inset 0 0 0 1px ${meta.color}40` }}
    >
      <Icon className="size-3.5" />
      {meta.label}
    </span>
  );
}

export function VerdictPill({ verdict, score }: { verdict: Verdict | null; score?: number | null }) {
  if (!verdict) return null;
  const meta = VERDICT_META[verdict];
  const Icon = meta.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ring-1", meta.bg, meta.text, meta.ring)}>
      <Icon className="size-3" />
      {meta.short}
      {score != null && <span className="tabular-nums opacity-70">· {score.toFixed(2)}</span>}
    </span>
  );
}

/** Time spent in the current stage, colored against its SLA; pulses once overdue. */
export function SlaChip({ enteredAt, slaHours }: { enteredAt: string; slaHours: number | null }) {
  const now = useNow(30_000);
  const { hours, ratio } = slaState(enteredAt, slaHours, now);
  if (!now) return <span className="text-[11px] text-muted-foreground">…</span>;
  const tone =
    ratio === null ? "text-muted-foreground" : ratio >= 1 ? "text-red-300" : ratio >= 0.75 ? "text-amber-300" : "text-emerald-300";
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] tabular-nums", tone)} title={slaHours ? `SLA : ${slaHours} h` : undefined}>
      <Timer className={cn("size-3", ratio !== null && ratio >= 1 && "animate-pulse")} />
      {formatDuration(hours)}
      {ratio !== null && ratio >= 1 && <span className="font-semibold">· retard</span>}
    </span>
  );
}

export function FraudIndexChip({ value, level }: { value: number; level: RulesResult["level"] }) {
  const color = LEVEL_META[level].color;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
      style={{ color, background: `${color}1f`, boxShadow: `inset 0 0 0 1px ${color}55` }}
      title={`Indice de fraude ${value}/100 — ${LEVEL_META[level].label}`}
    >
      IF {value}
    </span>
  );
}

export function AlertBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="relative inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-300 ring-1 ring-red-400/30">
      <span className="absolute inset-0 rounded-full ring-1 ring-red-400/40 animate-pulse-ring" />
      <Siren className="size-3" /> {count}
    </span>
  );
}

export function NetworkBadge({ level }: { level: "none" | "medium" | "high" }) {
  if (level === "none") return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ring-1",
        level === "high" ? "bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-400/30" : "bg-amber-400/10 text-amber-200 ring-amber-300/25"
      )}
      title="Lien détecté avec d'autres dossiers"
    >
      <Network className="size-3" /> Réseau
    </span>
  );
}

export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(110px,40%)_1fr] gap-3 border-b border-white/5 py-2.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">{children ?? "—"}</span>
    </div>
  );
}

export function SectionTitle({ children, icon: Icon }: { children: ReactNode; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-cyan-300/80">
      {Icon && <Icon className="size-3.5" />}
      {children}
    </h3>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-muted-foreground">{children}</p>;
}
