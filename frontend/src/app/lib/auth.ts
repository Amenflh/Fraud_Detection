import { authedFetch } from "./api";

export type AppRole = "gestionnaire" | "agent" | "expert" | "garage" | "assure";

export interface Me {
  id: string;
  email: string;
  role: AppRole;
  actor_id: string | null;
  actor_name: string | null;
}

export const ROLE_LABELS: Record<AppRole, string> = {
  gestionnaire: "Gestionnaire",
  agent: "Agent",
  expert: "Expert",
  garage: "Garage",
  assure: "Assuré",
};

const STAFF: AppRole[] = ["gestionnaire", "agent"];
const ALL: AppRole[] = ["gestionnaire", "agent", "expert", "garage", "assure"];

// Which roles may open which section. Mirrors the API's rules (the API is what enforces them);
// this only decides what the menu shows and where to send people who land on the wrong page.
const PAGE_ACCESS: { prefix: string; roles: AppRole[]; exact?: boolean }[] = [
  { prefix: "/", roles: STAFF, exact: true },
  { prefix: "/dashboard", roles: STAFF },
  { prefix: "/dossiers", roles: ALL },
  { prefix: "/declarer", roles: ["gestionnaire", "agent", "assure"] },
  { prefix: "/constat", roles: ["gestionnaire", "agent", "assure"] },
  { prefix: "/reseau", roles: STAFF },
  { prefix: "/performance", roles: STAFF },
  { prefix: "/regles", roles: STAFF },
];

// Reachable without an account (driver B opens the QR link; anyone may verify a PDF).
export const PUBLIC_PREFIXES = ["/login", "/constat/b/", "/constat/verifier/"];

export const isPublicPath = (pathname: string) => PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

export function canOpen(role: AppRole, pathname: string): boolean {
  const rule = PAGE_ACCESS.find((r) => (r.exact ? pathname === r.prefix : pathname === r.prefix || pathname.startsWith(`${r.prefix}/`)));
  return rule ? rule.roles.includes(role) : true;
}

export const LANDING: Record<AppRole, string> = {
  gestionnaire: "/",
  agent: "/",
  expert: "/dossiers",
  garage: "/dossiers",
  assure: "/declarer",
};

export const isStaff = (role: AppRole | null | undefined) => role === "gestionnaire" || role === "agent";
/** Sees the fraud analysis: back-office and experts (who investigate). Never the insured or garages. */
export const seesFraud = (role: AppRole | null | undefined) => isStaff(role) || role === "expert";

export async function fetchMe(): Promise<Me> {
  const res = await authedFetch("/me", { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = new Error(typeof body.detail === "string" ? body.detail : `Erreur ${res.status}`) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
  return res.json();
}
