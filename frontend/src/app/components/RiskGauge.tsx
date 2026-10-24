"use client";

import { useCountUp } from "../lib/hooks";
import { riskHex } from "../lib/verdict";

const R = 70;
const ARC = Math.PI * R;

/** Semicircular 0-1 risk gauge with the investigation (0.42) and alert (0.7) thresholds marked. */
export default function RiskGauge({ score }: { score: number }) {
  const value = useCountUp(score, 1200);
  const color = riskHex(value);

  const marker = (t: number) => {
    const a = Math.PI * (1 - t);
    return { x: 90 + Math.cos(a) * (R + 9), y: 90 - Math.sin(a) * (R + 9) };
  };

  return (
    <div className="relative mx-auto w-full max-w-[220px]">
      <svg viewBox="0 0 180 104" className="w-full overflow-visible">
        <defs>
          <linearGradient id="gauge-track" x1="0" x2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.25" />
            <stop offset="55%" stopColor="#fbbf24" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#f87171" stopOpacity="0.25" />
          </linearGradient>
        </defs>
        <path d={`M 20 90 A ${R} ${R} 0 0 1 160 90`} fill="none" stroke="url(#gauge-track)" strokeWidth="12" strokeLinecap="round" />
        <path
          d={`M 20 90 A ${R} ${R} 0 0 1 160 90`}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={ARC}
          strokeDashoffset={ARC * (1 - value)}
          style={{ filter: `drop-shadow(0 0 8px ${color})` }}
        />
        {[0.42, 0.7].map((t) => {
          const p = marker(t);
          return <circle key={t} cx={p.x} cy={p.y} r="2" fill="rgb(255 255 255 / 0.5)" />;
        })}
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <p className="text-3xl font-bold tabular-nums" style={{ color }}>
          {value.toFixed(2)}
        </p>
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Score de risque</p>
      </div>
    </div>
  );
}
