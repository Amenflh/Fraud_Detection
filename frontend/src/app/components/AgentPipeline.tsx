"use client";

import { Check, Cpu, Database, Gavel, Loader2, Search, SkipForward, type LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { FraudVerdict } from "../lib/types";

export type PipelinePhase = "idle" | "running" | "done";

const STEPS: { title: string; detail: string; icon: LucideIcon }[] = [
  { title: "Preprocessing", detail: "Validation & feature engineering", icon: Database },
  { title: "Risk Analyst", detail: "IsolationForest + XGBoost", icon: Cpu },
  { title: "Investigator", detail: "Historique client & signaux (LLM)", icon: Search },
  { title: "Decision", detail: "Verdict final & rapport (LLM)", icon: Gavel },
];

type StepState = "pending" | "active" | "done" | "skipped";

function stepState(i: number, phase: PipelinePhase, activeStep: number, verdict: FraudVerdict | null): StepState {
  if (phase === "idle") return "pending";
  if (phase === "running") return i < activeStep ? "done" : i === activeStep ? "active" : "pending";
  // The Investigator only runs above the risk threshold: no tool calls means it was skipped.
  if (i === 2 && verdict && verdict.investigation.tool_calls_made.length === 0) return "skipped";
  return "done";
}

export default function AgentPipeline({
  phase,
  activeStep,
  verdict,
}: {
  phase: PipelinePhase;
  activeStep: number;
  verdict: FraudVerdict | null;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-xs font-semibold uppercase tracking-widest text-cyan-300/80">Pipeline multi-agents</CardTitle>
        <span className="text-[11px] text-muted-foreground">
          {phase === "idle" ? "En attente" : phase === "running" ? "Analyse en cours…" : "Terminé"}
        </span>
      </CardHeader>
      <CardContent>
        <ol className="relative">
          {STEPS.map(({ title, detail, icon: Icon }, i) => {
            const state = stepState(i, phase, activeStep, verdict);
            return (
              <li key={title} className="relative flex gap-4 pb-5 last:pb-0">
                {i < STEPS.length - 1 && (
                  <span className="absolute left-[17px] top-9 h-[calc(100%-2.25rem)] w-px overflow-hidden bg-white/10">
                    <span
                      className={cn(
                        "absolute inset-x-0 top-0 bg-gradient-to-b from-cyan-300 to-indigo-400 transition-all duration-700",
                        state === "done" || state === "skipped" ? "h-full" : "h-0"
                      )}
                    />
                  </span>
                )}
                <span
                  className={cn(
                    "relative grid size-9 shrink-0 place-items-center rounded-xl ring-1 transition-all duration-500",
                    state === "pending" && "bg-white/5 text-muted-foreground ring-white/10",
                    state === "active" && "bg-cyan-400/15 text-cyan-200 ring-cyan-300/60 shadow-[0_0_24px_rgb(34_211_238/0.45)]",
                    state === "done" && "bg-emerald-400/15 text-emerald-300 ring-emerald-300/40",
                    state === "skipped" && "bg-white/5 text-muted-foreground/60 ring-white/10"
                  )}
                >
                  {state === "active" && <span className="absolute inset-0 rounded-xl ring-1 ring-cyan-300/50 animate-pulse-ring" />}
                  {state === "active" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : state === "done" ? (
                    <Check className="size-4" />
                  ) : state === "skipped" ? (
                    <SkipForward className="size-4" />
                  ) : (
                    <Icon className="size-4" />
                  )}
                </span>
                <div className="pt-1">
                  <p className={cn("text-sm font-medium transition-colors", state === "pending" && "text-muted-foreground")}>{title}</p>
                  <p className="text-xs text-muted-foreground">
                    {state === "skipped" ? "Ignoré — risque faible, traitement accéléré" : detail}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
