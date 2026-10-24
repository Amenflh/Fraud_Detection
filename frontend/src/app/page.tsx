import { ArrowDown, BrainCircuit, Cpu, ShieldCheck } from "lucide-react";

import AnalysisWorkspace from "./components/AnalysisWorkspace";
import LiveKpis from "./components/LiveKpis";
import RotatingText from "./components/RotatingText";

const HIGHLIGHTS = [
  { icon: Cpu, text: "Score ML hybride" },
  { icon: BrainCircuit, text: "Enquête par agents IA" },
  { icon: ShieldCheck, text: "Décision expliquée" },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-7xl space-y-12 px-4 py-10 sm:px-6 lg:py-14">
      <section className="grid items-center gap-10 lg:grid-cols-[1.25fr_1fr]">
        <div className="space-y-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200 animate-fade-up">
            <span className="size-1.5 rounded-full bg-cyan-300 animate-pulse" />
            Système multi-agents · Machine Learning + LLM
          </span>
          <h1
            className="text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl animate-fade-up"
            style={{ animationDelay: "80ms" }}
          >
            Détectez la fraude
            <br />
            <RotatingText words={["avant le paiement", "en quelques secondes", "avec explications", "sans boîte noire"]} />
          </h1>
          <p className="max-w-xl text-muted-foreground animate-fade-up" style={{ animationDelay: "160ms" }}>
            Chaque sinistre traverse un pipeline de quatre agents : scoring par IsolationForest et XGBoost, enquête
            sur l&apos;historique du client, puis un verdict motivé. Les cas ambigus sont confiés à un gestionnaire.
          </p>
          <div className="flex flex-wrap gap-3 animate-fade-up" style={{ animationDelay: "240ms" }}>
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <span key={text} className="flex items-center gap-2 rounded-lg glass px-3 py-2 text-sm">
                <Icon className="size-4 text-cyan-300" /> {text}
              </span>
            ))}
          </div>
          <a
            href="#analyse"
            className="inline-flex items-center gap-2 text-sm text-cyan-300 transition hover:text-cyan-200 animate-fade-up"
            style={{ animationDelay: "320ms" }}
          >
            Analyser un sinistre <ArrowDown className="size-4 animate-bounce" />
          </a>
        </div>
        <LiveKpis />
      </section>

      <AnalysisWorkspace />
    </main>
  );
}
