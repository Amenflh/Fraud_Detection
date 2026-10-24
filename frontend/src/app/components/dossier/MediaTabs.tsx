"use client";

import { Camera, Download, FileText, Layers, Loader2, ScanEye, ShieldAlert, ShieldCheck, Upload, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { uploadDocument, type DossierDetail, type DossierDocument, type Role } from "../../lib/dossiers";
import { DOCUMENT_KINDS, formatDateTime, ROLE_META } from "../../lib/workflow";
import AuthImage, { downloadDocument } from "./AuthImage";
import { EmptyState, SectionTitle } from "./ui";
import { QuoteCard } from "./PartnerTabs";

const FACES = [
  { kind: "photo_avant", label: "Face avant" },
  { kind: "photo_arriere", label: "Face arrière" },
  { kind: "photo_gauche", label: "Côté gauche" },
  { kind: "photo_droite", label: "Côté droit" },
];

function ForensicBadge({ doc }: { doc: DossierDocument }) {
  const suspect = doc.analysis.verdict === "suspect";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold backdrop-blur-md",
        suspect ? "bg-red-500/80 text-white" : "bg-emerald-500/70 text-white"
      )}
    >
      {suspect ? <ShieldAlert className="size-3" /> : <ShieldCheck className="size-3" />}
      {suspect ? "Suspecte" : "Vérifiée"}
    </span>
  );
}

const COMPARISON_VERDICT = {
  choc_detecte: { label: "Choc localisé par rapport à la souscription", color: "#22d3ee" },
  aucun_choc: { label: "Aucun choc visible par rapport à la souscription", color: "#fbbf24" },
  vehicule_different: { label: "Véhicule différent de celui assuré", color: "#f87171" },
};

function ComparisonModal({ doc, onClose }: { doc: DossierDocument; onClose: () => void }) {
  const cmp = doc.analysis.comparison!;
  const verdict = COMPARISON_VERDICT[cmp.verdict];
  const [mode, setMode] = useState<"photo" | "heatmap">("heatmap");
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 p-4 backdrop-blur-sm animate-fade-up sm:p-8" onClick={onClose}>
      <div className="mx-auto max-w-5xl space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-fuchsia-200">
              <ScanEye className="size-3.5" /> Agent Dommages — comparaison IA
            </p>
            <p className="mt-1 text-lg font-semibold" style={{ color: verdict.color }}>
              {verdict.label}
            </p>
          </div>
          <button onClick={onClose} className="rounded-full bg-white/10 p-2" aria-label="Fermer">
            <X className="size-5" />
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <figure className="space-y-2">
            <figcaption className="text-xs text-muted-foreground">Photo de souscription (référence)</figcaption>
            <AuthImage path={`/subscription-photos/${cmp.reference_id}/file`} alt="Souscription" className="aspect-[3/2] w-full rounded-xl" />
          </figure>
          <figure className="space-y-2">
            <figcaption className="flex items-center justify-between text-xs text-muted-foreground">
              Photo du sinistre
              <span className="flex rounded-full bg-white/10 p-0.5">
                {(["heatmap", "photo"] as const).map((m) => (
                  <button key={m} onClick={() => setMode(m)} className={cn("rounded-full px-2 py-0.5", mode === m && "bg-white/20 text-foreground")}>
                    {m === "heatmap" ? "Carte d'impact" : "Originale"}
                  </button>
                ))}
              </span>
            </figcaption>
            <AuthImage
              key={mode}
              path={mode === "heatmap" ? `/documents/${doc.id}/heatmap` : `/documents/${doc.id}/file`}
              alt="Sinistre"
              className="aspect-[3/2] w-full rounded-xl"
            />
          </figure>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-white/5 p-3 text-center">
            <p className="text-[11px] text-muted-foreground">Surface modifiée</p>
            <p className="text-lg font-semibold tabular-nums">{(cmp.changed_ratio * 100).toFixed(1)} %</p>
          </div>
          <div className="rounded-xl bg-white/5 p-3 text-center">
            <p className="text-[11px] text-muted-foreground">Écart de couleur carrosserie</p>
            <p className={cn("text-lg font-semibold tabular-nums", cmp.color_delta > 0.22 && "text-red-300")}>{(cmp.color_delta * 100).toFixed(0)} %</p>
          </div>
          <div className="rounded-xl bg-white/5 p-3">
            <p className="text-[11px] text-muted-foreground">Zones d&apos;impact</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {cmp.zones.length === 0 && <span className="text-xs text-muted-foreground">aucune</span>}
              {cmp.zones.map((z) => (
                <span key={z.zone} className="rounded-md px-1.5 py-0.5 text-[11px]" style={{ background: `rgb(248 113 113 / ${0.15 + z.intensity * 0.5})` }}>
                  {z.zone}
                </span>
              ))}
            </div>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Différence alignée entre la photo de souscription et la photo du sinistre (même face, prise guidée). En production, un modèle de segmentation des
          dommages remplace cette étape sans changer l&apos;interface.
        </p>
      </div>
    </div>
  );
}

function UploadSlot({ onFile, busy, label }: { onFile: (f: File) => void; busy: boolean; label: string }) {
  return (
    <label className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] text-sm text-muted-foreground transition hover:border-cyan-300/40 hover:bg-cyan-400/5 hover:text-cyan-200">
      {busy ? <Loader2 className="size-6 animate-spin" /> : <Camera className="size-6" />}
      <span>{busy ? "Analyse par l'Agent Photo…" : label}</span>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        disabled={busy}
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
    </label>
  );
}

export function PhotosTab({ dossier, role, onChange }: { dossier: DossierDetail; role: Role; onChange: () => void }) {
  const [busyKind, setBusyKind] = useState<string | null>(null);
  const [zoom, setZoom] = useState<DossierDocument | null>(null);
  const [compare, setCompare] = useState<DossierDocument | null>(null);
  const photos = dossier.documents.filter((d) => d.content_type.startsWith("image/"));
  const extra = photos.filter((p) => !FACES.some((f) => f.kind === p.kind));

  async function upload(kind: string, file: File) {
    setBusyKind(kind);
    try {
      const doc = await uploadDocument(dossier.id, file, file.name, kind, role);
      if (doc.analysis.verdict === "suspect") toast.error(`Agent Photo : ${doc.analysis.flags?.find((f) => f.level === "high")?.text}`);
      else toast.success("Photo vérifiée par l'Agent Photo");
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusyKind(null);
    }
  }

  const card = (doc: DossierDocument, label: string) => (
    <figure key={doc.id} className="group space-y-2">
      <button onClick={() => setZoom(doc)} className="relative block w-full overflow-hidden rounded-xl ring-1 ring-white/10">
        <AuthImage docId={doc.id} alt={label} className="aspect-[4/3] w-full transition duration-500 group-hover:scale-105" />
        <span className="absolute left-2 top-2">
          <ForensicBadge doc={doc} />
        </span>
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-6 text-left text-xs">{label}</span>
      </button>
      {doc.analysis.comparison && (
        <button
          onClick={() => setCompare(doc)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-fuchsia-400/30 bg-fuchsia-500/10 py-1.5 text-[11px] text-fuchsia-200 transition hover:bg-fuchsia-500/20"
        >
          <Layers className="size-3.5" /> Comparer avec la souscription
        </button>
      )}
      {doc.analysis.flags?.filter((f) => f.level !== "info").map((f) => (
        <p key={f.text} className="flex items-start gap-1.5 text-[11px] text-red-300">
          <ShieldAlert className="mt-0.5 size-3 shrink-0" /> {f.text}
        </p>
      ))}
      <p className="text-[10px] text-muted-foreground">
        {doc.analysis.taken_at ? `Prise le ${new Date(doc.analysis.taken_at).toLocaleString("fr-FR")}` : "Sans date EXIF"} ·{" "}
        {ROLE_META[doc.role as Role]?.label ?? doc.role}
      </p>
    </figure>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-xl border border-cyan-300/15 bg-cyan-400/[0.05] p-3 text-sm text-muted-foreground">
        <ScanEye className="mt-0.5 size-4 shrink-0 text-cyan-300" />
        Chaque photo est contrôlée par l&apos;<b className="text-foreground">Agent Photo</b> : empreinte visuelle (réutilisation dans un
        autre dossier), date EXIF vs date de l&apos;accident, traces de logiciel de retouche.
      </div>

      <section>
        <SectionTitle icon={Camera}>Photos des 4 faces</SectionTitle>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {FACES.map((f) => {
            const doc = photos.find((p) => p.kind === f.kind);
            return doc ? card(doc, f.label) : (
              <UploadSlot key={f.kind} label={f.label} busy={busyKind === f.kind} onFile={(file) => upload(f.kind, file)} />
            );
          })}
        </div>
      </section>

      <section>
        <SectionTitle icon={Camera}>Autres photos</SectionTitle>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {extra.map((doc) => card(doc, DOCUMENT_KINDS[doc.kind] ?? doc.kind))}
          <UploadSlot label="Ajouter une photo" busy={busyKind === "photo"} onFile={(file) => upload("photo", file)} />
        </div>
      </section>

      {compare?.analysis.comparison && <ComparisonModal doc={compare} onClose={() => setCompare(null)} />}

      {zoom && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-6 backdrop-blur-sm animate-fade-up" onClick={() => setZoom(null)}>
          <button className="absolute right-6 top-6 rounded-full bg-white/10 p-2" aria-label="Fermer">
            <X className="size-5" />
          </button>
          <AuthImage docId={zoom.id} alt={zoom.filename} className="max-h-[85vh] w-auto max-w-full rounded-xl object-contain" />
        </div>
      )}
    </div>
  );
}

const UPLOAD_KINDS = ["constat", "devis", "rapport_expertise", "facture", "autre"];

export function DocumentsTab({ dossier, role, onChange }: { dossier: DossierDetail; role: Role; onChange: () => void }) {
  const [kind, setKind] = useState("constat");
  const [amount, setAmount] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const docs = dossier.documents.filter((d) => !d.content_type.startsWith("image/"));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    try {
      const doc = await uploadDocument(dossier.id, file, file.name, kind, role, kind === "devis" && amount ? Number(amount) : undefined);
      const quote = doc.analysis.quote;
      if (quote && quote.level !== "ok") toast.warning(`Agent Devis : ${quote.flags[0]}`);
      else toast.success(`${DOCUMENT_KINDS[kind]} ajouté`);
      setFile(null);
      setAmount("");
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {dossier.ai.quote && <QuoteCard quote={dossier.ai.quote} />}

      <section>
        <SectionTitle icon={FileText}>Documents partagés ({docs.length})</SectionTitle>
        {docs.length === 0 ? (
          <EmptyState>Aucun document. Constat, devis et rapport d&apos;expertise apparaîtront ici.</EmptyState>
        ) : (
          <ul className="divide-y divide-white/5 rounded-xl border border-white/10">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <FileText className="size-4 shrink-0 text-cyan-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate">{DOCUMENT_KINDS[d.kind] ?? d.kind}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {d.filename} · {ROLE_META[d.role as Role]?.label ?? d.role} · {formatDateTime(d.at)}
                  </p>
                </div>
                {d.analysis.quote && (
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] ring-1", d.analysis.quote.level === "ok" ? "text-emerald-300 ring-emerald-400/30" : "text-red-300 ring-red-400/30")}>
                    {Math.round(d.analysis.quote.ratio * 100)} %
                  </span>
                )}
                <button
                  onClick={() => downloadDocument(d.id, d.filename).catch(() => toast.error("Téléchargement impossible"))}
                  className="rounded-lg p-2 text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
                  title="Télécharger"
                >
                  <Download className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle icon={Upload}>Partager un document (en tant que {ROLE_META[role].label})</SectionTitle>
        <form onSubmit={submit} className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 sm:grid-cols-[1fr_1fr_auto]">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
          >
            {UPLOAD_KINDS.map((k) => (
              <option key={k} value={k} className="bg-slate-900">
                {DOCUMENT_KINDS[k]}
              </option>
            ))}
          </select>
          {kind === "devis" ? (
            <Input type="number" min={1} placeholder="Montant du devis (DT)" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          ) : (
            <span className="hidden sm:block" />
          )}
          <span className="hidden sm:block" />
          <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="sm:col-span-2" required />
          <button
            type="submit"
            disabled={busy || !file}
            className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-400 to-indigo-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Envoyer
          </button>
        </form>
      </section>
    </div>
  );
}
