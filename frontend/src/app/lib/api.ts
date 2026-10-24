import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ClaimInput, ClaimsList, ClaimsStats, FraudVerdict, HealthStatus } from "./types";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

export async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);

  if (isSupabaseConfigured()) {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers.set("Authorization", `Bearer ${session.access_token}`);
    }
  }

  return fetch(`${API_BASE_URL}${path}`, { ...init, headers });
}

export async function analyzeClaim(claim: ClaimInput): Promise<FraudVerdict> {
  const res = await authedFetch("/claims/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ claim }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Erreur ${res.status}`);
  }
  const data = await res.json();
  return data.verdict;
}

export async function getStats(): Promise<ClaimsStats> {
  const res = await authedFetch("/stats", { cache: "no-store" });
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
  const data = await res.json();
  return data.stats;
}

export async function listClaims(limit = 50): Promise<ClaimsList> {
  const res = await authedFetch(`/claims?limit=${limit}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
  return res.json();
}

export async function getHealth(): Promise<HealthStatus> {
  const res = await fetch(`${API_BASE_URL}/health`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
  return res.json();
}

// Fired after a successful analysis so live widgets (KPIs, feed, dashboard) refresh at once.
export const CLAIMS_UPDATED_EVENT = "claims:updated";
