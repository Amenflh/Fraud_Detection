"use client";

import { CheckCircle2, ChevronRight, FileSignature, Loader2, MapPin, Sparkles } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import CasesChecklist from "../../../components/constat/CasesChecklist";
import { LocationMap } from "../../../components/constat/ConstatWidgets";
import DamageZones from "../../../components/constat/DamageZones";
import SignaturePad from "../../../components/constat/SignaturePad";
import { EmptyState } from "../../../components/dossier/ui";
import PhoneFrame, { fieldClass, labelClass } from "../../../components/PhoneFrame";
import {
  CASES,
  currentPosition,
  extractCircumstances,
  getPublicConstat,
  submitPartyB,
  type Party,
  type PublicConstat,
} from "../../../lib/constat";
import { formatDateTime } from "../../../lib/workflow";

const STEPS = ["Accident", "Vous", "Circonstances", "Signature"];

export default function DriverBPage() {
  const { token } = useParams<{ token: string }>();
  const [constat, setConstat] = useState<PublicConstat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [party, setParty] = useState<Party>({ name: "", phone: "", cin: "", insurer: "", address: "", plate: "", make_model: "", cases: [], damage: [] });
  const [story, setStory] = useState("");
  const [suggested, setSuggested] = useState<number[]>([]);
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    getPublicConstat(token)
      .then((c) => {
        setConstat(c);
        setDone(c.signed_b);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur"));
  }, [token]);

  async function analyse() {
    setBusy(true);
    try {
      const r = await extractCircumstances(story);
      setSuggested(r.cases_a);
      setParty((p) => ({ ...p, cases: r.cases_a, damage: [...new Set([...p.damage, ...r.damage_a])] }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!signature) return;
    setBusy(true);
    try {
      const pos = await currentPosition();
      await submitPartyB(token, { ...party, observations: story || null }, { image: signature, lat: pos?.lat ?? null, lng: pos?.lng ?? null });
      setDone(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  const canNext = [true, !!party.name && !!party.phone && !!party.plate && !!party.make_model, true, !!signature][step];

  return (
    <main className="mx-auto w-full max-w-6xl px-0 py-0 sm:px-6 sm:py-8">
      <PhoneFrame
        title="Constat amiable digital"
        subtitle="Conducteur B · accès par QR code"
        icon={FileSignature}
        onBack={step > 0 && !done ? () => setStep((s) => s - 1) : undefined}
        footer={
          constat && !done ? (
            <button
              onClick={() => (step === 3 ? submit() : setStep((s) => s + 1))}
              disabled={!canNext || busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-indigo-500 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : step === 3 ? <FileSignature className="size-4" /> : <ChevronRight className="size-4" />}
              {step === 3 ? "Signer et envoyer" : "Continuer"}
            </button>
          ) : undefined
        }
      >
        {error && (
          <div className="p-4">
            <EmptyState>{error}</EmptyState>
          </div>
        )}
        {!constat && !error && <Loader2 className="mx-auto mt-20 size-6 animate-spin text-muted-foreground" />}

        {constat && done && (
          <div className="flex flex-1 flex-col items-center px-6 pt-16 text-center animate-fade-up">
            <span className="relative grid size-20 place-items-center rounded-full bg-emerald-400/15 text-emerald-300">
              <span className="absolute inset-0 rounded-full ring-2 ring-emerald-300/40 animate-pulse-ring" />
              <CheckCircle2 className="size-10" />
            </span>
            <h2 className="mt-5 text-xl font-semibold">Merci, votre partie est signée</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Constat <span className="font-mono text-cyan-200">{constat.id}</span>. Dès la signature du conducteur A, le document est scellé et transmis aux deux
              assureurs.
            </p>
          </div>
        )}

        {constat && !done && (
          <>
            <div className="flex gap-1.5 px-4 pt-3">
              {STEPS.map((s, i) => (
                <div key={s} className="flex-1">
                  <div className={cn("h-1 rounded-full transition-all duration-500", i <= step ? "bg-fuchsia-300" : "bg-white/10")} />
                  <p className={cn("mt-1 text-[10px]", i === step ? "text-fuchsia-200" : "text-muted-foreground")}>{s}</p>
                </div>
              ))}
            </div>
            <div key={step} className="flex-1 space-y-4 overflow-y-auto px-4 py-4 animate-fade-up">
              {step === 0 && (
                <>
                  <h2 className="text-lg font-semibold">Accident déclaré par le conducteur A</h2>
                  <div className="space-y-1 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm">
                    <p>{formatDateTime(constat.accident_at)}</p>
                    <p className="flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="size-3.5" /> {constat.address ?? constat.city}
                    </p>
                    <p>
                      Véhicule A : {constat.vehicle_a.make_model} · <span className="font-mono">{constat.vehicle_a.plate}</span>
                    </p>
                    {constat.vehicle_a.insurer && <p className="text-muted-foreground">Assureur A : {constat.vehicle_a.insurer}</p>}
                  </div>
                  {constat.lat != null && constat.lng != null && <LocationMap lat={constat.lat} lng={constat.lng} className="h-40" />}
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Cases cochées par A</p>
                    <ul className="space-y-1 text-xs">
                      {constat.cases_a.length === 0 && <li className="text-muted-foreground">Aucune</li>}
                      {constat.cases_a.map((n) => (
                        <li key={n} className="rounded-lg bg-cyan-400/10 px-2.5 py-1.5 text-cyan-100">
                          {n}. {CASES[n]}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

              {step === 1 && (
                <>
                  <h2 className="text-lg font-semibold">Vos informations</h2>
                  {(
                    [
                      ["name", "Nom complet"],
                      ["phone", "Téléphone"],
                      ["cin", "CIN"],
                      ["address", "Adresse"],
                      ["plate", "Immatriculation"],
                      ["make_model", "Marque / modèle"],
                      ["insurer", "Votre assureur"],
                    ] as const
                  ).map(([k, l]) => (
                    <label key={k} className="block">
                      <span className={labelClass}>{l}</span>
                      <input value={(party[k] as string) ?? ""} onChange={(e) => setParty({ ...party, [k]: e.target.value })} className={cn(fieldClass, k === "plate" && "font-mono uppercase")} />
                    </label>
                  ))}
                </>
              )}

              {step === 2 && (
                <>
                  <h2 className="text-lg font-semibold">Votre version des faits</h2>
                  <textarea value={story} onChange={(e) => setStory(e.target.value)} rows={3} placeholder="Décrivez ce que vous faisiez au moment du choc…" className={cn(fieldClass, "h-auto py-2")} />
                  <button
                    onClick={analyse}
                    disabled={story.length < 10 || busy}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-indigo-500 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Cocher les cases avec l&apos;IA
                  </button>
                  <CasesChecklist value={party.cases} suggested={suggested} onChange={(cases) => setParty({ ...party, cases })} />
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Points de choc de votre véhicule</p>
                  <DamageZones value={party.damage} onChange={(damage) => setParty({ ...party, damage })} />
                </>
              )}

              {step === 3 && (
                <>
                  <h2 className="text-lg font-semibold">Signature</h2>
                  <p className="text-xs text-muted-foreground">
                    En signant, vous confirmez votre version. Le constat sera scellé (empreinte SHA-256) : toute modification ultérieure serait détectable.
                  </p>
                  <SignaturePad onChange={setSignature} />
                </>
              )}
            </div>
          </>
        )}
      </PhoneFrame>
    </main>
  );
}
