import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "./lib/supabase/config";

const PUBLIC_PATHS = ["/login"];
// Pages reachable by anyone holding the link (the other driver of a digital constat),
// whether or not they are signed in.
const OPEN_PREFIXES = ["/constat/b/"];

export async function middleware(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    // No Supabase project configured yet: let requests through unauthenticated
    // rather than crashing (mirrors the backend's "auth not configured" fallback).
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (OPEN_PREFIXES.some((p) => request.nextUrl.pathname.startsWith(p))) {
    return supabaseResponse;
  }

  const isPublicPath = PUBLIC_PATHS.includes(request.nextUrl.pathname);

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
