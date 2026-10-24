"use client";

import { AlertTriangle, CheckCircle2, FileText, Wrench } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { FraudVerdict } from "../lib/types";
import { VERDICT_META } from "../lib/verdict";
import RiskGauge from "./RiskGauge";

export default function VerdictCard({ verdict }: { verdict: FraudVerdict }) {
  const meta = VERDICT_META[verdict.final_verdict];
  const Icon = meta.icon;
  const flags = verdict.investigation.red_flags;

  return (
    <Card className={cn("relative ring-1 animate-fade-up", meta.ring)}>
      <div className="absolute -top-20 left-1/2 size-48 -translate-x-1/2 rounded-full blur-3xl" style={{ background: `${meta.hex}33` }} />
      <CardContent className="relative space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className={cn("grid size-11 place-items-center rounded-xl ring-1", meta.bg, meta.ring)}>
              <Icon className={cn("size-6", meta.text)} />
            </span>
            <div>
              <p className={cn("text-lg font-semibold", meta.text)}>{meta.label}</p>
              <p className="font-mono text-xs text-muted-foreground">{verdict.claim_id}</p>
            </div>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-muted-foreground">
            modèle : {verdict.risk_assessment.model_used}
          </span>
        </div>

        <div className="grid items-center gap-5 sm:grid-cols-2">
          <RiskGauge score={verdict.risk_assessment.risk_score} />
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Confiance de la décision</span>
              <span className="tabular-nums text-foreground">{Math.round(verdict.confidence * 100)} %</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-indigo-400 transition-all duration-1000"
                style={{ width: `${verdict.confidence * 100}%` }}
              />
            </div>
            <p className="pt-2 text-xs text-muted-foreground">
              {verdict.risk_assessment.is_anomaly ? "⚠ Anomalie statistique détectée" : "Profil statistiquement cohérent"}
            </p>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Signaux d&apos;alerte</p>
          {flags.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-emerald-300/90">
              <CheckCircle2 className="size-4" /> Aucun signal relevé
            </p>
          ) : (
            <ul className="space-y-1.5">
              {flags.map((flag, i) => (
                <li
                  key={flag}
                  className="flex items-start gap-2 rounded-lg bg-red-500/5 px-3 py-2 text-sm ring-1 ring-red-400/15 animate-fade-up"
                  style={{ animationDelay: `${300 + i * 120}ms` }}
                >
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-300" />
                  {flag}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            <FileText className="size-3.5" /> Rapport
          </p>
          <p className="text-sm leading-relaxed">{verdict.report}</p>
          <p className="mt-3 text-xs text-muted-foreground/80">{verdict.investigation.summary}</p>
        </div>

        {verdict.investigation.tool_calls_made.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Wrench className="size-3.5" /> Outils consultés :
            {verdict.investigation.tool_calls_made.map((t) => (
              <code key={t} className="rounded bg-white/5 px-1.5 py-0.5 text-cyan-200/80">
                {t}
              </code>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
