"use client";

import { Radio } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CLAIMS_UPDATED_EVENT, listClaims } from "../lib/api";
import { timeAgo, usePolling, useNow } from "../lib/hooks";
import { riskHex, VERDICT_META } from "../lib/verdict";

const fetchRecent = () => listClaims(6);

export default function ActivityFeed() {
  const { data, error, updatedAt } = usePolling(fetchRecent, { intervalMs: 15000, refreshOn: CLAIMS_UPDATED_EVENT });
  const now = useNow();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-cyan-300/80">
          <Radio className="size-3.5" /> Activité récente
        </CardTitle>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-red-400 animate-pulse" /> LIVE · {timeAgo(updatedAt, now)}
        </span>
      </CardHeader>
      <CardContent>
        {!data && !error && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        )}
        {error && !data && <p className="text-sm text-muted-foreground">Flux indisponible ({error}).</p>}
        {data && data.claims.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucun sinistre analysé pour l&apos;instant — lancez la première analyse !</p>
        )}
        {data && data.claims.length > 0 && (
          <ul className="space-y-2">
            {data.claims.map((c, i) => {
              const meta = VERDICT_META[c.final_verdict];
              const Icon = meta.icon;
              const score = c.risk_assessment.risk_score;
              return (
                <li
                  key={c.claim_id}
                  className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 transition hover:border-white/15 hover:bg-white/[0.05] animate-fade-up"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <Icon className={cn("size-4 shrink-0", meta.text)} />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{c.claim_id}</span>
                  <div className="hidden h-1 w-16 overflow-hidden rounded-full bg-white/10 sm:block">
                    <div className="h-full rounded-full" style={{ width: `${score * 100}%`, background: riskHex(score) }} />
                  </div>
                  <span className={cn("w-16 text-right text-xs font-medium", meta.text)}>{meta.short}</span>
                </li>
              );
            })}
          </ul>
        )}
        {data && data.total > data.claims.length && (
          <p className="mt-3 text-right text-[11px] text-muted-foreground">
            {data.total.toLocaleString("fr-FR")} sinistres au total
          </p>
        )}
      </CardContent>
    </Card>
  );
}
