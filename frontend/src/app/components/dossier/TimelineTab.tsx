"use client";

import { ArrowRightLeft, Bot, FileUp, ShieldAlert, UserCheck, type LucideIcon } from "lucide-react";

import type { DossierDetail, DossierEvent } from "../../lib/dossiers";
import { formatDateTime, ROLE_META } from "../../lib/workflow";

const KIND_ICON: Record<DossierEvent["kind"], LucideIcon> = {
  status_change: ArrowRightLeft,
  assignment: UserCheck,
  document: FileUp,
  alert: ShieldAlert,
  agent: Bot,
};

export default function TimelineTab({ dossier }: { dossier: DossierDetail }) {
  const events = [...dossier.events].reverse();
  return (
    <ol className="relative space-y-4 border-l border-white/10 pl-6">
      {events.map((e, i) => {
        const Icon = KIND_ICON[e.kind] ?? Bot;
        const meta = ROLE_META[e.role as keyof typeof ROLE_META] ?? ROLE_META.ia;
        const color = e.kind === "alert" ? "#f87171" : meta.color;
        const note = e.payload?.note as string | undefined;
        return (
          <li key={e.id} className="relative animate-fade-up" style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
            <span
              className="absolute -left-[37px] grid size-6 place-items-center rounded-full ring-4 ring-background"
              style={{ background: `${color}30`, color }}
            >
              <Icon className="size-3.5" />
            </span>
            <p className="text-sm">{e.label}</p>
            {note && <p className="text-xs italic text-muted-foreground">« {note} »</p>}
            <p className="text-[11px] text-muted-foreground">
              <span style={{ color: meta.color }}>{meta.label}</span> · {formatDateTime(e.at)}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
