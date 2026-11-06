"use client";

import { Brain, Car, FileSignature, FileText, MapPin, Network, ShieldAlert, Siren, User } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import type { DossierDetail } from "../../lib/dossiers";
import { formatAmount, formatDateTime, INCIDENT_LABELS } from "../../lib/workflow";
import { CoherenceList, PdfButton, ResponsibilityBar, Seal } from "../constat/ConstatWidgets";
import VerdictCard from "../VerdictCard";
import RulesPanel from "./RulesPanel";
import { EmptyState, InfoRow, SectionTitle, StatusBadge, VerdictPill } from "./ui";

export function FraudTab({ dossier }: { dossier: DossierDetail }) {
  const network = dossier.ai.network;
  const alerts = dossier.events.filter((e) => e.kind === "alert");

  return (
    <div className="space-y-6">
      <RulesPanel rules={dossier.ai.rules} />
      <div>
        <SectionTitle icon={Brain}>Pipeline ML + agents d&apos;enquête</SectionTitle>
        {dossier.fraud ? <VerdictCard verdict={dossier.fraud} /> : <EmptyState>Pas encore d&apos;analyse antifraude.</EmptyState>}
      </div>

      <section>
        <SectionTitle icon={Siren}>Alertes des agents ({alerts.length})</SectionTitle>
        {alerts.length === 0 ? (
          <EmptyState>Aucune alerte levée par les agents Photo, Devis ou Réseau.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a, i) => (
              <li
                key={a.id}
                className="flex items-start gap-3 rounded-xl bg-red-500/[0.06] px-3.5 py-2.5 text-sm ring-1 ring-red-400/20 animate-fade-up"
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-red-300" />
                <span className="flex-1">{a.label}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{formatDateTime(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle icon={Network}>Agent Réseau</SectionTitle>
        <div
          className={cn(
            "rounded-xl border p-4",
            network.level === "high"
              ? "border-fuchsia-400/30 bg-fuchsia-500/[0.07]"
              : network.level === "medium"
                ? "border-amber-300/25 bg-amber-400/[0.05]"
                : "border-white/10 bg-white/[0.03]"
          )}
        >
          <p className="text-sm">{network.summary}</p>
          {network.links.length > 0 && (
            <ul className="mt-3 space-y-2">
              {network.links.map((l) => (
                <li key={l.dossier_id} className="flex flex-wrap items-center gap-2 rounded-lg bg-black/20 px-3 py-2 text-sm">
                  <Link href={`/dossiers/${l.dossier_id}`} className="font-mono text-xs text-cyan-200 hover:underline">
                    {l.dossier_id}
                  </Link>
                  <span className="text-xs text-muted-foreground">partage :</span>
                  {l.shared.map((s) => (
                    <span key={s} className="rounded-md bg-fuchsia-500/15 px-1.5 py-0.5 text-[11px] text-fuchsia-200">
                      {s}
                    </span>
                  ))}
                  <span className="ml-auto">
                    <VerdictPill verdict={l.verdict as never} />
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/reseau" className="mt-3 inline-block text-xs text-cyan-300 hover:underline">
            Voir la cartographie complète des réseaux →
          </Link>
        </div>
      </section>
    </div>
  );
}

export function GeneralTab({ dossier }: { dossier: DossierDetail }) {
  const { claim, insured, vehicle } = dossier;
  return (
    <div className="space-y-6">
      {dossier.ai.constat && <ConstatSection constat={dossier.ai.constat} />}
      <div className="grid gap-6 md:grid-cols-2">
      <section>
        <SectionTitle icon={FileText}>Contrat d&apos;assurance</SectionTitle>
        <InfoRow label="N° de contrat">
          <span className="font-mono">{claim.policy_id}</span>
        </InfoRow>
        <InfoRow label="Ancienneté">{claim.days_since_policy_start} jours</InfoRow>
        <InfoRow label="Sinistres antérieurs">{claim.prior_claims_count}</InfoRow>
        <InfoRow label="Canal de déclaration">{dossier.ai.channel ?? "—"}</InfoRow>
        <InfoRow label="Étape">
          <StatusBadge status={dossier.status} />
        </InfoRow>
      </section>
      <section>
        <SectionTitle icon={User}>Assuré</SectionTitle>
        <InfoRow label="Nom">{insured.name}</InfoRow>
        <InfoRow label="CIN">{insured.cin}</InfoRow>
        <InfoRow label="Téléphone">{insured.phone}</InfoRow>
        <InfoRow label="Email">{insured.email}</InfoRow>
      </section>
      <section>
        <SectionTitle icon={Car}>Véhicule</SectionTitle>
        <InfoRow label="Immatriculation">
          <span className="rounded-md border border-white/20 bg-white/5 px-2 py-0.5 font-mono text-xs">{vehicle.plate}</span>
        </InfoRow>
        <InfoRow label="Marque / modèle">{vehicle.make_model}</InfoRow>
        <InfoRow label="Année">{vehicle.year}</InfoRow>
        <InfoRow label="Âge du véhicule">{claim.vehicle_age != null ? `${claim.vehicle_age} ans` : null}</InfoRow>
      </section>
      <section>
        <SectionTitle icon={MapPin}>Circonstances</SectionTitle>
        <InfoRow label="Date du sinistre">{new Date(claim.claim_date).toLocaleDateString("fr-FR")}</InfoRow>
        <InfoRow label="Type">{INCIDENT_LABELS[claim.incident_type] ?? claim.incident_type}</InfoRow>
        <InfoRow label="Adresse">{dossier.address ? `${dossier.address}` : dossier.city}</InfoRow>
        <InfoRow label="Montant déclaré">{formatAmount(claim.claim_amount)}</InfoRow>
        <InfoRow label="Description">{claim.claim_description}</InfoRow>
      </section>
      </div>
    </div>
  );
}

function ConstatSection({ constat }: { constat: NonNullable<DossierDetail["ai"]["constat"]> }) {
  return (
    <section className="space-y-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.04] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle icon={FileSignature}>Issu de l&apos;e-Constat {constat.id}</SectionTitle>
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] ring-1", constat.signed_b ? "text-emerald-300 ring-emerald-400/30" : "text-amber-200 ring-amber-300/30")}>
          {constat.signed_b ? "Signé par les deux conducteurs" : "Non signé par le tiers"}
        </span>
      </div>
      {constat.responsibility && <ResponsibilityBar r={constat.responsibility} />}
      {constat.transcript && <blockquote className="border-l-2 border-fuchsia-400/60 pl-3 text-xs italic text-muted-foreground">« {constat.transcript} »</blockquote>}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Tiers et témoins</p>
        <ul className="space-y-1 text-sm">
          {constat.third_parties.map((t, i) => (
            <li key={i} className="flex flex-wrap gap-x-2">
              <span className="text-muted-foreground">{t.role} :</span> {t.name}
              {t.phone && <span className="text-muted-foreground">· {t.phone}</span>}
              {t.plate && <span className="font-mono text-xs text-muted-foreground">· {t.plate}</span>}
            </li>
          ))}
        </ul>
      </div>
      <CoherenceList flags={constat.coherence} />
      {constat.seal && <Seal seal={constat.seal} />}
      <PdfButton constatId={constat.id} signed={!!constat.seal} />
    </section>
  );
}
