"use client";

import type { User } from "@supabase/supabase-js";
import { Activity, FileSignature, FolderKanban, LayoutDashboard, ListChecks, LogOut, Menu, Network, ScanSearch, Smartphone, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { canOpen, ROLE_LABELS } from "../lib/auth";
import { useMe } from "./AuthProvider";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { cn } from "@/lib/utils";
import { useNow } from "../lib/hooks";
import Brand from "./Brand";
import StatusPill from "./StatusPill";

const LINKS = [
  { href: "/", label: "Analyse", icon: ScanSearch },
  { href: "/dossiers", label: "Dossiers", icon: FolderKanban },
  { href: "/constat", label: "e-Constat", icon: FileSignature },
  { href: "/declarer", label: "Déclarer", icon: Smartphone },
  { href: "/reseau", label: "Réseau", icon: Network },
  { href: "/regles", label: "Règles", icon: ListChecks },
  { href: "/performance", label: "Performance", icon: Activity },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];

function LiveClock() {
  const now = useNow();
  return (
    <span className="hidden font-mono text-xs tabular-nums text-muted-foreground lg:inline">
      {now ? now.toLocaleTimeString("fr-FR") : "--:--:--"}
    </span>
  );
}

export default function Header({ user }: { user: User | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const { me } = useMe();
  const showNav = pathname !== "/login" && (user !== null || !isSupabaseConfigured());
  // Only the sections this role may open (the API enforces it; this keeps the menu honest).
  const links = LINKS.filter((l) => !me || canOpen(me.role, l.href));

  async function handleLogout() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-background/55 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Brand />
          {showNav && (
            <nav className="hidden items-center gap-0.5 xl:flex">
              {links.map(({ href, label, icon: Icon }) => {
                const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    title={label}
                    className={cn(
                      "relative flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm transition",
                      active ? "bg-white/10 text-foreground" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                    )}
                  >
                    <Icon className="size-4" />
                    {/* Icons only on mid-size screens: 8 sections don't fit with labels. */}
                    <span className="hidden 2xl:inline">{label}</span>
                    {active && (
                      <span className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-gradient-to-r from-cyan-300 to-indigo-400 shadow-[0_0_12px_rgb(34_211_238/0.8)]" />
                    )}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>

        <div className="flex items-center gap-3">
          <StatusPill className="hidden md:inline-flex" />
          <LiveClock />
          {user && (
            <div className="hidden items-center gap-2 md:flex">
              <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-indigo-500 text-xs font-bold uppercase text-slate-950">
                {user.email?.[0] ?? "?"}
              </span>
              <span className="max-w-44 truncate text-xs text-muted-foreground">
                {me && <b className="mr-1.5 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-200">{ROLE_LABELS[me.role]}</b>}
                {me?.actor_name ?? user.email}
              </span>
              <button
                onClick={handleLogout}
                className="rounded-lg p-2 text-muted-foreground transition hover:bg-white/10 hover:text-red-300"
                title="Déconnexion"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          )}
          {showNav && (
            <button
              className="rounded-lg p-2 text-muted-foreground hover:bg-white/10 xl:hidden"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Menu"
            >
              {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          )}
        </div>
      </div>

      {showNav && menuOpen && (
        <div className="border-t border-white/10 px-4 py-3 xl:hidden animate-fade-up">
          <StatusPill className="mb-3" />
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm",
                (href === "/" ? pathname === "/" : pathname.startsWith(href)) ? "bg-white/10" : "text-muted-foreground"
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
          {user && (
            <button
              onClick={handleLogout}
              className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-red-300"
            >
              <LogOut className="size-4" /> Déconnexion ({user.email})
            </button>
          )}
        </div>
      )}
    </header>
  );
}
