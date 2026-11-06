"use client";

import {
  BadgeCheck,
  Camera,
  Check,
  ChevronRight,
  ClipboardList,
  FileSignature,
  FolderPlus,
  Loader2,
  LocateFixed,
  Plus,
  Search,
  Sparkles,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import CasesChecklist from "../components/constat/CasesChecklist";
import { CoherenceList, LocationMap, PdfButton, QrShare, ResponsibilityBar, Seal } from "../components/constat/ConstatWidgets";
import { useMe } from "../components/AuthProvider";
import DamageZones from "../components/constat/DamageZones";
import SignaturePad from "../components/constat/SignaturePad";
import VoiceRecorder from "../components/constat/VoiceRecorder";
import { EmptyState } from "../components/dossier/ui";
import PhoneFrame, { fieldClass, labelClass } from "../components/PhoneFrame";
import {
  CASES,
  CONSTAT_STATUS,
  convertConstat,
  createConstat,
  currentPosition,
  extractCircumstances,
  getConstat,
  listConstats,
  lookupContract,
  signConstat,
  uploadConstatFile,
  type Constat,
  type ContractInfo,
  type Extraction,
  type Party,
  type Witness,
} from "../lib/constat";
import { DOSSIERS_UPDATED_EVENT, listActors, type Actor } from "../lib/dossiers";
import { formatDateTime } from "../lib/workflow";
import { usePolling } from "../lib/hooks";

const CITIES: Record<string, [number, number]> = {
  Tunis: [36.8065, 10.1815],
  Ariana: [36.8665, 10.1647],
  "Ben Arous": [36.7531, 10.2189],
  Sousse: [35.8256, 10.6084],
  Sfax: [34.7406, 10.7603],
  Nabeul: [36.4561, 10.7376],
};
const STEPS = ["Véhicule", "Lieu", "Récit", "Photos", "Envoi"];
const DEMO_CONTRACTS = [
  { label: "Sana Mejri", policy: "POL-584120", plate: "212 TU 4471", own: true },
  { label: "Mehdi Ben Youssef", policy: "POL-700100", plate: "180 TU 2025", own: false },
];
const CONSTATS_UPDATED = "constats:updated";

const EMPTY_PARTY: Party = { name: "", phone: "", cin: "", email: "", address: "", policy_id: "", insurer: "", plate: "", make_model: "", cases: [], damage: [] };

const localNow = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

function Wizard({ onCreated }: { onCreated: (id: string) => void }) {
  const { me } = useMe();
  // An insured may only identify their own vehicle: offer only the demo contract linked to their account.
  const demoContracts = DEMO_CONTRACTS.filter((d) => me?.role !== "assure" || d.own);
  const [step, setStep] = useState(0);
  const [policy, setPolicy] = useState("");
  const [plate, setPlate] = useState("");
  const [contract, setContract] = useState<ContractInfo | null>(null);
  const [looking, setLooking] = useState(false);
  const [party, setParty] = useState<Party>(EMPTY_PARTY);
  const [accidentAt, setAccidentAt] = useState("");
  const [city, setCity] = useState("Tunis");
  const [address, setAddress] = useState("");
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [audio, setAudio] = useState<Blob | null>(null);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [witnesses, setWitnesses] = useState<Witness[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const previews = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  async function identify(p = policy, pl = plate) {
    setLooking(true);
    try {
      const c = await lookupContract(p, pl);
      setContract(c);
      setParty((prev) => ({ ...prev, name: c.holder_name, phone: c.phone, cin: c.cin, email: c.email, policy_id: c.policy_id, insurer: c.insurer, plate: c.plate, make_model: c.make_model }));
      toast.success(`Véhicule identifié : ${c.make_model}`);
    } catch (err) {
      setContract(null);
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLooking(false);
    }
  }

  async function locate() {
    setLocating(true);
    const p = await currentPosition();
    setLocating(false);
    if (p) {
      setPos(p);
      toast.success("Position GPS enregistrée");
    } else {
      const [lat, lng] = CITIES[city];
      setPos({ lat, lng });
      toast.message("GPS indisponible : position approximative de la ville utilisée");
    }
  }

  async function analyse() {
    setAnalysing(true);
    try {
      const r = await extractCircumstances(transcript);
      setExtraction(r);
      setParty((p) => ({ ...p, cases: r.cases_a, damage: [...new Set([...p.damage, ...r.damage_a])] }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setAnalysing(false);
    }
  }

  async function submit() {
    setSubmitting(true);
    try {
      const fallback = CITIES[city];
      const c = await createConstat({
        accident_at: accidentAt,
        lat: pos?.lat ?? fallback[0],
        lng: pos?.lng ?? fallback[1],
        address: address || null,
        city,
        party_a: party,
        transcript_a: transcript || null,
        witnesses: witnesses.filter((w) => w.name.trim()),
      });
      for (const [i, f] of photos.entries()) await uploadConstatFile(c.id, f, f.name || `photo-${i}.jpg`, "photo");
      if (audio) await uploadConstatFile(c.id, audio, "message-vocal.webm", "vocal");
      toast.success(`Constat ${c.id} créé — partagez le QR code`);
      onCreated(c.id);
      setStep(0);
      setContract(null);
      setParty(EMPTY_PARTY);
      setTranscript("");
      setAudio(null);
      setExtraction(null);
      setPhotos([]);
      setWitnesses([]);
      setPos(null);
      setAccidentAt("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSubmitting(false);
    }
  }

  const canNext = [contract !== null && !!party.name && !!party.phone, !!accidentAt && !!city, party.cases.length > 0 || transcript.length > 10, true, true][step];

  return (
    <PhoneFrame
      title="Constat amiable digital"
      subtitle="Conducteur A · Sentinelle"
      icon={FileSignature}
      onBack={step > 0 ? () => setStep((s) => s - 1) : undefined}
      footer={
        <button
          onClick={() => {
            if (step === 0 && !accidentAt) setAccidentAt(localNow());
            if (step === 4) submit();
            else setStep((s) => s + 1);
          }}
          disabled={!canNext || submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-indigo-500 py-3 text-sm font-semibold text-slate-950 transition disabled:opacity-40"
        >
          {submitting ? <Loader2 className="size-4 animate-spin" /> : step === 4 ? <Check className="size-4" /> : <ChevronRight className="size-4" />}
          {step === 4 ? (submitting ? "Création…" : "Créer le constat & générer le QR") : "Continuer"}
        </button>
      }
    >
      <div className="flex gap-1.5 px-4 pt-3">
        {STEPS.map((s, i) => (
          <div key={s} className="flex-1">
            <div className={cn("h-1 rounded-full transition-all duration-500", i <= step ? "bg-cyan-300" : "bg-white/10")} />
            <p className={cn("mt-1 text-[10px]", i === step ? "text-cyan-200" : "text-muted-foreground")}>{s}</p>
          </div>
        ))}
      </div>

      <div key={step} className="flex-1 space-y-4 overflow-y-auto px-4 py-4 animate-fade-up">
        {step === 0 && (
          <>
            <h2 className="text-lg font-semibold">Identifiez votre véhicule</h2>
            <p className="text-xs text-muted-foreground">Numéro de contrat + immatriculation : vos informations sont pré-remplies.</p>
            <div className="flex flex-wrap gap-2">
              {demoContracts.map((d) => (
                <button
                  key={d.policy}
                  onClick={() => {
                    setPolicy(d.policy);
                    setPlate(d.plate);
                    identify(d.policy, d.plate);
                  }}
                  className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-muted-foreground transition hover:text-cyan-200"
                >
                  <Sparkles className="size-3" /> {d.label}
                </button>
              ))}
            </div>
            <label className="block">
              <span className={labelClass}>N° de contrat</span>
              <input value={policy} onChange={(e) => setPolicy(e.target.value)} placeholder="POL-000000" className={cn(fieldClass, "font-mono uppercase")} />
            </label>
            <label className="block">
              <span className={labelClass}>Immatriculation</span>
              <input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="123 TU 4567" className={cn(fieldClass, "font-mono uppercase")} />
            </label>
            <button
              onClick={() => identify()}
              disabled={!policy || !plate || looking}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-300/40 bg-cyan-400/10 py-2.5 text-sm text-cyan-100 disabled:opacity-40"
            >
              {looking ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Identifier le véhicule
            </button>
            {contract && (
              <div className="space-y-1 rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.06] p-3 text-sm animate-fade-up">
                <p className="flex items-center gap-2 font-medium text-emerald-200">
                  <BadgeCheck className="size-4" /> {contract.make_model} · {contract.plate}
                </p>
                <p className="text-xs text-muted-foreground">
                  {contract.holder_name} · {contract.insurer} · contrat {contract.valid ? "valide" : "non valide"} jusqu&apos;au{" "}
                  {new Date(contract.end_date).toLocaleDateString("fr-FR")}
                </p>
              </div>
            )}
            {contract && (
              <div className="grid grid-cols-2 gap-3">
                <label className="col-span-2 block">
                  <span className={labelClass}>Conducteur</span>
                  <input value={party.name} onChange={(e) => setParty({ ...party, name: e.target.value })} className={fieldClass} />
                </label>
                <label className="block">
                  <span className={labelClass}>Téléphone</span>
                  <input value={party.phone} onChange={(e) => setParty({ ...party, phone: e.target.value })} className={fieldClass} />
                </label>
                <label className="block">
                  <span className={labelClass}>Adresse</span>
                  <input value={party.address ?? ""} onChange={(e) => setParty({ ...party, address: e.target.value })} className={fieldClass} />
                </label>
              </div>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="text-lg font-semibold">Où et quand ?</h2>
            <label className="block">
              <span className={labelClass}>Date et heure de l&apos;accident</span>
              <input type="datetime-local" value={accidentAt} onChange={(e) => setAccidentAt(e.target.value)} className={fieldClass} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className={labelClass}>Ville</span>
                <select value={city} onChange={(e) => setCity(e.target.value)} className={fieldClass}>
                  {Object.keys(CITIES).map((c) => (
                    <option key={c} className="bg-slate-900">
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <button onClick={locate} className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-cyan-300/40 bg-cyan-400/10 text-sm text-cyan-100">
                {locating ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4" />} Me localiser
              </button>
            </div>
            <label className="block">
              <span className={labelClass}>Adresse / repère</span>
              <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Avenue, carrefour, rond-point…" className={fieldClass} />
            </label>
            {pos && <LocationMap lat={pos.lat} lng={pos.lng} className="h-44" />}
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-lg font-semibold">Racontez l&apos;accident</h2>
            <VoiceRecorder onTranscript={setTranscript} onAudio={setAudio} />
            {audio && <p className="text-[11px] text-emerald-300">Message vocal enregistré ({Math.round(audio.size / 1024)} Ko) — joint au constat</p>}
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={4}
              placeholder="Ex. : J'étais arrêté au feu rouge quand le véhicule derrière moi m'a percuté à l'arrière."
              className={cn(fieldClass, "h-auto py-2")}
            />
            <button
              onClick={analyse}
              disabled={transcript.length < 10 || analysing}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-indigo-500 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {analysing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Cocher les cases avec l&apos;IA
            </button>
            {extraction && (
              <p className="rounded-xl bg-fuchsia-500/10 p-3 text-xs text-fuchsia-100 ring-1 ring-fuchsia-400/20">
                <b>Agent Circonstances</b> ({extraction.source === "llm" ? "LLM" : "analyse linguistique"}) : {extraction.summary}
              </p>
            )}
            <p className="pt-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Vos cases (vérifiez)</p>
            <CasesChecklist value={party.cases} suggested={extraction?.cases_a} onChange={(cases) => setParty({ ...party, cases })} />
            <p className="pt-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Points de choc de votre véhicule</p>
            <DamageZones value={party.damage} hint={extraction?.damage_a} onChange={(damage) => setParty({ ...party, damage })} />
            <div className="space-y-2">
              <p className="flex items-center justify-between text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Témoins
                <button onClick={() => setWitnesses([...witnesses, { name: "", phone: "" }])} className="flex items-center gap-1 normal-case tracking-normal text-cyan-300">
                  <Plus className="size-3.5" /> Ajouter
                </button>
              </p>
              {witnesses.map((w, i) => (
                <div key={i} className="flex gap-2">
                  <input value={w.name} onChange={(e) => setWitnesses(witnesses.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Nom" className={fieldClass} />
                  <input value={w.phone ?? ""} onChange={(e) => setWitnesses(witnesses.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} placeholder="Téléphone" className={fieldClass} />
                  <button onClick={() => setWitnesses(witnesses.filter((_, j) => j !== i))} className="text-muted-foreground" aria-label="Retirer">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="text-lg font-semibold">Photos de l&apos;accident</h2>
            <p className="text-xs text-muted-foreground">Véhicules, plaques, position sur la chaussée. Les photos géolocalisées sont vérifiées par l&apos;Agent Photo.</p>
            <label className="grid h-28 cursor-pointer place-items-center rounded-2xl border border-dashed border-white/15 bg-white/[0.03] text-sm text-muted-foreground transition hover:border-cyan-300/40">
              <span className="flex items-center gap-2">
                <Camera className="size-5" /> Prendre / ajouter des photos
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={(e) => {
                  setPhotos((p) => [...p, ...Array.from(e.target.files ?? [])].slice(0, 6));
                  e.target.value = "";
                }}
              />
            </label>
            <div className="grid grid-cols-3 gap-2">
              {previews.map((u, i) => (
                <button key={u} onClick={() => setPhotos(photos.filter((_, j) => j !== i))} className="group relative aspect-square overflow-hidden rounded-xl" title="Retirer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
                  <img src={u} alt={`Photo ${i + 1}`} className="size-full object-cover" />
                  <span className="absolute inset-0 hidden place-items-center bg-black/60 group-hover:grid">
                    <Trash2 className="size-4" />
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h2 className="text-lg font-semibold">Récapitulatif</h2>
            <div className="space-y-1.5 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm">
              <p className="font-medium">
                {party.name} · <span className="font-mono">{party.plate}</span>
              </p>
              <p className="text-muted-foreground">
                {accidentAt && new Date(accidentAt).toLocaleString("fr-FR")} · {address || city}
              </p>
              <p className="text-muted-foreground">Cases : {party.cases.length ? party.cases.join(", ") : "aucune"} · chocs : {party.damage.join(", ") || "—"}</p>
              <p className="text-muted-foreground">
                {photos.length} photo(s) · {audio ? "message vocal" : "pas de vocal"} · {witnesses.filter((w) => w.name).length} témoin(s)
              </p>
            </div>
            <p className="text-xs text-muted-foreground">Un QR code sera généré pour que l&apos;autre conducteur complète et signe sa partie.</p>
          </>
        )}
      </div>
    </PhoneFrame>
  );
}

function ConstatTracker({ id }: { id: string }) {
  const fetcher = useCallback(() => getConstat(id), [id]);
  const { data: c, refresh } = usePolling<Constat>(fetcher, { intervalMs: 3000 });
  const [signature, setSignature] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [amount, setAmount] = useState("");
  const [garageId, setGarageId] = useState("");
  const [garages, setGarages] = useState<Actor[]>([]);
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    listActors("garage").then(setGarages).catch(() => setGarages([]));
  }, []);

  if (!c) return <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />;
  const status = CONSTAT_STATUS[c.status];

  async function sign() {
    if (!signature) return;
    setSigning(true);
    try {
      const pos = await currentPosition();
      await signConstat(c!.id, { image: signature, lat: pos?.lat ?? null, lng: pos?.lng ?? null });
      toast.success("Constat signé");
      await refresh();
      window.dispatchEvent(new Event(CONSTATS_UPDATED));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSigning(false);
    }
  }

  async function convert() {
    setConverting(true);
    try {
      const { dossier_id } = await convertConstat(c!.id, Number(amount), garageId || null);
      toast.success(`Dossier ${dossier_id} créé et analysé par les agents`);
      await refresh();
      window.dispatchEvent(new Event(CONSTATS_UPDATED));
      window.dispatchEvent(new Event(DOSSIERS_UPDATED_EVENT));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setConverting(false);
    }
  }

  return (
    <Card className="animate-fade-up">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="font-mono text-base">{c.id}</CardTitle>
        <span className="rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ color: status.color, background: `${status.color}1f`, boxShadow: `inset 0 0 0 1px ${status.color}55` }}>
          {status.label}
        </span>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1 text-sm">
            <p className="text-muted-foreground">{formatDateTime(c.accident_at)} · {c.address ?? c.city}</p>
            <p>
              <span className="text-cyan-300">A</span> · {c.party_a.name} · <span className="font-mono text-xs">{c.party_a.plate}</span>
            </p>
            <p className="text-xs text-muted-foreground">Cases A : {c.party_a.cases.join(", ") || "—"} · chocs : {c.party_a.damage.join(", ") || "—"}</p>
            {c.party_b ? (
              <>
                <p>
                  <span className="text-fuchsia-300">B</span> · {c.party_b.name} · <span className="font-mono text-xs">{c.party_b.plate}</span>
                </p>
                <p className="text-xs text-muted-foreground">Cases B : {c.party_b.cases.join(", ") || "—"} · chocs : {c.party_b.damage.join(", ") || "—"}</p>
              </>
            ) : (
              <p className="flex items-center gap-2 text-xs text-amber-200">
                <Loader2 className="size-3.5 animate-spin" /> En attente du conducteur B…
              </p>
            )}
            {c.witnesses.length > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="size-3.5" /> Témoins : {c.witnesses.map((w) => w.name).join(", ")}
              </p>
            )}
          </div>
          {c.lat != null && c.lng != null && <LocationMap lat={c.lat} lng={c.lng} className="h-36" />}
        </div>

        {c.transcript_a && (
          <blockquote className="rounded-xl border-l-2 border-fuchsia-400/60 bg-white/[0.03] px-3 py-2 text-xs italic text-muted-foreground">
            « {c.transcript_a} »
          </blockquote>
        )}

        {!c.party_b && <QrShare token={c.token} />}

        <div className="flex flex-wrap gap-2 text-xs">
          <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 ring-1", c.signed_a ? "text-emerald-300 ring-emerald-400/30" : "text-muted-foreground ring-white/10")}>
            {c.signed_a ? <Check className="size-3" /> : <UserRound className="size-3" />} Signature A
          </span>
          <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 ring-1", c.signed_b ? "text-emerald-300 ring-emerald-400/30" : "text-muted-foreground ring-white/10")}>
            {c.signed_b ? <Check className="size-3" /> : <UserRound className="size-3" />} Signature B
          </span>
        </div>

        {!c.signed_a && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Votre signature (conducteur A)</p>
            <SignaturePad onChange={setSignature} />
            <button
              onClick={sign}
              disabled={!signature || signing}
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-400 to-indigo-500 px-4 py-2 text-xs font-semibold text-slate-950 disabled:opacity-40"
            >
              {signing ? <Loader2 className="size-3.5 animate-spin" /> : <FileSignature className="size-3.5" />} Signer le constat
            </button>
          </div>
        )}

        {c.analysis.responsibility && <ResponsibilityBar r={c.analysis.responsibility} />}
        {c.analysis.coherence && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300/80">Contrôle de cohérence</p>
            <CoherenceList flags={c.analysis.coherence} />
          </div>
        )}
        {c.seal && <Seal seal={c.seal} />}
        <PdfButton constatId={c.id} signed={c.status === "signe" || c.status === "converti"} />

        {c.status === "signe" && (
          <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <FolderPlus className="size-4 text-cyan-300" /> Ouvrir le dossier sinistre
            </p>
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Montant estimé (DT)" className={fieldClass} />
              <select value={garageId} onChange={(e) => setGarageId(e.target.value)} className={fieldClass}>
                <option value="" className="bg-slate-900">
                  Garage (optionnel)
                </option>
                {garages.map((g) => (
                  <option key={g.id} value={g.id} className="bg-slate-900">
                    {g.name} ({g.city})
                  </option>
                ))}
              </select>
              <button
                onClick={convert}
                disabled={!(Number(amount) > 0) || converting}
                className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-indigo-500 px-4 text-sm font-semibold text-slate-950 disabled:opacity-40"
              >
                {converting ? <Loader2 className="size-4 animate-spin" /> : <ChevronRight className="size-4" />} Créer
              </button>
            </div>
          </div>
        )}
        {c.dossier_id && (
          <Link href={`/dossiers/${c.dossier_id}`} className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-xs font-semibold transition hover:bg-white/15">
            Voir le dossier {c.dossier_id} <ChevronRight className="size-3.5" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

export default function ConstatPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const { data: constats } = usePolling(listConstats, { intervalMs: 10000, refreshOn: CONSTATS_UPDATED });

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[auto_1fr] lg:items-start">
      <Wizard
        onCreated={(id) => {
          setSelected(id);
          window.dispatchEvent(new Event(CONSTATS_UPDATED));
        }}
      />

      <div className="min-w-0 space-y-5">
        <div className="animate-fade-up">
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300/80">e-Constat</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            Le constat amiable, <span className="text-gradient">digital et vérifié</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Identification par contrat + immatriculation, géolocalisation, récit vocal transformé en cases par l&apos;IA, partage par QR
            code, double signature électronique scellée (SHA-256), barème de responsabilité et contrôle de cohérence anti-fraude.
          </p>
        </div>

        {selected ? (
          <ConstatTracker key={selected} id={selected} />
        ) : (
          <EmptyState>Créez un constat avec l&apos;assistant, ou ouvrez un constat récent ci-dessous.</EmptyState>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ClipboardList className="size-4 text-cyan-300" /> Constats récents
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!constats || constats.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun constat.</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {constats.map((c) => {
                  const st = CONSTAT_STATUS[c.status];
                  const flags = c.analysis.coherence?.filter((f) => f.level !== "low").length ?? 0;
                  return (
                    <li key={c.id}>
                      <button
                        onClick={() => setSelected(c.id)}
                        className={cn("flex w-full items-center gap-3 px-2 py-2.5 text-left text-sm transition hover:bg-white/[0.04]", selected === c.id && "bg-white/[0.06]")}
                      >
                        <span className="font-mono text-xs text-cyan-200">{c.id}</span>
                        <span className="min-w-0 flex-1 truncate">
                          {c.party_a.name}
                          {c.party_b ? ` / ${c.party_b.name}` : ""}
                        </span>
                        {c.analysis.responsibility && (
                          <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline">
                            {c.analysis.responsibility.a}/{c.analysis.responsibility.b}
                          </span>
                        )}
                        {flags > 0 && <span className="rounded-full bg-red-500/15 px-1.5 text-[10px] text-red-300">{flags} ⚠</span>}
                        <span className="size-2 rounded-full" style={{ background: st.color }} title={st.label} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-3 text-[11px] text-muted-foreground">Cases officielles du constat : {Object.keys(CASES).length} · signature + géolocalisation horodatées</p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
