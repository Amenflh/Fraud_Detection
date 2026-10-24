import { authedFetch } from "./api";
import type { CoherenceFlag, Responsibility } from "./constat";
import type { RulesResult } from "./rules";
import { FraudVerdict } from "./types";

export type Role = "gestionnaire" | "assure" | "agent" | "expert" | "garage";
export type StatusKey =
  | "declare"
  | "analyse_ia"
  | "expert_missionne"
  | "validation_devis"
  | "en_reparation"
  | "cloture"
  | "rejete";

export interface Actor {
  id: string;
  role: string;
  name: string;
  city: string;
  specialties: string[];
  phone: string | null;
  rating: number;
}

export interface DossierSummary {
  id: string;
  status: StatusKey;
  status_label: string;
  created_at: string;
  updated_at: string;
  stage_entered_at: string;
  sla_hours: number | null;
  city: string;
  insured_name: string;
  plate: string;
  make_model: string;
  incident_type: string;
  claim_amount: number;
  quote_amount: number | null;
  risk_score: number | null;
  verdict: FraudVerdict["final_verdict"] | null;
  expert_name: string | null;
  garage_name: string | null;
  network_level: "none" | "medium" | "high";
  alerts: number;
  fraud_index: number | null;
  rules_level: RulesResult["level"];
  from_constat: string | null;
}

export interface Flag {
  level: "high" | "medium" | "info";
  text: string;
}

export interface DispatchSuggestion {
  expert_id: string;
  name: string;
  city: string;
  score: number;
  workload: number;
  reasons: string[];
}

export interface QuoteAnalysis {
  amount: number;
  declared: number;
  reference: number;
  typical_ratio: number;
  basis: string;
  ratio: number;
  comparables: number;
  level: "ok" | "warning" | "high";
  flags: string[];
  potential_saving: number;
}

export interface NetworkLink {
  dossier_id: string;
  shared: string[];
  verdict: string | null;
  status: string;
}

export interface Copilot {
  source: "llm" | "rules";
  summary: string;
  next_action: string;
  sms: string;
  priority: string;
}

export interface DossierEvent {
  id: number;
  at: string;
  kind: "status_change" | "assignment" | "document" | "alert" | "agent";
  role: string;
  label: string;
  payload: Record<string, unknown>;
}

export interface ChatMessage {
  id: number;
  at: string;
  role: Role;
  author: string;
  text: string;
}

export interface DossierDocument {
  id: number;
  at: string;
  role: string;
  kind: string;
  filename: string;
  content_type: string;
  analysis: {
    verdict?: "ok" | "suspect";
    flags?: Flag[];
    taken_at?: string | null;
    duplicates?: { dossier_id: string; document_id: number; distance: number }[];
    quote?: QuoteAnalysis;
    gps?: { lat: number; lng: number } | null;
    comparison?: {
      verdict: "choc_detecte" | "aucun_choc" | "vehicule_different";
      changed_ratio: number;
      color_delta: number;
      zones: { zone: string; intensity: number }[];
      reference_id: number;
      flags: Flag[];
    };
  };
}

export interface DossierDetail extends DossierSummary {
  claim: {
    policy_id: string;
    claim_amount: number;
    claim_date: string;
    incident_type: string;
    days_since_policy_start: number;
    prior_claims_count: number;
    vehicle_age: number | null;
    claim_description: string | null;
  };
  insured: { name: string; phone: string; email: string | null; cin: string | null };
  vehicle: { plate: string; make_model: string; year: number | null };
  address: string | null;
  agent: Actor | null;
  expert: Actor | null;
  garage: Actor | null;
  fraud: FraudVerdict | null;
  ai: {
    channel?: string;
    network: { level: "none" | "medium" | "high"; links: NetworkLink[]; summary: string };
    dispatch: DispatchSuggestion[];
    copilot?: Copilot;
    quote?: QuoteAnalysis;
    llm_fallback?: boolean;
    rules?: RulesResult;
    constat?: {
      id: string;
      seal: string | null;
      responsibility: Responsibility | null;
      coherence: CoherenceFlag[];
      third_parties: { role: string; name: string; phone?: string | null; cin?: string | null; plate?: string | null }[];
      transcript: string | null;
      accident_at: string;
      signed_b: boolean;
    };
  };
  allowed_next: StatusKey[];
  events: DossierEvent[];
  messages: ChatMessage[];
  documents: DossierDocument[];
}

export interface DossierCreate {
  policy_id: string;
  claim_amount: number;
  claim_date: string;
  incident_type: string;
  days_since_policy_start: number;
  prior_claims_count: number;
  vehicle_age?: number | null;
  claim_description?: string | null;
  insured: { name: string; phone: string; email?: string | null; cin?: string | null };
  vehicle: { plate: string; make_model: string; year?: number | null };
  city: string;
  address?: string | null;
  garage_id?: string | null;
  channel: "mobile" | "agence" | "papier";
}

export interface StageKpi {
  key: StatusKey;
  label: string;
  owner: string;
  sla_hours: number | null;
  avg_hours: number | null;
  completed: number;
  open: number;
  sla_rate: number | null;
}

export interface PartnerKpi {
  id: string;
  name: string;
  city: string;
  rating: number;
  dossiers: number;
  open: number;
  avg_hours: number | null;
  sla_rate: number | null;
  suspicious: number;
  avg_quote_ratio: number | null;
  flagged_quotes: number;
}

export interface WorkflowKpis {
  generated_at: string;
  totals: {
    dossiers: number;
    open: number;
    closed: number;
    rejected: number;
    overdue: number;
    avg_cycle_hours: number | null;
    blocked_amount: number;
    quote_savings: number;
    fast_track_rate: number;
  };
  stages: StageKpi[];
  overdue: { dossier_id: string; stage: StatusKey; stage_label: string; hours: number; sla_hours: number; owner: string }[];
  experts: PartnerKpi[];
  garages: PartnerKpi[];
  trend: { date: string; created: number; suspicious: number; closed: number }[];
}

export interface NetworkGraph {
  nodes: {
    id: string;
    type: "dossier" | "phone" | "email" | "cin" | "plate" | "garage" | "tiers";
    label: string;
    verdict?: string | null;
    risk?: number | null;
    insured?: string;
  }[];
  edges: { source: string; target: string; kind: string }[];
}

// Fired after any dossier mutation so lists/boards refresh immediately.
export const DOSSIERS_UPDATED_EVENT = "dossiers:updated";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : `Erreur ${res.status}`);
  }
  return res.json();
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const listDossiers = () =>
  authedFetch("/dossiers", { cache: "no-store" }).then((r) => json<{ dossiers: DossierSummary[]; total: number }>(r));

export const getDossier = (id: string) =>
  authedFetch(`/dossiers/${id}`, { cache: "no-store" }).then((r) => json<DossierDetail>(r));

export const createDossier = (payload: DossierCreate) =>
  authedFetch("/dossiers", jsonInit("POST", payload)).then((r) => json<DossierDetail>(r));

export const advanceDossier = (id: string, status: StatusKey, role: Role, note?: string) =>
  authedFetch(`/dossiers/${id}/advance`, jsonInit("POST", { status, role, note })).then((r) => json<DossierDetail>(r));

export const assignExpert = (id: string, expertId: string, role: Role = "gestionnaire") =>
  authedFetch(`/dossiers/${id}/assign-expert`, jsonInit("POST", { expert_id: expertId, role })).then((r) =>
    json<DossierDetail>(r)
  );

export const listMessages = (id: string) =>
  authedFetch(`/dossiers/${id}/messages`, { cache: "no-store" }).then((r) => json<ChatMessage[]>(r));

export const postMessage = (id: string, role: Role, text: string) =>
  authedFetch(`/dossiers/${id}/messages`, jsonInit("POST", { role, text })).then((r) => json<ChatMessage>(r));

export function uploadDocument(id: string, file: Blob, filename: string, kind: string, role: Role, amount?: number) {
  const form = new FormData();
  form.append("file", file, filename);
  form.append("kind", kind);
  form.append("role", role);
  if (amount !== undefined) form.append("amount", String(amount));
  return authedFetch(`/dossiers/${id}/documents`, { method: "POST", body: form }).then((r) => json<DossierDocument>(r));
}

export const fetchDocumentBlob = (docId: number) =>
  authedFetch(`/documents/${docId}/file`).then((r) => {
    if (!r.ok) throw new Error(`Erreur ${r.status}`);
    return r.blob();
  });

export const listActors = (role?: string) =>
  authedFetch(`/actors${role ? `?role=${role}` : ""}`, { cache: "no-store" }).then((r) => json<Actor[]>(r));

export const getWorkflowKpis = () =>
  authedFetch("/kpis/workflow", { cache: "no-store" }).then((r) => json<WorkflowKpis>(r));

export const getNetwork = () => authedFetch("/network", { cache: "no-store" }).then((r) => json<NetworkGraph>(r));
