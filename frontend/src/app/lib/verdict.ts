import { Eye, ShieldAlert, ShieldCheck, type LucideIcon } from "lucide-react";
import { FraudVerdict } from "./types";

export type Verdict = FraudVerdict["final_verdict"];

export const VERDICT_META: Record<
  Verdict,
  { label: string; short: string; text: string; bg: string; ring: string; hex: string; icon: LucideIcon }
> = {
  fraud: {
    label: "Fraude détectée",
    short: "Fraude",
    text: "text-red-400",
    bg: "bg-red-500/10",
    ring: "ring-red-400/30",
    hex: "#f87171",
    icon: ShieldAlert,
  },
  needs_human_review: {
    label: "Révision humaine requise",
    short: "Révision",
    text: "text-amber-300",
    bg: "bg-amber-400/10",
    ring: "ring-amber-300/30",
    hex: "#fbbf24",
    icon: Eye,
  },
  not_fraud: {
    label: "Aucune fraude détectée",
    short: "Sain",
    text: "text-emerald-400",
    bg: "bg-emerald-500/10",
    ring: "ring-emerald-400/30",
    hex: "#34d399",
    icon: ShieldCheck,
  },
};

/** Risk color scale shared by the gauge, histogram and badges. */
export function riskHex(score: number): string {
  if (score >= 0.7) return "#f87171";
  if (score >= 0.42) return "#fbbf24";
  return "#34d399";
}
