"use client";

import {
  Building2,
  Code2,
  FlaskConical,
  KeyRound,
  ListChecks,
  Loader2,
  Play,
  RotateCcw,
  Save,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import AnimatedNumber from "../components/AnimatedNumber";
import { EmptyState } from "../components/dossier/ui";
import { API_BASE_URL } from "../lib/api";
import { DOSSIERS_UPDATED_EVENT } from "../lib/dossiers";
import { usePolling } from "../lib/hooks";
import {
  backtestRules,
  DEMO_API_KEY,
  getConsortium,
  LEVEL_META,
  listRules,
  saasCheck,
  updateRule,
  type Backtest,
  type RuleRow,
} from "../lib/rules";

const CATEGORY_COLORS: Record<string, string> = {
  contrat: "#22d3ee",
  sinistre: "#818cf8",
  photo: "#f472b6",
  devis: "#fbbf24",
  reseau: "#e879f9",
  constat: "#34d399",
  comportement: "#fb923c",
};

const SAMPLE = {
  reference: "EXT-2026-0042",
  policy_id: "POL-990211",
  claim_amount: 9500,
  claim_date: "2026-10-20",
  incident_type: "theft",
  days_since_policy_start: 120,
  prior_claims_count: 5,
  insured: { name: "Karim Haddad", phone: "+216 98 765 432", cin: "14725836" },
  vehicle: { plate: "231 TU 8890", make_model: "Volkswagen Golf 6" },
  city: "Ben Arous",
};

type Draft = Record<string, { enabled?: boolean; weight?: number }>;

export default function RulesPage() {
  const { data, refresh, isLoading } = usePolling(listRules, { intervalMs: 60000, refreshOn: DOSSIERS_UPDATED_EVENT });
  const { data: fed } = usePolling(getConsortium, { intervalMs: 60000 });
  const [category, setCategory] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [backtest, setBacktest] = useState<Backtest | null>(null);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [apiKey, setApiKey] = useState(DEMO_API_KEY);
  const [payload, setPayload] = useState(JSON.stringify(SAMPLE, null, 2));
  const [apiResult, setApiResult] = useState<{ status: number; body: unknown; ms: number } | null>(null);
  const [calling, setCalling] = useState(false);

  const rules = useMemo(() => data?.rules ?? [], [data]);
  const categories = useMemo(() => [...new Map(rules.map((r) => [r.category, r.category_label])).entries()], [rules]);
  const visible = rules.filter((r) => !category || r.category === category);
  const changed = Object.keys(draft).length;
  const effective = (r: RuleRow) => ({ enabled: draft[r.id]?.enabled ?? r.enabled, weight: draft[r.id]?.weight ?? r.weight });

  function edit(r: RuleRow, patch: { enabled?: boolean; weight?: number }) {
    setBacktest(null);
    setDraft((d) => {
      const next = { ...d[r.id], ...patch };
      const same = (next.enabled ?? r.enabled) === r.enabled && (next.weight ?? r.weight) === r.weight;
      const copy = { ...d };
      if (same) delete copy[r.id];
      else copy[r.id] = next;
      return copy;
    });
  }

  async function simulate() {
    setRunning(true);
    try {
      setBacktest(await backtestRules(draft));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setRunning(false);
    }
  }

  async function apply() {
    setSaving(true);
    try {
      for (const [id, patch] of Object.entries(draft)) await updateRule(id, patch);
      toast.success(`${changed} règle(s) mise(s) à jour — portefeuille réévalué`);
      setDraft({});
      setBacktest(null);
      await refresh();
      window.dispatchEvent(new Event(DOSSIERS_UPDATED_EVENT));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function callApi() {
    setCalling(true);
    const t = performance.now();
    try {
      const res = await saasCheck(JSON.parse(payload), apiKey);
      setApiResult({ ...res, ms: Math.round(performance.now() - t) });
    } catch {
      toast.error("JSON invalide");
    } finally {
      setCalling(false);
    }
  }

  const maxHits = Math.max(1, ...rules.map((r) => r.hits));

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <div className="animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300/80">Moteur antifraude</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Règles de gestion de la fraude</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Chaque sinistre est contrôlé en temps réel par {data?.total ?? "…"} règles explicables, combinées au score ML en un{" "}
          <b className="text-foreground">indice de fraude</b>. Les règles sont paramétrables par la compagnie, testables sur l&apos;historique avant mise en
          production, et exposées en <b className="text-foreground">API SaaS</b>.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Règles actives", value: data?.enabled ?? 0, suffix: data ? ` / ${data.total}` : "", icon: ListChecks, tone: "text-cyan-300" },
          { label: "Familles de contrôle", value: categories.length, suffix: "", icon: ShieldCheck, tone: "text-emerald-300" },
          { label: "Signalements mutualisés", value: fed?.total ?? 0, suffix: "", icon: Users, tone: "text-fuchsia-300" },
          { label: "Compagnies membres", value: (fed?.companies ?? 0) + (fed && !fed.by_company[fed.own_company] ? 1 : 0), suffix: "", icon: Building2, tone: "text-amber-300" },
        ].map(({ label, value, suffix, icon: Icon, tone }, i) => (
          <div key={label} className="rounded-2xl glass p-4 animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              {label} <Icon className={cn("size-4", tone)} />
            </div>
            <p className={cn("mt-2 text-2xl font-semibold", tone)}>
              <AnimatedNumber value={value} />
              <span className="text-base text-muted-foreground">{suffix}</span>
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <Card className="min-w-0">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ListChecks className="size-4 text-cyan-300" /> Catalogue des règles
            </CardTitle>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setCategory(null)}
                className={cn("rounded-full border px-2.5 py-1 text-xs", !category ? "border-cyan-300/50 bg-cyan-400/15" : "border-white/10 text-muted-foreground")}
              >
                Toutes
              </button>
              {categories.map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setCategory(key)}
                  className={cn("rounded-full border px-2.5 py-1 text-xs", category === key ? "bg-white/10" : "border-white/10 text-muted-foreground")}
                  style={category === key ? { borderColor: CATEGORY_COLORS[key], color: CATEGORY_COLORS[key] } : undefined}
                >
                  {label}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {!data ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : (
              <ul className="space-y-1.5">
                {visible.map((r) => {
                  const eff = effective(r);
                  const dirty = !!draft[r.id];
                  const delta = backtest ? backtest.after.per_rule[r.id] - backtest.before.per_rule[r.id] : 0;
                  return (
                    <li
                      key={r.id}
                      className={cn(
                        "grid items-center gap-3 rounded-xl border px-3 py-2.5 transition sm:grid-cols-[auto_1fr_150px_120px]",
                        dirty ? "border-cyan-300/40 bg-cyan-400/[0.05]" : "border-white/5 bg-white/[0.02]",
                        !eff.enabled && "opacity-50"
                      )}
                    >
                      <button
                        onClick={() => edit(r, { enabled: !eff.enabled })}
                        className={cn("relative h-5 w-9 rounded-full transition", eff.enabled ? "bg-emerald-400/80" : "bg-white/15")}
                        aria-label={eff.enabled ? "Désactiver" : "Activer"}
                      >
                        <span className={cn("absolute top-0.5 size-4 rounded-full bg-white transition-all", eff.enabled ? "left-[18px]" : "left-0.5")} />
                      </button>
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm">
                          <code className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: CATEGORY_COLORS[r.category], background: `${CATEGORY_COLORS[r.category]}1a` }}>
                            {r.id}
                          </code>
                          <span className="truncate">{r.title}</span>
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <div className="h-1 w-24 overflow-hidden rounded-full bg-white/10">
                            <div className="h-full rounded-full" style={{ width: `${(r.hits / maxHits) * 100}%`, background: CATEGORY_COLORS[r.category] }} />
                          </div>
                          <span className="text-[11px] text-muted-foreground">
                            {r.hits} dossier(s) · {Math.round(r.hit_rate * 100)} %
                          </span>
                          {backtest && delta !== 0 && (
                            <span className={cn("text-[11px] font-semibold", delta > 0 ? "text-amber-300" : "text-emerald-300")}>
                              {delta > 0 ? "+" : ""}
                              {delta} après
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={0}
                          max={50}
                          value={eff.weight}
                          onChange={(e) => edit(r, { weight: Number(e.target.value) })}
                          className="w-full accent-cyan-300"
                          aria-label={`Poids de ${r.id}`}
                        />
                        <span className="w-7 text-right text-xs tabular-nums">{eff.weight}</span>
                      </div>
                      <span className="text-right text-[11px] text-muted-foreground">défaut {r.default_weight}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5 xl:sticky xl:top-24 xl:self-start">
          <Card className={cn(changed > 0 && "ring-1 ring-cyan-300/40")}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <FlaskConical className="size-4 text-cyan-300" /> Simulation d&apos;impact (backtest)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                {changed === 0
                  ? "Modifiez une règle (activation ou poids) pour simuler son effet sur tout le portefeuille avant de l'appliquer."
                  : `${changed} modification(s) en attente.`}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={simulate}
                  disabled={changed === 0 || running}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-cyan-300/40 bg-cyan-400/10 py-2 text-xs font-semibold text-cyan-100 disabled:opacity-40"
                >
                  {running ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} Simuler
                </button>
                <button
                  onClick={apply}
                  disabled={changed === 0 || saving}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-400 to-indigo-500 py-2 text-xs font-semibold text-slate-950 disabled:opacity-40"
                >
                  {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Appliquer
                </button>
                <button
                  onClick={() => {
                    setDraft({});
                    setBacktest(null);
                  }}
                  disabled={changed === 0}
                  className="rounded-lg border border-white/10 px-2.5 text-muted-foreground disabled:opacity-40"
                  title="Annuler"
                >
                  <RotateCcw className="size-3.5" />
                </button>
              </div>
              {backtest && (
                <div className="space-y-3 animate-fade-up">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="text-left font-normal">Niveau</th>
                        <th className="text-right font-normal">Avant</th>
                        <th className="text-right font-normal">Après</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(["high", "medium", "low", "none"] as const).map((lvl) => {
                        const d = backtest.after.levels[lvl] - backtest.before.levels[lvl];
                        return (
                          <tr key={lvl} className="border-t border-white/5">
                            <td className="py-1.5" style={{ color: LEVEL_META[lvl].color }}>
                              {LEVEL_META[lvl].label}
                            </td>
                            <td className="text-right tabular-nums">{backtest.before.levels[lvl]}</td>
                            <td className="text-right tabular-nums">
                              {backtest.after.levels[lvl]}
                              {d !== 0 && <span className={cn("ml-1", d > 0 ? "text-amber-300" : "text-emerald-300")}>({d > 0 ? "+" : ""}{d})</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {[
                    ["Nouveaux dossiers à risque élevé", backtest.newly_flagged, "text-amber-200"],
                    ["Ne seraient plus signalés", backtest.no_longer_flagged, "text-emerald-200"],
                  ].map(([label, ids, tone]) =>
                    (ids as string[]).length ? (
                      <div key={label as string}>
                        <p className="text-[11px] text-muted-foreground">{label as string}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(ids as string[]).map((id) => (
                            <Link key={id} href={`/dossiers/${id}`} className={cn("rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] hover:underline", tone as string)}>
                              {id}
                            </Link>
                          ))}
                        </div>
                      </div>
                    ) : null
                  )}
                  <p className="text-[11px] text-muted-foreground">Calculé sur {backtest.dossiers} dossiers, sans rien modifier.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Users className="size-4 text-fuchsia-300" /> Base mutualisée (fédération)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-xs text-muted-foreground">
                Les compagnies partagent les identifiants frauduleux <b className="text-foreground">pseudonymisés (HMAC-SHA256)</b> : la base centrale ne contient ni
                téléphone, ni CIN, ni plaque en clair — conforme au principe de minimisation des données.
              </p>
              {fed ? (
                <>
                  <ul className="space-y-1.5">
                    {Object.entries(fed.by_company).map(([company, n]) => (
                      <li key={company} className="flex items-center gap-2 text-xs">
                        <span className="min-w-0 flex-1 truncate">
                          {company}
                          {company === fed.own_company && <span className="text-cyan-300"> (vous)</span>}
                        </span>
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
                          <div className="h-full rounded-full bg-fuchsia-400" style={{ width: `${(n / fed.total) * 100}%` }} />
                        </div>
                        <span className="w-6 text-right tabular-nums text-muted-foreground">{n}</span>
                      </li>
                    ))}
                  </ul>
                  <ul className="space-y-1 border-t border-white/5 pt-2">
                    {fed.recent.slice(0, 5).map((e, i) => (
                      <li key={i} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <code className="text-fuchsia-200">{e.hash}</code>
                        <span>{e.kind}</span>
                        <span className="min-w-0 flex-1 truncate text-right">{e.reason}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <Skeleton className="h-24" />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Code2 className="size-4 text-cyan-300" /> API SaaS — contrôle temps réel depuis le SI d&apos;un assureur
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-3 text-[11px] leading-relaxed text-cyan-100">
              {`curl -X POST ${API_BASE_URL}/api/v1/fraud/check \\
  -H "X-API-Key: <votre-clé>" \\
  -H "Content-Type: application/json" \\
  -d @sinistre.json`}
            </pre>
            <label className="flex items-center gap-2 text-xs">
              <KeyRound className="size-3.5 text-muted-foreground" />
              <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="h-8 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 font-mono text-xs outline-none" />
            </label>
            <textarea
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              rows={14}
              spellCheck={false}
              className="w-full rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-[11px] outline-none focus:border-cyan-300/50"
            />
            <button
              onClick={callApi}
              disabled={calling}
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-400 to-indigo-500 px-4 py-2 text-xs font-semibold text-slate-950 disabled:opacity-40"
            >
              {calling ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} Envoyer la requête
            </button>
          </div>
          <div className="min-w-0">
            {!apiResult ? (
              <EmptyState>La réponse de l&apos;API s&apos;affichera ici (indice de fraude, règles déclenchées, signalements mutualisés, recommandation).</EmptyState>
            ) : (
              <div className="space-y-2 animate-fade-up">
                <p className="flex items-center gap-3 text-xs">
                  <span className={cn("rounded-full px-2 py-0.5 font-semibold", apiResult.status === 200 ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300")}>
                    HTTP {apiResult.status}
                  </span>
                  <span className="text-muted-foreground">{apiResult.ms} ms</span>
                </p>
                <pre className="max-h-[440px] overflow-auto rounded-xl border border-white/10 bg-black/40 p-3 text-[11px] leading-relaxed">
                  {JSON.stringify(apiResult.body, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      {isLoading && !data && <p className="text-center text-xs text-muted-foreground">Chargement…</p>}
    </main>
  );
}
