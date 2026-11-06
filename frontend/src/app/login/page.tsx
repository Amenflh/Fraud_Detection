"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { BrainCircuit, Cpu, Lock, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { LoginValues, loginSchema } from "../lib/validation";

export default function LoginPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginValues) {
    if (!isSupabaseConfigured()) {
      toast.error("Supabase n'est pas encore configuré (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY manquants).");
      return;
    }
    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword(values);
      if (error) {
        toast.error(error.message);
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-4 py-12 sm:px-6 lg:grid-cols-2">
      <div className="hidden space-y-8 lg:block animate-fade-up">
        <div className="relative grid size-40 place-items-center">
          <span className="absolute inset-0 rounded-full border border-cyan-300/20" />
          <span className="absolute inset-5 rounded-full border border-cyan-300/15" />
          <span className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,rgb(34_211_238/0.35)_60deg,transparent_90deg)] animate-spin-slow" />
          <span className="absolute inset-10 rounded-full bg-cyan-400/10 blur-xl" />
          <ShieldCheck className="relative size-14 text-cyan-300" />
        </div>
        <div className="space-y-3">
          <h1 className="text-4xl font-bold leading-tight tracking-tight">
            Le centre de surveillance <span className="text-gradient">antifraude</span> de vos sinistres.
          </h1>
          <p className="max-w-md text-muted-foreground">
            Connectez-vous pour soumettre des sinistres aux agents d&apos;analyse et suivre les indicateurs en temps réel.
          </p>
        </div>
        <ul className="space-y-3 text-sm">
          {[
            { icon: Cpu, text: "Scoring hybride IsolationForest + XGBoost" },
            { icon: BrainCircuit, text: "Enquête et rapport rédigés par des agents LLM" },
            { icon: Lock, text: "Accès sécurisé par Supabase Auth (JWT)" },
          ].map(({ icon: Icon, text }, i) => (
            <li key={text} className="flex items-center gap-3 animate-fade-up" style={{ animationDelay: `${200 + i * 100}ms` }}>
              <span className="grid size-8 place-items-center rounded-lg glass">
                <Icon className="size-4 text-cyan-300" />
              </span>
              {text}
            </li>
          ))}
        </ul>
      </div>

      <Card className="mx-auto w-full max-w-sm animate-fade-up" style={{ animationDelay: "120ms" }}>
        <CardHeader>
          <CardTitle className="text-xl">Connexion</CardTitle>
          <p className="text-sm text-muted-foreground">Espace réservé aux gestionnaires sinistres.</p>
        </CardHeader>
        <CardContent>
          <form method="post" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" placeholder="vous@exemple.fr" {...register("email")} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Mot de passe</Label>
              <Input id="password" type="password" autoComplete="current-password" {...register("password")} />
              {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="h-10 w-full bg-gradient-to-r from-cyan-400 to-indigo-500 font-semibold text-slate-950 hover:opacity-95"
            >
              <Lock className="size-4" />
              {isSubmitting ? "Connexion..." : "Se connecter"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
