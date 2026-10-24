"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { ClaimsStats } from "../lib/types";
import { VERDICT_META, type Verdict } from "../lib/verdict";
import AnimatedNumber from "./AnimatedNumber";

export default function VerdictDonut({ stats }: { stats: ClaimsStats }) {
  const slices: { key: Verdict; value: number }[] = [
    { key: "fraud", value: stats.fraud_count },
    { key: "needs_human_review", value: stats.needs_review_count },
    { key: "not_fraud", value: stats.not_fraud_count },
  ];
  const data = slices.map((s) => ({ name: VERDICT_META[s.key].short, value: s.value, fill: VERDICT_META[s.key].hex }));

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row lg:flex-col xl:flex-row">
      <div className="relative size-48 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius={62} outerRadius={84} paddingAngle={3} stroke="none" animationDuration={900}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.fill} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: "rgb(15 20 40 / 0.95)", border: "1px solid rgb(255 255 255 / 0.1)", borderRadius: 10, fontSize: 12 }}
              itemStyle={{ color: "#e2e8f0" }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-2xl font-bold text-red-400">
              <AnimatedNumber value={stats.fraud_rate * 100} format={(v) => `${v.toFixed(1)}%`} />
            </p>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">taux de fraude</p>
          </div>
        </div>
      </div>
      <ul className="w-full space-y-3">
        {slices.map((s) => {
          const meta = VERDICT_META[s.key];
          const share = stats.total_claims ? (s.value / stats.total_claims) * 100 : 0;
          return (
            <li key={s.key} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="size-2.5 rounded-sm" style={{ background: meta.hex }} />
                  {meta.short}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {s.value} · {share.toFixed(0)}%
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${share}%`, background: meta.hex }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
