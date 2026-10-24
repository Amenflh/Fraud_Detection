"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ScoreBucket } from "../lib/types";
import { riskHex } from "../lib/verdict";

export default function ScoreDistributionChart({ data }: { data: ScoreBucket[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="rgb(255 255 255 / 0.06)" />
        <XAxis dataKey="range_label" fontSize={11} tick={{ fill: "rgb(160 170 195)" }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} fontSize={11} tick={{ fill: "rgb(160 170 195)" }} axisLine={false} tickLine={false} />
        <Tooltip
          cursor={{ fill: "rgb(255 255 255 / 0.04)" }}
          contentStyle={{ background: "rgb(15 20 40 / 0.95)", border: "1px solid rgb(255 255 255 / 0.1)", borderRadius: 10, fontSize: 12 }}
          labelStyle={{ color: "#e2e8f0" }}
          formatter={(v) => [v, "Sinistres"]}
          labelFormatter={(l) => `Score ${l}`}
        />
        <ReferenceLine x="0.7-0.8" stroke="#f87171" strokeDasharray="4 4" label={{ value: "seuil", fill: "#f87171", fontSize: 10, position: "top" }} />
        <Bar dataKey="count" radius={[6, 6, 0, 0]} animationDuration={900}>
          {data.map((b) => (
            <Cell key={b.range_label} fill={riskHex(parseFloat(b.range_label) + 0.05)} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
