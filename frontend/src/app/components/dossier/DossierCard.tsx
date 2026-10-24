"use client";

import { Car, Search, Wrench } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import type { DossierSummary } from "../../lib/dossiers";
import { riskHex } from "../../lib/verdict";
import { formatAmount, INCIDENT_LABELS } from "../../lib/workflow";
import { AlertBadge, FraudIndexChip, NetworkBadge, SlaChip, VerdictPill } from "./ui";

export default function DossierCard({ d, index = 0 }: { d: DossierSummary; index?: number }) {
  return (
    <Link
      href={`/dossiers/${d.id}`}
      className={cn(
        "group relative block overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] p-3.5 transition duration-300",
        "hover:-translate-y-0.5 hover:border-cyan-300/30 hover:bg-white/[0.07] hover:shadow-[0_8px_30px_-12px_rgb(34_211_238/0.4)] animate-fade-up",
        d.alerts > 0 && "border-red-400/25"
      )}
      style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
    >
      {d.risk_score != null && (
        <span className="absolute inset-y-0 left-0 w-0.5" style={{ background: riskHex(d.risk_score) }} />
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[11px] text-cyan-200/80">{d.id}</p>
          <p className="truncate text-sm font-medium">{d.insured_name}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {d.fraud_index != null && <FraudIndexChip value={d.fraud_index} level={d.rules_level} />}
          <AlertBadge count={d.alerts} />
        </div>
      </div>

      <p className="mt-1.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
        <Car className="size-3 shrink-0" /> {d.make_model} · {d.plate}
      </p>
      <p className="mt-1 text-xs">
        <span className="text-muted-foreground">{INCIDENT_LABELS[d.incident_type] ?? d.incident_type} · </span>
        <span className="tabular-nums">{formatAmount(d.quote_amount ?? d.claim_amount)}</span>
        {d.quote_amount != null && <span className="text-muted-foreground"> (devis)</span>}
      </p>

      {(d.expert_name || d.garage_name) && (
        <div className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
          {d.expert_name && (
            <p className="flex items-center gap-1.5 truncate">
              <Search className="size-3 shrink-0" /> {d.expert_name}
            </p>
          )}
          {d.garage_name && (
            <p className="flex items-center gap-1.5 truncate">
              <Wrench className="size-3 shrink-0" /> {d.garage_name}
            </p>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap gap-1.5">
          <VerdictPill verdict={d.verdict} score={d.risk_score} />
          <NetworkBadge level={d.network_level} />
        </div>
        <SlaChip enteredAt={d.stage_entered_at} slaHours={d.status === "cloture" || d.status === "rejete" ? null : d.sla_hours} />
      </div>
    </Link>
  );
}
