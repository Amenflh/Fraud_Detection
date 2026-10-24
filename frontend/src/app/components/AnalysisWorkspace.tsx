"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";

import { analyzeClaim, CLAIMS_UPDATED_EVENT } from "../lib/api";
import { FraudVerdict } from "../lib/types";
import { ClaimFormValues } from "../lib/validation";
import ActivityFeed from "./ActivityFeed";
import AgentPipeline, { PipelinePhase } from "./AgentPipeline";
import ClaimForm from "./ClaimForm";
import VerdictCard from "./VerdictCard";

const STEP_MS = 650;

export default function AnalysisWorkspace() {
  const [phase, setPhase] = useState<PipelinePhase>("idle");
  const [activeStep, setActiveStep] = useState(0);
  const [verdict, setVerdict] = useState<FraudVerdict | null>(null);
  const verdictRef = useRef<HTMLDivElement>(null);

  async function handleSubmit(values: ClaimFormValues) {
    setPhase("running");
    setActiveStep(0);
    setVerdict(null);
    // Visual progression through the agents while the single API call is in flight.
    const timer = setInterval(() => setActiveStep((s) => Math.min(s + 1, 3)), STEP_MS);

    try {
      const claim = { ...values, claim_id: values.claim_id.trim() || `claim-${Date.now()}` };
      // Keep the pipeline visible long enough to follow, even when the API answers instantly.
      const [result] = await Promise.all([analyzeClaim(claim), new Promise((r) => setTimeout(r, STEP_MS * 3))]);
      setVerdict(result);
      setPhase("done");
      toast.success(`Sinistre ${result.claim_id} analysé`);
      window.dispatchEvent(new Event(CLAIMS_UPDATED_EVENT));
      setTimeout(() => verdictRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 100);
    } catch (err) {
      setPhase("idle");
      toast.error(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      clearInterval(timer);
    }
  }

  return (
    <section id="analyse" className="grid scroll-mt-24 gap-6 lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-6">
        <ClaimForm isSubmitting={phase === "running"} onSubmit={handleSubmit} />
        <div ref={verdictRef}>{verdict && <VerdictCard verdict={verdict} />}</div>
      </div>
      <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
        <AgentPipeline phase={phase} activeStep={activeStep} verdict={verdict} />
        <ActivityFeed />
      </div>
    </section>
  );
}
