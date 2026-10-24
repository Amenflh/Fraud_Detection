"use client";

import { cn } from "@/lib/utils";
import { useHealth } from "./HealthProvider";

export default function StatusPill({ className }: { className?: string }) {
  const { online, latencyMs } = useHealth();

  const tone =
    online === null
      ? { dot: "bg-slate-400", text: "Connexion…" }
      : online
        ? { dot: "bg-emerald-400", text: `API en ligne · ${latencyMs ?? "–"} ms` }
        : { dot: "bg-red-400", text: "API hors ligne" };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted-foreground",
        className
      )}
      title="Statut du backend FastAPI (vérifié toutes les 20 s)"
    >
      <span className="relative flex size-2">
        {online && <span className={cn("absolute inset-0 rounded-full animate-pulse-ring", tone.dot)} />}
        <span className={cn("relative size-2 rounded-full", tone.dot)} />
      </span>
      <span className="tabular-nums">{tone.text}</span>
    </span>
  );
}
