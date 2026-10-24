"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import type { DossierDetail } from "../../lib/dossiers";
import { formatDateTime, REJECTED, STAGES } from "../../lib/workflow";

export default function WorkflowStepper({ dossier }: { dossier: DossierDetail }) {
  const reachedAt = new Map<string, string>();
  for (const e of dossier.events) {
    const to = e.payload?.to as string | undefined;
    if (e.kind === "status_change" && to && !reachedAt.has(to)) reachedAt.set(to, e.at);
  }
  const rejected = dossier.status === "rejete";
  const steps = rejected ? [...STAGES.filter((s) => reachedAt.has(s.key)), REJECTED] : STAGES;
  const currentIndex = steps.findIndex((s) => s.key === dossier.status);

  return (
    <div className="overflow-x-auto rounded-2xl glass px-4 py-5">
      <ol className="flex min-w-[640px] items-start">
        {steps.map((s, i) => {
          const done = i < currentIndex || dossier.status === "cloture";
          const current = i === currentIndex && dossier.status !== "cloture";
          const Icon = s.icon;
          return (
            <li key={s.key} className="relative flex flex-1 flex-col items-center text-center">
              {i > 0 && (
                <span className="absolute right-1/2 top-[18px] h-0.5 w-full -translate-y-1/2 bg-white/10">
                  <span
                    className="absolute inset-y-0 left-0 transition-all duration-700"
                    style={{ width: i <= currentIndex ? "100%" : "0%", background: `linear-gradient(90deg, ${steps[i - 1].color}, ${s.color})` }}
                  />
                </span>
              )}
              <span
                className={cn(
                  "relative z-10 grid size-9 place-items-center rounded-full ring-2 transition-all duration-500",
                  !done && !current && "bg-background text-muted-foreground ring-white/10"
                )}
                style={
                  done || current
                    ? { background: `${s.color}25`, color: s.color, boxShadow: current ? `0 0 22px ${s.color}88` : undefined, ["--tw-ring-color" as string]: s.color }
                    : undefined
                }
              >
                {current && <span className="absolute inset-0 rounded-full ring-2 animate-pulse-ring" style={{ ["--tw-ring-color" as string]: s.color }} />}
                {done ? <Check className="size-4" /> : <Icon className="size-4" />}
              </span>
              <span className={cn("mt-2 text-xs font-medium", !done && !current && "text-muted-foreground")}>{s.label}</span>
              <span className="text-[10px] text-muted-foreground">{reachedAt.has(s.key) ? formatDateTime(reachedAt.get(s.key)!) : "—"}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
