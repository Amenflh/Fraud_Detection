import { API_BASE_URL, authedFetch } from "./api";

export const CASES: Record<number, string> = {
  1: "était en stationnement / à l'arrêt",
  2: "quittait un stationnement / ouvrait une portière",
  3: "prenait un stationnement",
  4: "sortait d'un parking, d'un lieu privé, d'un chemin de terre",
  5: "s'engageait dans un parking, un lieu privé, un chemin de terre",
  6: "s'engageait sur une place à sens giratoire",
  7: "roulait sur une place à sens giratoire",
  8: "heurtait à l'arrière, même sens et même file",
  9: "roulait dans le même sens et sur une file différente",
  10: "changeait de file",
  11: "doublait",
  12: "virait à droite",
  13: "virait à gauche",
  14: "reculait",
  15: "empiétait sur la voie de circulation inverse",
  16: "venait de droite (dans un carrefour)",
  17: "n'avait pas observé un signal de priorité ou un feu rouge",
};

export const ZONES = [
  { key: "avant", label: "Avant" },
  { key: "arriere", label: "Arrière" },
  { key: "gauche", label: "Côté gauche" },
  { key: "droite", label: "Côté droit" },
  { key: "toit", label: "Toit" },
];

export interface Party {
  name: string;
  phone: string;
  cin?: string | null;
  email?: string | null;
  address?: string | null;
  policy_id?: string | null;
  insurer?: string | null;
  plate: string;
  make_model: string;
  cases: number[];
  damage: string[];
  observations?: string | null;
}

export interface Witness {
  name: string;
  phone?: string | null;
}

export interface CoherenceFlag {
  code: string;
  level: "high" | "medium" | "low";
  text: string;
}

export interface Responsibility {
  a: number;
  b: number;
  rule: string;
  contradiction: boolean;
}

export interface Extraction {
  source: "llm" | "rules";
  cases_a: number[];
  cases_b_hint: number[];
  damage_a: string[];
  summary: string;
}

export type ConstatStatus = "attente_conducteur_b" | "attente_signature_a" | "signe" | "converti";

export interface Constat {
  id: string;
  token: string;
  status: ConstatStatus;
  created_at: string;
  accident_at: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
  city: string;
  party_a: Party;
  party_b: Party | null;
  witnesses: Witness[];
  transcript_a: string | null;
  signed_a: boolean;
  signed_b: boolean;
  analysis: { extraction?: Extraction; responsibility?: Responsibility; coherence?: CoherenceFlag[] };
  seal: string | null;
  dossier_id: string | null;
  files: { id: number; party: string; kind: string; content_type: string; at: string }[];
}

export interface PublicConstat {
  id: string;
  status: ConstatStatus;
  accident_at: string;
  address: string | null;
  city: string;
  lat: number | null;
  lng: number | null;
  vehicle_a: { plate: string; make_model: string; insurer: string | null };
  cases_a: number[];
  damage_a: string[];
  signed_b: boolean;
}

export interface ContractInfo {
  policy_id: string;
  holder_name: string;
  phone: string;
  cin: string | null;
  email: string | null;
  plate: string;
  make_model: string;
  year: number | null;
  insurer: string;
  start_date: string;
  end_date: string;
  valid: boolean;
}

export interface SignaturePayload {
  image: string;
  lat?: number | null;
  lng?: number | null;
}

export const CONSTAT_STATUS: Record<ConstatStatus, { label: string; color: string }> = {
  attente_conducteur_b: { label: "En attente du conducteur B", color: "#fbbf24" },
  attente_signature_a: { label: "En attente de votre signature", color: "#22d3ee" },
  signe: { label: "Signé par les deux parties", color: "#34d399" },
  converti: { label: "Transformé en dossier", color: "#a78bfa" },
};

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : `Erreur ${res.status}`);
  }
  return res.json();
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

// --- driver A (authenticated app) ---
export const lookupContract = (policyId: string, plate: string) =>
  authedFetch(`/contracts/lookup?policy_id=${encodeURIComponent(policyId)}&plate=${encodeURIComponent(plate)}`).then((r) =>
    json<ContractInfo>(r)
  );

export const createConstat = (body: {
  accident_at: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
  city: string;
  party_a: Party;
  transcript_a: string | null;
  witnesses: Witness[];
}) => authedFetch("/constats", post(body)).then((r) => json<Constat>(r));

export const listConstats = () => authedFetch("/constats", { cache: "no-store" }).then((r) => json<Constat[]>(r));
export const getConstat = (id: string) => authedFetch(`/constats/${id}`, { cache: "no-store" }).then((r) => json<Constat>(r));
export const signConstat = (id: string, sig: SignaturePayload) => authedFetch(`/constats/${id}/sign`, post(sig)).then((r) => json<Constat>(r));
export const convertConstat = (id: string, claimAmount: number, garageId: string | null) =>
  authedFetch(`/constats/${id}/convert`, post({ claim_amount: claimAmount, garage_id: garageId })).then((r) => json<{ dossier_id: string }>(r));

export function uploadConstatFile(id: string, file: Blob, filename: string, kind: "photo" | "vocal") {
  const form = new FormData();
  form.append("file", file, filename);
  form.append("kind", kind);
  return authedFetch(`/constats/${id}/files`, { method: "POST", body: form }).then((r) => json<unknown>(r));
}

// --- public (driver B, no account) ---
export const extractCircumstances = (text: string) =>
  fetch(`${API_BASE_URL}/public/extract`, post({ text })).then((r) => json<Extraction>(r));

export const getPublicConstat = (token: string) =>
  fetch(`${API_BASE_URL}/public/constats/${token}`, { cache: "no-store" }).then((r) => json<PublicConstat>(r));

export const submitPartyB = (token: string, party_b: Party, signature: SignaturePayload) =>
  fetch(`${API_BASE_URL}/public/constats/${token}/party-b`, post({ party_b, signature })).then((r) => json<PublicConstat>(r));

export function currentPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });
}

/** Downloads the constat as a PDF (a watermarked draft until both drivers have signed). */
export async function downloadConstatPdf(id: string): Promise<void> {
  const res = await authedFetch(`/constats/${id}/pdf`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.detail === "string" ? body.detail : `Erreur ${res.status}`);
  }
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `constat-${id}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}

export interface Verification {
  id: string;
  sealed: boolean;
  valid: boolean;
  reason?: string;
  content_unaltered?: boolean;
  signatures_unaltered?: boolean;
  seal_matches_document?: boolean;
  accident_at?: string;
  signed_at_a?: string;
  signed_at_b?: string;
}

export const verifyConstat = (id: string, seal: string | null) =>
  fetch(`${API_BASE_URL}/public/verify/${encodeURIComponent(id)}${seal ? `?seal=${encodeURIComponent(seal)}` : ""}`, { cache: "no-store" }).then((r) =>
    json<Verification>(r)
  );
