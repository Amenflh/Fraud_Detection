"use client";

import { BadgeCheck, Fingerprint, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { verifyConstat, type Verification } from "../../../lib/constat";
import { formatDateTime } from "../../../lib/workflow";

const CHECKS: { key: keyof Verification; label: string }[] = [
  { key: "content_unaltered", label: "Contenu du constat inchangé depuis la signature" },
  { key: "signatures_unaltered", label: "Images des signatures inchangées" },
  { key: "seal_matches_document", label: "Scellé du PDF présenté identique à celui enregistré" },
];

/** Public page opened by the QR code printed on the constat PDF. Shows no personal data. */
export default function VerifyPage() {
  const { id } = useParams<{ id: string }>();
  const [result, setResult] = useState<Verification | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const seal = new URLSearchParams(window.location.search).get("seal");
    verifyConstat(id, seal)
      .then(setResult)
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur"));
  }, [id]);

  const valid = result?.valid;
  return (
    <main className="mx-auto grid w-full max-w-lg flex-1 place-items-center px-4 py-12">
      <div className="w-full space-y-5 rounded-3xl glass p-8 animate-fade-up">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-cyan-300/80">
          <Fingerprint className="size-4" /> Vérification d&apos;authenticité
        </p>
        <h1 className="font-mono text-2xl font-bold">{id}</h1>

        {!result && !error && <Loader2 className="size-6 animate-spin text-muted-foreground" />}
        {error && <p className="text-sm text-red-300">{error}</p>}

        {result && (
          <>
            <div
              className={cn(
                "flex items-center gap-4 rounded-2xl p-4 ring-1",
                valid ? "bg-emerald-500/10 ring-emerald-400/30" : "bg-red-500/10 ring-red-400/30"
              )}
            >
              {valid ? <ShieldCheck className="size-10 shrink-0 text-emerald-300" /> : <ShieldAlert className="size-10 shrink-0 text-red-300" />}
              <div>
                <p className={cn("text-lg font-semibold", valid ? "text-emerald-200" : "text-red-200")}>{valid ? "Document authentique" : "Document non vérifiable"}</p>
                <p className="text-xs text-muted-foreground">
                  {valid
                    ? "Ce constat correspond exactement à ce qui a été signé par les deux conducteurs."
                    : (result.reason ?? "Le document présenté ne correspond pas à l'enregistrement : il a pu être modifié.")}
                </p>
              </div>
            </div>

            {result.sealed && (
              <>
                <ul className="space-y-2 text-sm">
                  {CHECKS.map(({ key, label }) => (
                    <li key={key} className="flex items-start gap-2">
                      <BadgeCheck className={cn("mt-0.5 size-4 shrink-0", result[key] ? "text-emerald-300" : "text-red-300")} />
                      <span className={cn(!result[key] && "text-red-200")}>{label}</span>
                    </li>
                  ))}
                </ul>
                <dl className="grid grid-cols-2 gap-3 rounded-xl bg-white/[0.04] p-3 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Accident</dt>
                    <dd>{result.accident_at && formatDateTime(result.accident_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Signé par A</dt>
                    <dd>{result.signed_at_a && formatDateTime(result.signed_at_a)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Signé par B</dt>
                    <dd>{result.signed_at_b && formatDateTime(result.signed_at_b)}</dd>
                  </div>
                </dl>
              </>
            )}
            <p className="text-[11px] text-muted-foreground">Aucune donnée personnelle n&apos;est affichée sur cette page.</p>
          </>
        )}
      </div>
    </main>
  );
}
