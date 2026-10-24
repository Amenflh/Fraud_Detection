"use client";

import { BarChart3, PieChart, RefreshCw, Table2 } from "lucide-react";
import { useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CLAIMS_UPDATED_EVENT, getStats, listClaims } from "../lib/api";
import { timeAgo, useNow, usePolling } from "../lib/hooks";
import ClaimsTable from "../components/ClaimsTable";
import ScoreDistributionChart from "../components/ScoreDistributionChart";
import StatsSummary from "../components/StatsSummary";
import VerdictDonut from "../components/VerdictDonut";

const REFRESH_MS = 15000;
const fetchClaims = () => listClaims(100);

export default function DashboardPage() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const now = useNow();
  const stats = usePolling(getStats, { intervalMs: REFRESH_MS, enabled: autoRefresh, refreshOn: CLAIMS_UPDATED_EVENT });
  const claims = usePolling(fetchClaims, { intervalMs: REFRESH_MS, enabled: autoRefresh, refreshOn: CLAIMS_UPDATED_EVENT });

  const isLoading = stats.isLoading || claims.isLoading;
  const secondsLeft =
    stats.updatedAt && now ? Math.max(0, Math.ceil((REFRESH_MS - (now.getTime() - stats.updatedAt)) / 1000)) : null;

  function refreshAll() {
    stats.refresh();
    claims.refresh();
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-8 px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between animate-fade-up">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300/80">Centre de surveillance</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Tableau de bord antifraude</h1>
          <p className="mt-1 text-sm text-muted-foreground">Mis à jour {timeAgo(stats.updatedAt, now)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={cn(
              "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition",
              autoRefresh ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200" : "border-white/10 bg-white/5 text-muted-foreground"
            )}
          >
            <span className={cn("size-1.5 rounded-full", autoRefresh ? "bg-emerald-400 animate-pulse" : "bg-white/30")} />
            {autoRefresh ? `Auto · ${secondsLeft ?? "–"} s` : "Auto désactivé"}
          </button>
          <button
            onClick={refreshAll}
            disabled={isLoading}
            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs transition hover:bg-white/10 disabled:opacity-60"
          >
            <RefreshCw className={cn("size-3.5", isLoading && "animate-spin")} /> Rafraîchir
          </button>
        </div>
      </div>

      {stats.error && !stats.data && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Impossible de charger les statistiques ({stats.error}). Vérifiez que le backend est lancé et que vous êtes connecté.
          </CardContent>
        </Card>
      )}

      {!stats.data && !stats.error && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-80 w-full rounded-2xl" />
        </div>
      )}

      {stats.data && (
        <>
          <StatsSummary stats={stats.data} />

          <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            <Card className="animate-fade-up" style={{ animationDelay: "120ms" }}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <BarChart3 className="size-4 text-cyan-300" /> Distribution des scores de risque
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScoreDistributionChart data={stats.data.score_distribution} />
              </CardContent>
            </Card>
            <Card className="animate-fade-up" style={{ animationDelay: "200ms" }}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <PieChart className="size-4 text-cyan-300" /> Répartition des verdicts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <VerdictDonut stats={stats.data} />
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {claims.data && (
        <Card className="animate-fade-up" style={{ animationDelay: "280ms" }}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Table2 className="size-4 text-cyan-300" /> Sinistres analysés
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              {claims.data.claims.length} / {claims.data.total} affichés · cliquez une ligne pour le rapport
            </span>
          </CardHeader>
          <CardContent>
            <ClaimsTable claims={claims.data.claims} />
          </CardContent>
        </Card>
      )}
    </main>
  );
}
