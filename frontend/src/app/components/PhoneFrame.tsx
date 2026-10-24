"use client";

import { ArrowLeft, Signal, Wifi, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { useNow } from "../lib/hooks";

/** Smartphone mock-up on desktop; full width on small screens (where it *is* the phone). */
export default function PhoneFrame({
  title,
  subtitle,
  icon: Icon,
  onBack,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  onBack?: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const now = useNow(60_000);
  return (
    <div className="mx-auto w-full max-w-[400px] animate-fade-up sm:rounded-[52px] sm:border-[10px] sm:border-slate-800 sm:bg-slate-950 sm:shadow-[0_30px_80px_-20px_rgb(34_211_238/0.35)]">
      <div className="relative flex h-[min(820px,86vh)] flex-col overflow-hidden bg-background sm:rounded-[42px]">
        <div className="hidden items-center justify-between px-7 pb-1 pt-3 text-[11px] text-muted-foreground sm:flex">
          <span className="tabular-nums">{now ? now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "--:--"}</span>
          <span className="h-5 w-24 rounded-full bg-slate-900" />
          <span className="flex items-center gap-1">
            <Signal className="size-3" /> <Wifi className="size-3" />
          </span>
        </div>
        <header className="flex items-center gap-3 bg-gradient-to-r from-cyan-500/90 to-indigo-600/90 px-4 py-3.5 text-white">
          {onBack ? (
            <button onClick={onBack} aria-label="Retour">
              <ArrowLeft className="size-5" />
            </button>
          ) : (
            <Icon className="size-5" />
          )}
          <div className="flex-1">
            <p className="text-sm font-semibold">{title}</p>
            <p className="text-[11px] opacity-80">{subtitle}</p>
          </div>
        </header>
        {children}
        {footer && <div className="border-t border-white/10 p-4">{footer}</div>}
      </div>
    </div>
  );
}

export const fieldClass =
  "h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 text-sm outline-none transition placeholder:text-muted-foreground/60 focus:border-cyan-300/60 focus:bg-white/[0.09]";
export const labelClass = "mb-1 block text-xs text-muted-foreground";
