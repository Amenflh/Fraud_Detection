"use client";

import { Car, CreditCard, FolderOpen, Mail, Network, Phone, RefreshCw, UserRound, Wrench, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { EmptyState, VerdictPill } from "../components/dossier/ui";
import { DOSSIERS_UPDATED_EVENT, getNetwork, type NetworkGraph } from "../lib/dossiers";
import { usePolling } from "../lib/hooks";
import { VERDICT_META, type Verdict } from "../lib/verdict";

const W = 900;
const H = 600;

const ENTITY: Record<string, { icon: LucideIcon; color: string; label: string }> = {
  phone: { icon: Phone, color: "#e879f9", label: "Téléphone" },
  email: { icon: Mail, color: "#e879f9", label: "Email" },
  cin: { icon: CreditCard, color: "#e879f9", label: "CIN" },
  plate: { icon: Car, color: "#f472b6", label: "Immatriculation" },
  garage: { icon: Wrench, color: "#fbbf24", label: "Garage" },
  tiers: { icon: UserRound, color: "#fb923c", label: "Tiers / témoin" },
};

type Pos = { x: number; y: number; vx: number; vy: number };

/** Small force-directed layout: node repulsion + edge springs + centering, run for a few hundred ticks. */
function useForceLayout(graph: NetworkGraph | null) {
  const [positions, setPositions] = useState<Record<string, Pos>>({});
  const posRef = useRef<Record<string, Pos>>({});
  const dragRef = useRef<string | null>(null);

  useEffect(() => {
    if (!graph) return;
    const pos: Record<string, Pos> = {};
    graph.nodes.forEach((n, i) => {
      const prev = posRef.current[n.id];
      const angle = (i / graph.nodes.length) * Math.PI * 2;
      pos[n.id] = prev ?? { x: W / 2 + Math.cos(angle) * 220 + Math.random() * 20, y: H / 2 + Math.sin(angle) * 180 + Math.random() * 20, vx: 0, vy: 0 };
    });
    posRef.current = pos;

    let raf = 0;
    let tick = 0;
    const step = () => {
      const ids = Object.keys(pos);
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = pos[ids[i]];
          const b = pos[ids[j]];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = Math.max(dx * dx + dy * dy, 25);
          const f = 1800 / d2;
          const d = Math.sqrt(d2);
          a.vx += (dx / d) * f;
          a.vy += (dy / d) * f;
          b.vx -= (dx / d) * f;
          b.vy -= (dy / d) * f;
        }
      }
      for (const e of graph.edges) {
        const a = pos[e.source];
        const b = pos[e.target];
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.max(Math.hypot(dx, dy), 1);
        const f = (d - 85) * 0.02;
        a.vx += (dx / d) * f;
        a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f;
        b.vy -= (dy / d) * f;
      }
      const cooling = Math.max(0.15, 1 - tick / 400);
      for (const id of ids) {
        const p = pos[id];
        if (id === dragRef.current) continue;
        p.vx += (W / 2 - p.x) * 0.002;
        p.vy += (H / 2 - p.y) * 0.002;
        p.vx *= 0.82;
        p.vy *= 0.82;
        p.x = Math.min(W - 30, Math.max(30, p.x + p.vx * cooling));
        p.y = Math.min(H - 30, Math.max(30, p.y + p.vy * cooling));
      }
      tick++;
      setPositions({ ...pos });
      if (tick < 600 || dragRef.current) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [graph]);

  return { positions, posRef, dragRef, setPositions };
}

export default function ReseauPage() {
  const { data: graph, error, refresh, isLoading } = usePolling(getNetwork, { intervalMs: 60000, refreshOn: DOSSIERS_UPDATED_EVENT });
  const { positions, posRef, dragRef, setPositions } = useForceLayout(graph);
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const neighbors = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const e of graph?.edges ?? []) {
      (map[e.source] ??= new Set()).add(e.target);
      (map[e.target] ??= new Set()).add(e.source);
    }
    return map;
  }, [graph]);

  // Connected components = candidate fraud rings.
  const rings = useMemo(() => {
    if (!graph) return [];
    const seen = new Set<string>();
    const out: string[][] = [];
    for (const n of graph.nodes) {
      if (seen.has(n.id)) continue;
      const stack = [n.id];
      const comp: string[] = [];
      while (stack.length) {
        const id = stack.pop()!;
        if (seen.has(id)) continue;
        seen.add(id);
        comp.push(id);
        neighbors[id]?.forEach((m) => stack.push(m));
      }
      out.push(comp);
    }
    const byId = Object.fromEntries(graph.nodes.map((n) => [n.id, n]));
    return out
      .map((comp) => ({
        dossiers: comp.filter((id) => byId[id].type === "dossier").map((id) => byId[id]),
        entities: comp.filter((id) => byId[id].type !== "dossier").map((id) => byId[id]),
      }))
      .filter((r) => r.dossiers.length >= 2)
      .sort((a, b) => b.dossiers.length - a.dossiers.length);
  }, [graph, neighbors]);

  const focus = hover ?? selected;
  const isLit = (id: string) => !focus || id === focus || neighbors[focus]?.has(id);
  const selectedNode = graph?.nodes.find((n) => n.id === selected);

  function toSvg(e: React.PointerEvent) {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
  }

  function onMove(e: React.PointerEvent) {
    const id = dragRef.current;
    if (!id) return;
    const p = posRef.current[id];
    const { x, y } = toSvg(e);
    p.x = x;
    p.y = y;
    setPositions({ ...posRef.current });
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between animate-fade-up">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300/80">Agent Réseau</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Cartographie des réseaux suspects</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Dossiers reliés par un même téléphone, email, CIN, véhicule, par un tiers ou témoin récurrent (e-Constat) — ou par un garage concentrant plusieurs dossiers suspects.
            Survolez un nœud pour isoler ses liens, glissez-le pour réorganiser.
          </p>
        </div>
        <button onClick={refresh} className="flex items-center gap-2 self-start rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs transition hover:bg-white/10">
          <RefreshCw className={cn("size-3.5", isLoading && "animate-spin")} /> Recalculer
        </button>
      </div>

      {error && !graph && <EmptyState>Graphe indisponible ({error}).</EmptyState>}
      {!graph && !error && <Skeleton className="h-[600px] rounded-2xl" />}
      {graph && graph.nodes.length === 0 && <EmptyState>Aucun lien suspect entre dossiers pour le moment.</EmptyState>}

      {graph && graph.nodes.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <Card className="overflow-hidden p-0">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              className="h-auto w-full touch-none select-none"
              onPointerMove={onMove}
              onPointerUp={() => (dragRef.current = null)}
              onPointerLeave={() => (dragRef.current = null)}
            >
              <defs>
                <radialGradient id="net-bg">
                  <stop offset="0%" stopColor="rgb(232 121 249 / 0.10)" />
                  <stop offset="100%" stopColor="transparent" />
                </radialGradient>
              </defs>
              <rect width={W} height={H} fill="url(#net-bg)" />
              {graph.edges.map((e, i) => {
                const a = positions[e.source];
                const b = positions[e.target];
                if (!a || !b) return null;
                const lit = isLit(e.source) && isLit(e.target) && (!focus || e.source === focus || e.target === focus);
                return (
                  <line
                    key={i}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={ENTITY[e.kind]?.color ?? "#94a3b8"}
                    strokeOpacity={lit ? 0.7 : 0.08}
                    strokeWidth={lit && focus ? 2 : 1.2}
                    strokeDasharray={e.kind === "garage" ? "5 4" : undefined}
                    className="transition-[stroke-opacity] duration-300"
                  />
                );
              })}
              {graph.nodes.map((n) => {
                const p = positions[n.id];
                if (!p) return null;
                const lit = isLit(n.id);
                const common = {
                  onPointerEnter: () => setHover(n.id),
                  onPointerLeave: () => setHover(null),
                  onPointerDown: (e: React.PointerEvent) => {
                    dragRef.current = n.id;
                    (e.target as Element).setPointerCapture?.(e.pointerId);
                  },
                  onClick: () => setSelected(n.id === selected ? null : n.id),
                  style: { opacity: lit ? 1 : 0.2, transition: "opacity 300ms", cursor: "grab" },
                };
                if (n.type === "dossier") {
                  const color = n.verdict ? VERDICT_META[n.verdict as Verdict].hex : "#94a3b8";
                  return (
                    <g key={n.id} transform={`translate(${p.x},${p.y})`} {...common}>
                      {n.verdict !== "not_fraud" && <circle r={22} fill={color} opacity={0.15} className="animate-pulse" />}
                      <circle r={14} fill={`${color}33`} stroke={color} strokeWidth={selected === n.id ? 3 : 1.8} />
                      <FolderOpen x={-7} y={-7} width={14} height={14} color={color} />
                      <text y={30} textAnchor="middle" fontSize={11} fill="#cbd5e1" className="font-mono">
                        {n.label.replace("SIN-", "")}
                      </text>
                    </g>
                  );
                }
                const meta = ENTITY[n.type];
                const Icon = meta.icon;
                return (
                  <g key={n.id} transform={`translate(${p.x},${p.y})`} {...common}>
                    <rect x={-15} y={-15} width={30} height={30} rx={9} fill={`${meta.color}26`} stroke={meta.color} strokeWidth={1.5} />
                    <Icon x={-8} y={-8} width={16} height={16} color={meta.color} />
                    <text y={30} textAnchor="middle" fontSize={10} fill={meta.color}>
                      {n.label.length > 22 ? `${n.label.slice(0, 20)}…` : n.label}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div className="flex flex-wrap gap-4 border-t border-white/10 px-4 py-3 text-[11px] text-muted-foreground">
              {(["fraud", "needs_human_review", "not_fraud"] as Verdict[]).map((v) => (
                <span key={v} className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full" style={{ background: VERDICT_META[v].hex }} /> Dossier {VERDICT_META[v].short.toLowerCase()}
                </span>
              ))}
              {Object.entries(ENTITY).map(([k, m]) => (
                <span key={k} className="flex items-center gap-1.5">
                  <m.icon className="size-3" style={{ color: m.color }} /> {m.label}
                </span>
              ))}
            </div>
          </Card>

          <div className="space-y-5">
            {selectedNode && (
              <Card className="ring-1 ring-cyan-300/30 animate-fade-up">
                <CardHeader>
                  <CardTitle className="text-sm">{selectedNode.type === "dossier" ? "Dossier sélectionné" : ENTITY[selectedNode.type].label}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="font-mono text-cyan-200">{selectedNode.label}</p>
                  {selectedNode.type === "dossier" ? (
                    <>
                      <p className="text-muted-foreground">{selectedNode.insured}</p>
                      <VerdictPill verdict={(selectedNode.verdict as Verdict) ?? null} score={selectedNode.risk} />
                      <Link href={`/dossiers/${selectedNode.id}`} className="block pt-1 text-xs text-cyan-300 hover:underline">
                        Ouvrir le dossier →
                      </Link>
                    </>
                  ) : (
                    <p className="text-muted-foreground">Partagé par {neighbors[selectedNode.id]?.size ?? 0} dossiers</p>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Network className="size-4 text-fuchsia-300" /> Réseaux détectés ({rings.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {rings.map((r, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/[0.05] p-3"
                    onMouseEnter={() => setHover(r.entities[0]?.id ?? null)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <p className="text-sm font-medium">
                      Réseau #{i + 1} · {r.dossiers.length} dossiers
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Liens : {r.entities.map((e) => ENTITY[e.type].label.toLowerCase()).join(", ")}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {r.dossiers.map((d) => (
                        <Link key={d.id} href={`/dossiers/${d.id}`} className="rounded-md bg-black/25 px-1.5 py-0.5 font-mono text-[11px] text-cyan-200 hover:underline">
                          {d.id}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </main>
  );
}
