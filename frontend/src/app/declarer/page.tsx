"use client";

import {
  ArrowLeft,
  Bot,
  Camera,
  Car,
  Check,
  CheckCircle2,
  ChevronRight,
  Flame,
  Hammer,
  HelpCircle,
  Loader2,
  MapPin,
  RotateCcw,
  ShieldAlert,
  Signal,
  Sparkles,
  UserX,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { NetworkBadge, VerdictPill } from "../components/dossier/ui";
import {
  createDossier,
  DOSSIERS_UPDATED_EVENT,
  listActors,
  uploadDocument,
  type Actor,
  type DossierCreate,
  type DossierDetail,
} from "../lib/dossiers";
import { useNow } from "../lib/hooks";
import { formatAmount } from "../lib/workflow";

const CITIES = ["Tunis", "Ariana", "Ben Arous", "Sousse", "Sfax", "Nabeul"];
const INCIDENTS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "collision", label: "Collision", icon: Car },
  { value: "theft", label: "Vol", icon: UserX },
  { value: "fire", label: "Incendie", icon: Flame },
  { value: "vandalism", label: "Vandalisme", icon: Hammer },
  { value: "other", label: "Autre", icon: HelpCircle },
];
const FACES = [
  { kind: "photo_avant", label: "Face Avant" },
  { kind: "photo_arriere", label: "Face Arrière" },
  { kind: "photo_gauche", label: "Côté Gauche" },
  { kind: "photo_droite", label: "Côté Droit" },
];
const STEPS = ["Assuré", "Sinistre", "Photos", "Envoi"];

type Form = {
  name: string;
  phone: string;
  cin: string;
  email: string;
  plate: string;
  make_model: string;
  year: string;
  policy_id: string;
  policy_start: string;
  incident_type: string;
  claim_date: string;
  city: string;
  address: string;
  claim_amount: string;
  prior_claims_count: string;
  garage_id: string;
  description: string;
};

const EMPTY: Form = {
  name: "",
  phone: "",
  cin: "",
  email: "",
  plate: "",
  make_model: "",
  year: "",
  policy_id: "",
  policy_start: "",
  incident_type: "collision",
  claim_date: "",
  city: "Tunis",
  address: "",
  claim_amount: "",
  prior_claims_count: "0",
  garage_id: "",
  description: "",
};

const isoDaysAgo = (days: number, now: Date) => new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);

function examples(now: Date): { label: string; icon: LucideIcon; tone: string; form: Form }[] {
  return [
    {
      label: "Assuré de bonne foi",
      icon: CheckCircle2,
      tone: "hover:border-emerald-400/50 hover:text-emerald-300",
      form: {
        name: "Sana Mejri",
        phone: "+216 22 418 903",
        cin: "09876543",
        email: "sana.mejri@exemple.tn",
        plate: "212 TU 4471",
        make_model: "Peugeot 208",
        year: "2020",
        policy_id: "POL-584120",
        policy_start: isoDaysAgo(1460, now),
        incident_type: "collision",
        claim_date: isoDaysAgo(0, now),
        city: "Tunis",
        address: "Avenue Habib Bourguiba, Tunis",
        claim_amount: "3200",
        prior_claims_count: "0",
        garage_id: "GAR-01",
        description: "Accrochage à un feu rouge, pare-choc avant endommagé, constat amiable signé.",
      },
    },
    {
      label: "Scénario fraudeur",
      icon: ShieldAlert,
      tone: "hover:border-red-400/50 hover:text-red-300",
      form: {
        name: "Karim Haddad",
        phone: "+216 98 765 432",
        cin: "14725836",
        email: "k.haddad@exemple.tn",
        plate: "231 TU 8890",
        make_model: "Volkswagen Golf 6",
        year: "2019",
        policy_id: "POL-990211",
        policy_start: isoDaysAgo(120, now),
        incident_type: "theft",
        claim_date: isoDaysAgo(1, now),
        city: "Ben Arous",
        address: "Zone industrielle, Ben Arous",
        claim_amount: "9500",
        prior_claims_count: "5",
        garage_id: "GAR-03",
        description: "Véhicule retrouvé endommagé, pas de témoin.",
      },
    },
  ];
}

type AgentStep = { label: string; state: "pending" | "active" | "done" | "alert"; detail?: string };

export default function DeclarerPage() {
  const now = useNow(60_000);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(EMPTY);
  const [photos, setPhotos] = useState<Record<string, File>>({});
  const [face, setFace] = useState(0);
  const [garages, setGarages] = useState<Actor[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [agents, setAgents] = useState<AgentStep[]>([]);
  const [result, setResult] = useState<DossierDetail | null>(null);

  useEffect(() => {
    listActors("garage").then(setGarages).catch(() => setGarages([]));
  }, []);

  const previews = useMemo(
    () => Object.fromEntries(Object.entries(photos).map(([k, f]) => [k, URL.createObjectURL(f)])),
    [photos]
  );
  useEffect(() => () => Object.values(previews).forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const stepValid = [
    form.name && form.phone && form.plate && form.make_model && form.policy_id && form.policy_start,
    form.claim_date && form.city && Number(form.claim_amount) > 0,
    true,
    true,
  ][step];

  const cityGarages = [...garages].sort((a, b) => Number(b.city === form.city) - Number(a.city === form.city));

  function patchAgent(i: number, patch: Partial<AgentStep>) {
    setAgents((list) => list.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  }

  async function submit() {
    if (!now) return;
    setSubmitting(true);
    const photoEntries = FACES.filter((f) => photos[f.kind]);
    setAgents([
      { label: "Création du dossier", state: "active" },
      { label: "Pipeline antifraude (4 agents)", state: "pending" },
      { label: "Agent Réseau", state: "pending" },
      { label: "Agent Dispatch", state: "pending" },
      ...photoEntries.map((f) => ({ label: `Agent Photo · ${f.label}`, state: "pending" as const })),
      { label: "Copilote", state: "pending" },
    ]);

    const payload: DossierCreate = {
      policy_id: form.policy_id,
      claim_amount: Number(form.claim_amount),
      claim_date: form.claim_date,
      incident_type: form.incident_type,
      days_since_policy_start: Math.max(0, Math.round((new Date(form.claim_date).getTime() - new Date(form.policy_start).getTime()) / 86_400_000)),
      prior_claims_count: Number(form.prior_claims_count) || 0,
      vehicle_age: form.year ? now.getFullYear() - Number(form.year) : null,
      claim_description: form.description || null,
      insured: { name: form.name, phone: form.phone, cin: form.cin || null, email: form.email || null },
      vehicle: { plate: form.plate, make_model: form.make_model, year: form.year ? Number(form.year) : null },
      city: form.city,
      address: form.address || null,
      garage_id: form.garage_id || null,
      channel: "mobile",
    };

    try {
      const created = await createDossier(payload);
      patchAgent(0, { state: "done", detail: created.id });
      patchAgent(1, {
        state: created.verdict === "not_fraud" ? "done" : "alert",
        detail: `score ${created.risk_score?.toFixed(2)}`,
      });
      patchAgent(2, { state: created.network_level === "none" ? "done" : "alert", detail: created.ai.network.summary });
      patchAgent(3, { state: "done", detail: created.ai.dispatch[0] ? `→ ${created.ai.dispatch[0].name}` : "aucun expert" });

      for (const [i, f] of photoEntries.entries()) {
        patchAgent(4 + i, { state: "active" });
        const doc = await uploadDocument(created.id, photos[f.kind], photos[f.kind].name, f.kind, "assure");
        patchAgent(4 + i, {
          state: doc.analysis.verdict === "suspect" ? "alert" : "done",
          detail: doc.analysis.flags?.find((fl) => fl.level !== "info")?.text ?? "photo vérifiée",
        });
      }
      patchAgent(4 + photoEntries.length, { state: "done", detail: "prochaine action prête" });
      setResult(created);
      setStep(4);
      window.dispatchEvent(new Event(DOSSIERS_UPDATED_EVENT));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
      setAgents([]);
    } finally {
      setSubmitting(false);
    }
  }

  const fieldClass =
    "h-11 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 text-sm outline-none transition placeholder:text-muted-foreground/60 focus:border-cyan-300/60 focus:bg-white/[0.09]";
  const labelClass = "mb-1 block text-xs text-muted-foreground";

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[auto_1fr] lg:items-start">
      {/* Phone mock-up (full width on small screens) */}
      <div className="mx-auto w-full max-w-[400px] animate-fade-up sm:rounded-[52px] sm:border-[10px] sm:border-slate-800 sm:bg-slate-950 sm:shadow-[0_30px_80px_-20px_rgb(34_211_238/0.35)]">
        <div className="relative flex h-[min(800px,85vh)] flex-col overflow-hidden bg-background sm:rounded-[42px]">
          <div className="hidden items-center justify-between px-7 pb-1 pt-3 text-[11px] text-muted-foreground sm:flex">
            <span className="tabular-nums">{now ? now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "--:--"}</span>
            <span className="h-5 w-24 rounded-full bg-slate-900" />
            <span className="flex items-center gap-1">
              <Signal className="size-3" /> <Wifi className="size-3" />
            </span>
          </div>

          <header className="flex items-center gap-3 bg-gradient-to-r from-cyan-500/90 to-indigo-600/90 px-4 py-3.5 text-white">
            {step > 0 && step < 4 ? (
              <button onClick={() => setStep((s) => s - 1)} aria-label="Retour">
                <ArrowLeft className="size-5" />
              </button>
            ) : (
              <Car className="size-5" />
            )}
            <div className="flex-1">
              <p className="text-sm font-semibold">{step === 4 ? "Déclaration envoyée" : "Déclarer un sinistre"}</p>
              <p className="text-[11px] opacity-80">Sentinelle · espace assuré</p>
            </div>
          </header>

          {step < 4 && (
            <div className="flex gap-1.5 px-4 pt-3">
              {STEPS.map((s, i) => (
                <div key={s} className="flex-1">
                  <div className={cn("h-1 rounded-full transition-all duration-500", i <= step ? "bg-cyan-300" : "bg-white/10")} />
                  <p className={cn("mt-1 text-[10px]", i === step ? "text-cyan-200" : "text-muted-foreground")}>{s}</p>
                </div>
              ))}
            </div>
          )}

          <div key={step} className="flex-1 space-y-4 overflow-y-auto px-4 py-4 animate-fade-up">
            {step === 0 && (
              <>
                <div className="flex flex-wrap gap-2">
                  {now &&
                    examples(now).map(({ label, icon: Icon, tone, form: f }) => (
                      <button
                        key={label}
                        onClick={() => setForm(f)}
                        className={cn("flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-muted-foreground transition", tone)}
                      >
                        <Sparkles className="size-3" /> <Icon className="size-3" /> {label}
                      </button>
                    ))}
                </div>
                <h2 className="text-lg font-semibold">Vos informations</h2>
                {(
                  [
                    ["name", "Nom complet", "text"],
                    ["phone", "Téléphone", "tel"],
                    ["cin", "CIN", "text"],
                    ["email", "Email", "email"],
                  ] as const
                ).map(([k, l, t]) => (
                  <label key={k} className="block">
                    <span className={labelClass}>{l}</span>
                    <input type={t} value={form[k]} onChange={set(k)} className={fieldClass} />
                  </label>
                ))}
                <h2 className="pt-2 text-lg font-semibold">Véhicule & contrat</h2>
                <div className="grid grid-cols-2 gap-3">
                  <label className="col-span-2 block">
                    <span className={labelClass}>Immatriculation</span>
                    <input value={form.plate} onChange={set("plate")} placeholder="123 TU 4567" className={cn(fieldClass, "font-mono")} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Marque / modèle</span>
                    <input value={form.make_model} onChange={set("make_model")} className={fieldClass} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Année</span>
                    <input type="number" value={form.year} onChange={set("year")} className={fieldClass} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>N° de contrat</span>
                    <input value={form.policy_id} onChange={set("policy_id")} className={fieldClass} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Début du contrat</span>
                    <input type="date" value={form.policy_start} onChange={set("policy_start")} className={fieldClass} />
                  </label>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <h2 className="text-lg font-semibold">Que s&apos;est-il passé ?</h2>
                <div className="grid grid-cols-3 gap-2">
                  {INCIDENTS.map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      onClick={() => setForm((f) => ({ ...f, incident_type: value }))}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs transition active:scale-95",
                        form.incident_type === value ? "border-cyan-300/60 bg-cyan-400/15 text-cyan-100" : "border-white/10 bg-white/[0.04] text-muted-foreground"
                      )}
                    >
                      <Icon className="size-5" /> {label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className={labelClass}>Date</span>
                    <input type="date" value={form.claim_date} onChange={set("claim_date")} className={fieldClass} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Montant estimé (DT)</span>
                    <input type="number" min={1} value={form.claim_amount} onChange={set("claim_amount")} className={fieldClass} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Ville</span>
                    <select value={form.city} onChange={set("city")} className={fieldClass}>
                      {CITIES.map((c) => (
                        <option key={c} className="bg-slate-900">
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className={labelClass}>Sinistres passés</span>
                    <input type="number" min={0} value={form.prior_claims_count} onChange={set("prior_claims_count")} className={fieldClass} />
                  </label>
                </div>
                <label className="block">
                  <span className={labelClass}>Adresse de l&apos;accident</span>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input value={form.address} onChange={set("address")} className={cn(fieldClass, "pl-9")} />
                  </div>
                </label>
                <label className="block">
                  <span className={labelClass}>Garage souhaité</span>
                  <select value={form.garage_id} onChange={set("garage_id")} className={fieldClass}>
                    <option value="" className="bg-slate-900">
                      — Je choisirai plus tard —
                    </option>
                    {cityGarages.map((g) => (
                      <option key={g.id} value={g.id} className="bg-slate-900">
                        {g.name} ({g.city})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className={labelClass}>Description</span>
                  <textarea value={form.description} onChange={set("description")} rows={3} className={cn(fieldClass, "h-auto py-2")} />
                </label>
              </>
            )}

            {step === 2 && (
              <div className="flex h-full flex-col">
                <h2 className="text-lg font-semibold">Photos des 4 faces</h2>
                <p className="text-sm text-muted-foreground">Prenez une photo claire de la {FACES[face].label}</p>
                <label className="relative mt-4 grid aspect-[4/3.4] cursor-pointer place-items-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
                  {previews[FACES[face].kind] ? (
                    // eslint-disable-next-line @next/next/no-img-element -- local blob preview
                    <img src={previews[FACES[face].kind]} alt={FACES[face].label} className="absolute inset-0 size-full object-cover" />
                  ) : (
                    <span className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                      <span className="relative grid size-16 place-items-center rounded-full bg-cyan-400/15 text-cyan-200">
                        <span className="absolute inset-0 rounded-full ring-1 ring-cyan-300/40 animate-pulse-ring" />
                        <Camera className="size-7" />
                      </span>
                      Toucher pour prendre la photo
                    </span>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setPhotos((p) => ({ ...p, [FACES[face].kind]: file }));
                      e.target.value = "";
                    }}
                  />
                  <span className="absolute bottom-3 rounded-full bg-black/60 px-3 py-1 text-xs backdrop-blur">
                    {face + 1}/4
                  </span>
                </label>
                <p className="mt-2 text-center text-sm font-medium text-cyan-200">{FACES[face].label}</p>
                <div className="mt-2 flex justify-center gap-1.5">
                  {FACES.map((f, i) => (
                    <button key={f.kind} onClick={() => setFace(i)} className={cn("size-2 rounded-full transition", photos[f.kind] ? "bg-emerald-400" : i === face ? "bg-cyan-300" : "bg-white/20")} aria-label={f.label} />
                  ))}
                </div>
                <div className="mt-auto flex gap-3 pt-5">
                  <button
                    onClick={() => setPhotos((p) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== FACES[face].kind)))}
                    disabled={!photos[FACES[face].kind]}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-semibold disabled:opacity-40"
                  >
                    REFAIRE <RotateCcw className="size-4" />
                  </button>
                  <button
                    onClick={() => (face < 3 ? setFace(face + 1) : setStep(3))}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-rose-500 py-3 text-sm font-semibold text-white"
                  >
                    <Check className="size-4" /> {photos[FACES[face].kind] ? "SUIVANT" : "PASSER"}
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <>
                <h2 className="text-lg font-semibold">Vérifiez et envoyez</h2>
                <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm">
                  <p className="font-medium">{form.name}</p>
                  <p className="text-muted-foreground">
                    {form.make_model} · <span className="font-mono">{form.plate}</span>
                  </p>
                  <p className="text-muted-foreground">
                    {INCIDENTS.find((i) => i.value === form.incident_type)?.label} le {form.claim_date && new Date(form.claim_date).toLocaleDateString("fr-FR")} à {form.city}
                  </p>
                  <p>Montant estimé : {formatAmount(Number(form.claim_amount) || 0)}</p>
                  <p className="text-muted-foreground">{Object.keys(photos).length}/4 photos jointes</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  En envoyant, vous certifiez l&apos;exactitude des informations. Vous serez notifié par SMS à chaque étape.
                </p>
              </>
            )}

            {step === 4 && result && (
              <div className="flex flex-col items-center pt-8 text-center">
                <span className="relative grid size-20 place-items-center rounded-full bg-emerald-400/15 text-emerald-300">
                  <span className="absolute inset-0 rounded-full ring-2 ring-emerald-300/40 animate-pulse-ring" />
                  <CheckCircle2 className="size-10" />
                </span>
                <h2 className="mt-5 text-xl font-semibold">Déclaration reçue</h2>
                <p className="mt-1 text-sm text-muted-foreground">Votre numéro de sinistre</p>
                <p className="mt-2 rounded-xl bg-white/5 px-4 py-2 font-mono text-lg text-cyan-200">{result.id}</p>
                <p className="mt-4 max-w-[260px] text-sm text-muted-foreground">
                  Un gestionnaire prend en charge votre dossier. Vous recevrez un SMS à chaque étape.
                </p>
                <button
                  onClick={() => {
                    setStep(0);
                    setForm(EMPTY);
                    setPhotos({});
                    setFace(0);
                    setResult(null);
                    setAgents([]);
                  }}
                  className="mt-6 text-sm text-cyan-300 hover:underline"
                >
                  Nouvelle déclaration
                </button>
              </div>
            )}
          </div>

          {step < 4 && step !== 2 && (
            <div className="border-t border-white/10 p-4">
              <button
                onClick={() => (step === 3 ? submit() : setStep((s) => s + 1))}
                disabled={!stepValid || submitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-indigo-500 py-3 text-sm font-semibold text-slate-950 transition disabled:opacity-40"
              >
                {submitting ? <Loader2 className="size-4 animate-spin" /> : step === 3 ? <Check className="size-4" /> : <ChevronRight className="size-4" />}
                {step === 3 ? (submitting ? "Envoi…" : "Envoyer la déclaration") : "Continuer"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Behind the scenes: what the AI does with the declaration */}
      <div className="space-y-5">
        <div className="animate-fade-up">
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300/80">Parcours assuré augmenté</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            Déclaration mobile, <span className="text-gradient">analysée en temps réel</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            L&apos;assuré déclare en 2 minutes depuis son smartphone. À l&apos;envoi, les agents IA vérifient le dossier avant même
            qu&apos;un gestionnaire ne l&apos;ouvre — sans jamais exposer un soupçon de fraude à l&apos;assuré.
          </p>
        </div>

        <Card className="animate-fade-up" style={{ animationDelay: "100ms" }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Bot className="size-4 text-fuchsia-300" /> Coulisses IA
            </CardTitle>
          </CardHeader>
          <CardContent>
            {agents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Remplissez la déclaration (ou cliquez sur un exemple) puis envoyez-la : chaque agent s&apos;affichera ici au fil de son analyse.
              </p>
            ) : (
              <ol className="space-y-2.5">
                {agents.map((a) => (
                  <li key={a.label} className="flex items-start gap-3 text-sm animate-fade-up">
                    <span
                      className={cn(
                        "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
                        a.state === "pending" && "bg-white/5 text-muted-foreground",
                        a.state === "active" && "bg-cyan-400/20 text-cyan-200",
                        a.state === "done" && "bg-emerald-400/20 text-emerald-300",
                        a.state === "alert" && "bg-red-500/20 text-red-300"
                      )}
                    >
                      {a.state === "active" ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : a.state === "alert" ? (
                        <ShieldAlert className="size-3.5" />
                      ) : a.state === "done" ? (
                        <Check className="size-3.5" />
                      ) : (
                        <span className="size-1.5 rounded-full bg-current" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className={cn(a.state === "pending" && "text-muted-foreground")}>{a.label}</p>
                      {a.detail && <p className={cn("text-xs", a.state === "alert" ? "text-red-300" : "text-muted-foreground")}>{a.detail}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        {result && (
          <Card className="ring-1 ring-cyan-300/20 animate-fade-up">
            <CardHeader>
              <CardTitle className="text-sm">Ce que voit le gestionnaire</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <VerdictPill verdict={result.verdict} score={result.risk_score} />
                <NetworkBadge level={result.network_level} />
              </div>
              {result.ai.copilot && (
                <p>
                  <span className="text-muted-foreground">Copilote : </span>
                  {result.ai.copilot.next_action}
                </p>
              )}
              <Link
                href={`/dossiers/${result.id}`}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-400 to-indigo-500 px-4 py-2 text-xs font-semibold text-slate-950"
              >
                Ouvrir le dossier {result.id} <ChevronRight className="size-3.5" />
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
