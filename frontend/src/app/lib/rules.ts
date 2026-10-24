import { API_BASE_URL, authedFetch } from "./api";

export interface RuleHit {
  id: string;
  category: string;
  category_label: string;
  title: string;
  weight: number;
  evidence: string;
}

export interface ConsortiumHit {
  kind: string;
  kind_label: string;
  company: string;
  reason: string;
  reported_at: string;
}

export interface RulesResult {
  score: number;
  level: "high" | "medium" | "low" | "none";
  fraud_index: number;
  ml_score: number;
  hits: RuleHit[];
  evaluated: number;
  consortium: ConsortiumHit[];
  similar: { dossier_id: string; similarity: number }[];
}

export interface RuleRow {
  id: string;
  category: string;
  category_label: string;
  title: string;
  default_weight: number;
  weight: number;
  enabled: boolean;
  hits: number;
  hit_rate: number;
}

export interface BacktestRun {
  per_rule: Record<string, number>;
  levels: Record<"high" | "medium" | "low" | "none", number>;
  flagged: string[];
}

export interface Backtest {
  dossiers: number;
  before: BacktestRun;
  after: BacktestRun;
  newly_flagged: string[];
  no_longer_flagged: string[];
}

export interface ConsortiumStats {
  total: number;
  companies: number;
  by_company: Record<string, number>;
  by_kind: Record<string, number>;
  recent: { hash: string; kind: string; company: string; reason: string; reported_at: string }[];
  own_company: string;
}

export const LEVEL_META: Record<RulesResult["level"], { label: string; color: string }> = {
  high: { label: "Risque élevé", color: "#f87171" },
  medium: { label: "Risque modéré", color: "#fbbf24" },
  low: { label: "Signaux faibles", color: "#22d3ee" },
  none: { label: "Aucun signal", color: "#34d399" },
};

export const DEMO_API_KEY = "demo-saas-key";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : `Erreur ${res.status}`);
  }
  return res.json();
}

export const listRules = () => authedFetch("/rules", { cache: "no-store" }).then((r) => json<{ rules: RuleRow[]; total: number; enabled: number }>(r));

export const updateRule = (id: string, patch: { enabled?: boolean; weight?: number }) =>
  authedFetch(`/rules/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }).then((r) =>
    json<{ rule: RuleRow }>(r)
  );

export const backtestRules = (overrides: Record<string, { enabled?: boolean; weight?: number }>) =>
  authedFetch("/rules/backtest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ overrides }) }).then((r) =>
    json<Backtest>(r)
  );

export const getConsortium = () => authedFetch("/consortium", { cache: "no-store" }).then((r) => json<ConsortiumStats>(r));

export function saasCheck(body: unknown, apiKey: string) {
  return fetch(`${API_BASE_URL}/api/v1/fraud/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
}
