import type { Metadata } from "next";
import { connection } from "next/server";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import type { User } from "@supabase/supabase-js";
import { Toaster } from "@/components/ui/sonner";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import AppBackground from "./components/AppBackground";
import Footer from "./components/Footer";
import Header from "./components/Header";
import { HealthProvider } from "./components/HealthProvider";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sentinelle · Détection de fraude assurance",
  description: "Interface agents de détection de fraude assurance",
};

// The auth check below reads cookies on every request (via Supabase SSR), so this
// layout can never be statically prerendered - opt out of Next.js 16's default
// Cache Components static rendering instead of fighting it with Suspense/"use cache".
export const instant = false;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  let user: User | null = null;
  if (isSupabaseConfigured()) {
    // Supabase reads cookies and the clock (token expiry): mark the render as request-time.
    await connection();
    const supabase = await createClient();
    ({ data: { user } } = await supabase.auth.getUser());
  }

  return (
    <html
      lang="fr"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppBackground />
        <HealthProvider>
          <Header user={user} />
          {children}
          <Footer />
        </HealthProvider>
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  );
}
