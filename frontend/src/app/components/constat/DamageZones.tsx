"use client";

import { cn } from "@/lib/utils";
import { ZONES } from "../../lib/constat";

const SHAPES: Record<string, { d: string; label: { x: number; y: number } }> = {
  avant: { d: "M40 18 Q80 2 120 18 L120 52 L40 52 Z", label: { x: 80, y: 38 } },
  arriere: { d: "M40 228 L120 228 L120 262 Q80 278 40 262 Z", label: { x: 80, y: 250 } },
  gauche: { d: "M22 60 L38 56 L38 224 L22 220 Q14 140 22 60 Z", label: { x: 10, y: 140 } },
  droite: { d: "M138 60 L122 56 L122 224 L138 220 Q146 140 138 60 Z", label: { x: 150, y: 140 } },
  toit: { d: "M46 96 L114 96 L114 186 L46 186 Z", label: { x: 80, y: 145 } },
};

/** Top view of a car; click zones to mark the impact areas. */
export default function DamageZones({
  value,
  onChange,
  readOnly = false,
  hint = [],
}: {
  value: string[];
  onChange?: (zones: string[]) => void;
  readOnly?: boolean;
  hint?: string[];
}) {
  const toggle = (z: string) => !readOnly && onChange?.(value.includes(z) ? value.filter((v) => v !== z) : [...value, z]);

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 160 280" className="h-52 w-auto shrink-0">
        <rect x="30" y="10" width="100" height="260" rx="38" fill="rgb(255 255 255 / 0.04)" stroke="rgb(255 255 255 / 0.25)" />
        <rect x="46" y="62" width="68" height="28" rx="8" fill="rgb(170 200 220 / 0.25)" />
        <rect x="46" y="192" width="68" height="24" rx="8" fill="rgb(170 200 220 / 0.25)" />
        {Object.entries(SHAPES).map(([zone, { d }]) => {
          const on = value.includes(zone);
          const suggested = !on && hint.includes(zone);
          return (
            <path
              key={zone}
              d={d}
              onClick={() => toggle(zone)}
              className={cn("transition-all duration-300", !readOnly && "cursor-pointer")}
              fill={on ? "rgb(248 113 113 / 0.55)" : suggested ? "rgb(251 191 36 / 0.25)" : "rgb(255 255 255 / 0.03)"}
              stroke={on ? "#f87171" : suggested ? "#fbbf24" : "rgb(255 255 255 / 0.2)"}
              strokeWidth={on ? 2 : 1}
              strokeDasharray={suggested ? "4 3" : undefined}
            >
              <title>{ZONES.find((z) => z.key === zone)?.label}</title>
            </path>
          );
        })}
        <text x="80" y="8" textAnchor="middle" fontSize="8" fill="rgb(160 170 195)">
          ▲ AVANT
        </text>
      </svg>
      <div className="flex flex-wrap gap-1.5">
        {ZONES.map((z) => (
          <button
            key={z.key}
            type="button"
            disabled={readOnly}
            onClick={() => toggle(z.key)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition",
              value.includes(z.key) ? "border-red-400/50 bg-red-500/15 text-red-200" : "border-white/10 bg-white/5 text-muted-foreground",
              hint.includes(z.key) && !value.includes(z.key) && "border-amber-300/50 text-amber-200"
            )}
          >
            {z.label}
          </button>
        ))}
      </div>
    </div>
  );
}
