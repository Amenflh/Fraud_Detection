import {
  Ban,
  CheckCircle2,
  ClipboardCheck,
  FileInput,
  Bot,
  Search,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Role, StatusKey } from "./dossiers";

export const CURRENCY = "DT";

export const formatAmount = (v: number) => `${Math.round(v).toLocaleString("fr-FR")} ${CURRENCY}`;

export const STAGES: { key: StatusKey; label: string; icon: LucideIcon; color: string }[] = [
  { key: "declare", label: "Déclaré", icon: FileInput, color: "#94a3b8" },
  { key: "analyse_ia", label: "Analyse IA", icon: Bot, color: "#22d3ee" },
  { key: "expert_missionne", label: "Expertise", icon: Search, color: "#818cf8" },
  { key: "validation_devis", label: "Validation devis", icon: ClipboardCheck, color: "#c084fc" },
  { key: "en_reparation", label: "En réparation", icon: Wrench, color: "#fbbf24" },
  { key: "cloture", label: "Clôturé", icon: CheckCircle2, color: "#34d399" },
];
export const REJECTED = { key: "rejete" as StatusKey, label: "Rejeté (fraude)", icon: Ban, color: "#f87171" };

type StageMeta = { label: string; icon: LucideIcon; color: string };
export const STAGE_META = Object.fromEntries([...STAGES, REJECTED].map((s) => [s.key, s])) as unknown as Record<StatusKey, StageMeta>;

export const ROLE_META: Record<Role | "ia", { label: string; color: string }> = {
  gestionnaire: { label: "Gestionnaire", color: "#22d3ee" },
  assure: { label: "Assuré", color: "#34d399" },
  agent: { label: "Agent", color: "#a78bfa" },
  expert: { label: "Expert", color: "#818cf8" },
  garage: { label: "Garage", color: "#fbbf24" },
  ia: { label: "IA", color: "#f472b6" },
};

export const INCIDENT_LABELS: Record<string, string> = {
  collision: "Collision",
  theft: "Vol",
  fire: "Incendie",
  vandalism: "Vandalisme",
  other: "Autre",
};

export const DOCUMENT_KINDS: Record<string, string> = {
  photo_avant: "Photo face avant",
  photo_arriere: "Photo face arrière",
  photo_gauche: "Photo côté gauche",
  photo_droite: "Photo côté droit",
  photo: "Photo",
  constat: "Constat amiable",
  devis: "Devis garage",
  rapport_expertise: "Rapport d'expertise",
  facture: "Facture",
  autre: "Document",
};

/** Hours spent in the current stage and SLA usage ratio (null when the stage has no SLA). */
export function slaState(stageEnteredAt: string, slaHours: number | null, now: Date | null) {
  if (!now) return { hours: 0, ratio: null as number | null };
  const hours = (now.getTime() - new Date(stageEnteredAt + "Z").getTime()) / 3_600_000;
  return { hours, ratio: slaHours ? hours / slaHours : null };
}

export function formatDuration(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${(hours / 24).toFixed(1).replace(".", ",")} j`;
}

export const formatDateTime = (iso: string) =>
  new Date(iso.endsWith("Z") ? iso : iso + "Z").toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
