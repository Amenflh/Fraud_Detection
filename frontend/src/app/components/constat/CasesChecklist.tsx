"use client";

import { Check, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { CASES } from "../../lib/constat";

/** The 17 boxes of the amicable report. AI suggestions are highlighted until confirmed. */
export default function CasesChecklist({
  value,
  onChange,
  suggested = [],
  readOnly = false,
}: {
  value: number[];
  onChange?: (cases: number[]) => void;
  suggested?: number[];
  readOnly?: boolean;
}) {
  const toggle = (n: number) => !readOnly && onChange?.(value.includes(n) ? value.filter((v) => v !== n) : [...value, n].sort((a, b) => a - b));

  return (
    <ol className="grid gap-1.5">
      {Object.entries(CASES).map(([key, label]) => {
        const n = Number(key);
        const on = value.includes(n);
        const ai = suggested.includes(n);
        return (
          <li key={n}>
            <button
              type="button"
              disabled={readOnly}
              onClick={() => toggle(n)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left text-xs transition",
                on ? "border-cyan-300/50 bg-cyan-400/10 text-foreground" : "border-white/5 bg-white/[0.02] text-muted-foreground",
                !readOnly && "hover:border-white/20"
              )}
            >
              <span
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-md border text-[10px] font-semibold",
                  on ? "border-cyan-300 bg-cyan-300 text-slate-950" : "border-white/20"
                )}
              >
                {on ? <Check className="size-3" /> : n}
              </span>
              <span className="flex-1">{label}</span>
              {ai && (
                <span className="flex items-center gap-1 rounded-full bg-fuchsia-500/15 px-1.5 py-0.5 text-[10px] text-fuchsia-200">
                  <Sparkles className="size-2.5" /> IA
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
