"use client";

import { useCountUp } from "../lib/hooks";

export default function AnimatedNumber({
  value,
  format = (v) => Math.round(v).toLocaleString("fr-FR"),
}: {
  value: number;
  format?: (v: number) => string;
}) {
  const current = useCountUp(value);
  return <span className="tabular-nums">{format(current)}</span>;
}
