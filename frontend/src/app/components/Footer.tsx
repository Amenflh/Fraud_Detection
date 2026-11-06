"use client";

import { Activity, BrainCircuit, Camera, Coins, Cpu, Database, FileSignature, FolderKanban, Gavel, Layers, ListChecks, Lock, Mail, MessageSquare, Mic, Network, ScanSearch, Scale, Search, Sparkles, Truck, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { timeAgo, useNow } from "../lib/hooks";
import Brand from "./Brand";
import { useHealth } from "./HealthProvider";

const AGENTS: { label: string; icon: LucideIcon }[] = [
  { label: "Preprocessing", icon: Database },
  { label: "Risk Analyst (ML)", icon: Cpu },
  { label: "Investigator (LLM)", icon: Search },
  { label: "Decision (LLM)", icon: Gavel },
  { label: "Photo Forensics", icon: Camera },
  { label: "Devis", icon: Coins },
  { label: "Dispatch expert", icon: Truck },
  { label: "Réseau", icon: Network },
  { label: "Copilote", icon: Sparkles },
  { label: "Circonstances (vocal → cases)", icon: Mic },
  { label: "Responsabilité (barème)", icon: Scale },
  { label: "Dommages (vs souscription)", icon: Layers },
];

const STACK = ["FastAPI", "LangGraph", "XGBoost", "IsolationForest", "Next.js", "Supabase"];

function StatusRow({ label, ok, icon: Icon, text }: { label: string; ok: boolean | null; icon: LucideIcon; text?: [string, string] }) {
  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </span>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[11px] font-medium",
          ok === null ? "bg-white/5 text-muted-foreground" : ok ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"
        )}
      >
        {ok === null ? "…" : ok ? (text?.[0] ?? "Opérationnel") : (text?.[1] ?? "Indisponible")}
      </span>
    </li>
  );
}

export default function Footer() {
  const { health, online, checkedAt } = useHealth();
  const now = useNow();

  return (
    <footer className="mt-auto border-t border-white/10 bg-background/55 backdrop-blur-xl">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:px-6 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-4">
          <Brand />
          <p className="text-sm text-muted-foreground">
            Triage intelligent des sinistres auto : un score ML, une enquête par agents IA, et une décision
            expliquée — l&apos;humain garde la main sur les cas ambigus.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {STACK.map((t) => (
              <span key={t} className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-muted-foreground">
                {t}
              </span>
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-cyan-300/80">Navigation</h3>
          <ul className="space-y-2.5 text-sm">
            <li>
              <Link href="/" className="flex items-center gap-2 text-muted-foreground transition hover:text-foreground">
                <ScanSearch className="size-3.5" /> Analyser un sinistre
              </Link>
            </li>
            <li>
              <Link href="/dossiers" className="flex items-center gap-2 text-muted-foreground transition hover:text-foreground">
                <FolderKanban className="size-3.5" /> Dossiers sinistres
              </Link>
            </li>
            <li>
              <Link href="/constat" className="flex items-center gap-2 text-muted-foreground transition hover:text-foreground">
                <FileSignature className="size-3.5" /> e-Constat
              </Link>
            </li>
            <li>
              <Link href="/regles" className="flex items-center gap-2 text-muted-foreground transition hover:text-foreground">
                <ListChecks className="size-3.5" /> Moteur de règles & API
              </Link>
            </li>
            <li>
              <Link href="/performance" className="flex items-center gap-2 text-muted-foreground transition hover:text-foreground">
                <Activity className="size-3.5" /> Performance
              </Link>
            </li>
            <li>
              <Link href="/dashboard" className="flex items-center gap-2 text-muted-foreground transition hover:text-foreground">
                <BrainCircuit className="size-3.5" /> Tableau de bord
              </Link>
            </li>
            <li>
              <a
                href={`${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000"}/docs`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-muted-foreground transition hover:text-foreground"
              >
                <Database className="size-3.5" /> Documentation API
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-cyan-300/80">12 agents IA + 45 règles</h3>
          <ol className="relative grid grid-cols-1 gap-2.5 border-l border-white/10 pl-5">
            {AGENTS.map(({ label, icon: Icon }, i) => (
              <li key={label} className="relative flex items-center gap-2 text-sm text-muted-foreground">
                <span
                  className="absolute -left-[25px] size-2 rounded-full bg-cyan-300 animate-pulse"
                  style={{ animationDelay: `${i * 220}ms` }}
                />
                <Icon className="size-3.5 text-cyan-300/70" />
                {label}
              </li>
            ))}
          </ol>
        </div>

        <div>
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-cyan-300/80">État du système</h3>
          <ul className="space-y-2.5">
            <StatusRow label="API backend" ok={online} icon={Database} />
            <StatusRow label="Modèle ML" ok={health ? health.model_trained : online === false ? false : null} icon={Cpu} />
            <StatusRow label="Agents LLM" ok={health ? health.openai_configured : online === false ? false : null} icon={BrainCircuit} />
            <StatusRow label="Authentification" ok={health ? health.supabase_auth_configured : online === false ? false : null} icon={Lock} />
            <StatusRow label="E-mail" ok={health ? Boolean(health.email_configured) : online === false ? false : null} icon={Mail} text={["SMTP actif", "Simulé"]} />
            <StatusRow label="SMS" ok={health ? Boolean(health.sms_configured) : online === false ? false : null} icon={MessageSquare} text={["Twilio actif", "Simulé"]} />
          </ul>
          <p className="mt-3 text-[11px] text-muted-foreground/70">Dernière vérification {timeAgo(checkedAt, now)}</p>
        </div>
      </div>

      <div className="border-t border-white/5">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-muted-foreground/70 sm:flex-row sm:px-6">
          <span>© {now?.getFullYear() ?? ""} Sentinelle — projet de démonstration, données d&apos;entraînement Kaggle.</span>
          <span className="flex items-center gap-1.5">
            <Lock className="size-3" /> Accès protégé par authentification JWT (Supabase)
          </span>
        </div>
      </div>
    </footer>
  );
}
