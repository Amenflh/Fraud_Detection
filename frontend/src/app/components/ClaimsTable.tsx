"use client";

import { AlertTriangle, ChevronRight, Search } from "lucide-react";
import { Fragment, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FraudVerdict } from "../lib/types";
import { riskHex, VERDICT_META, type Verdict } from "../lib/verdict";

const FILTERS: { key: Verdict | "all"; label: string }[] = [
  { key: "all", label: "Tous" },
  { key: "fraud", label: "Fraude" },
  { key: "needs_human_review", label: "Révision" },
  { key: "not_fraud", label: "Sain" },
];

export default function ClaimsTable({ claims }: { claims: FraudVerdict[] }) {
  const [filter, setFilter] = useState<Verdict | "all">("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = claims.filter(
    (c) => (filter === "all" || c.final_verdict === filter) && c.claim_id.toLowerCase().includes(query.toLowerCase())
  );
  const countFor = (key: Verdict | "all") => (key === "all" ? claims.length : claims.filter((c) => c.final_verdict === key).length);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition",
                filter === key
                  ? "border-cyan-300/50 bg-cyan-400/15 text-cyan-100"
                  : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground"
              )}
            >
              {label} <span className="ml-1 tabular-nums opacity-60">{countFor(key)}</span>
            </button>
          ))}
        </div>
        <div className="relative sm:w-64">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un ID sinistre…" className="pl-8" />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="w-8 px-3 py-3" />
              <th className="px-3 py-3 font-medium">Sinistre</th>
              <th className="px-3 py-3 font-medium">Verdict</th>
              <th className="px-3 py-3 font-medium">Score de risque</th>
              <th className="hidden px-3 py-3 font-medium sm:table-cell">Confiance</th>
              <th className="hidden px-3 py-3 font-medium md:table-cell">Signaux</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                  Aucun sinistre ne correspond.
                </td>
              </tr>
            )}
            {rows.map((c) => {
              const meta = VERDICT_META[c.final_verdict];
              const Icon = meta.icon;
              const score = c.risk_assessment.risk_score;
              const open = openId === c.claim_id;
              return (
                <Fragment key={c.claim_id}>
                  <tr
                    onClick={() => setOpenId(open ? null : c.claim_id)}
                    className={cn("cursor-pointer border-t border-white/5 transition hover:bg-white/[0.04]", open && "bg-white/[0.04]")}
                  >
                    <td className="px-3 py-3">
                      <ChevronRight className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-90")} />
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">{c.claim_id}</td>
                    <td className="px-3 py-3">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ring-1", meta.bg, meta.text, meta.ring)}>
                        <Icon className="size-3" /> {meta.short}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
                          <div className="h-full rounded-full" style={{ width: `${score * 100}%`, background: riskHex(score) }} />
                        </div>
                        <span className="tabular-nums text-xs">{score.toFixed(2)}</span>
                      </div>
                    </td>
                    <td className="hidden px-3 py-3 tabular-nums text-xs sm:table-cell">{Math.round(c.confidence * 100)} %</td>
                    <td className="hidden px-3 py-3 md:table-cell">
                      {c.investigation.red_flags.length > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs text-red-300">
                          <AlertTriangle className="size-3" /> {c.investigation.red_flags.length}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                  {open && (
                    <tr className="border-t border-white/5 bg-white/[0.02]">
                      <td />
                      <td colSpan={5} className="px-3 py-4">
                        <div className="space-y-3 animate-fade-up">
                          <p className="text-sm leading-relaxed">{c.report}</p>
                          {c.investigation.red_flags.length > 0 && (
                            <ul className="flex flex-wrap gap-2">
                              {c.investigation.red_flags.map((f) => (
                                <li key={f} className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-200 ring-1 ring-red-400/20">
                                  {f}
                                </li>
                              ))}
                            </ul>
                          )}
                          <p className="text-xs text-muted-foreground">{c.investigation.summary}</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
