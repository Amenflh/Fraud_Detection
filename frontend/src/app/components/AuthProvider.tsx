"use client";

import { Loader2, LogOut, ShieldX } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { canOpen, fetchMe, isPublicPath, LANDING, type Me } from "../lib/auth";

type AuthState = { me: Me | null; loading: boolean; error: string | null; denied: boolean };

const AuthContext = createContext<AuthState>({ me: null, loading: true, error: null, denied: false });

export const useMe = () => useContext(AuthContext);

/**
 * Loads the signed-in user's role from the API once. Remounted (via `key`) whenever the user signs
 * in or out, so the role is never stale.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const publicPage = isPublicPath(pathname);
  const [state, setState] = useState<AuthState>({ me: null, loading: !publicPage && isSupabaseConfigured(), error: null, denied: false });

  useEffect(() => {
    if (publicPage || !isSupabaseConfigured() || state.me || state.denied) return;
    let cancelled = false;
    fetchMe()
      .then((me) => !cancelled && setState({ me, loading: false, error: null, denied: false }))
      .catch((err: Error & { status?: number }) => {
        // 403 = valid account without a role: show an explicit message instead of broken pages.
        if (!cancelled) setState({ me: null, loading: false, error: err.message, denied: err.status === 403 });
      });
    return () => {
      cancelled = true;
    };
  }, [publicPage, state.me, state.denied]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

/** Keeps people on the pages their role may open; explains accounts that have no role. */
export function RouteGuard({ children }: { children: ReactNode }) {
  const { me, loading, error, denied } = useMe();
  const pathname = usePathname();
  const router = useRouter();
  const publicPage = isPublicPath(pathname);
  const role = me?.role;
  const allowed = !role || publicPage || canOpen(role, pathname);

  useEffect(() => {
    if (role && !allowed) router.replace(LANDING[role]);
  }, [role, allowed, router]);

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (!publicPage && denied) {
    return (
      <main className="mx-auto grid w-full max-w-md flex-1 place-items-center px-4 py-16 text-center">
        <div className="space-y-4 rounded-2xl glass p-8 animate-fade-up">
          <ShieldX className="mx-auto size-10 text-amber-300" />
          <h1 className="text-xl font-semibold">Compte sans rôle</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
          <button onClick={signOut} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10">
            <LogOut className="size-4" /> Se déconnecter
          </button>
        </div>
      </main>
    );
  }

  if (!publicPage && (loading || !allowed)) {
    return (
      <main className="grid flex-1 place-items-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  return <>{children}</>;
}
