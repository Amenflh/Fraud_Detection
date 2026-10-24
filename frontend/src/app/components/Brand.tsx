import { ShieldCheck } from "lucide-react";
import Link from "next/link";

export default function Brand() {
  return (
    <Link href="/" className="group flex items-center gap-3">
      <span className="relative grid size-9 place-items-center rounded-xl bg-gradient-to-br from-cyan-400/25 to-indigo-600/25 ring-1 ring-cyan-300/30 transition group-hover:ring-cyan-300/60">
        <ShieldCheck className="size-5 text-cyan-300" />
        <span className="absolute inset-0 rounded-xl ring-1 ring-cyan-300/40 animate-pulse-ring" />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold tracking-wide">Sentinelle</span>
        <span className="block text-[11px] text-muted-foreground">Détection de fraude · Assurance</span>
      </span>
    </Link>
  );
}
