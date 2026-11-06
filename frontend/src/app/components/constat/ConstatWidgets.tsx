"use client";

import { Check, Copy, ExternalLink, FileDown, Fingerprint, Loader2, MapPin, Scale, ShieldAlert } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { downloadConstatPdf, type CoherenceFlag, type Responsibility } from "../../lib/constat";

export function LocationMap({ lat, lng, className }: { lat: number; lng: number; className?: string }) {
  const d = 0.006;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d}%2C${lat - d}%2C${lng + d}%2C${lat + d}&layer=mapnik&marker=${lat}%2C${lng}`;
  return (
    <div className={cn("relative overflow-hidden rounded-xl border border-white/10", className)}>
      <iframe title="Lieu de l'accident" src={src} className="h-full w-full grayscale-[30%] invert-[90%] hue-rotate-180" loading="lazy" />
      <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-cyan-200">
        <MapPin className="size-3" /> {lat.toFixed(5)}, {lng.toFixed(5)}
      </span>
    </div>
  );
}

export function QrShare({ token }: { token: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const [url, setUrl] = useState("");

  useEffect(() => {
    const link = `${window.location.origin}/constat/b/${token}`;
    QRCode.toDataURL(link, { margin: 1, width: 240, color: { dark: "#0b1020", light: "#ffffff" } }).then((data) => {
      setUrl(link);
      setQr(data);
    });
  }, [token]);

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
      <div className="relative rounded-2xl bg-white p-2 shadow-[0_0_40px_rgb(34_211_238/0.35)]">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element -- generated data URL
          <img src={qr} alt="QR code du constat" className="size-44" />
        ) : (
          <div className="size-44 animate-pulse rounded-xl bg-slate-200" />
        )}
        <span className="absolute -inset-1 rounded-2xl ring-2 ring-cyan-300/40 animate-pulse-ring" />
      </div>
      <div className="min-w-0 space-y-2 text-sm">
        <p className="font-medium">Faites scanner ce QR code au second conducteur</p>
        <p className="text-xs text-muted-foreground">
          Il complète sa partie et signe depuis son téléphone, sans application ni compte. Il ne voit ni votre téléphone ni votre CIN.
        </p>
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2 py-1.5">
          <code className="min-w-0 flex-1 truncate text-[11px] text-cyan-200">{url}</code>
          <button onClick={() => navigator.clipboard.writeText(url).then(() => toast.success("Lien copié"))} className="text-muted-foreground hover:text-foreground" title="Copier">
            <Copy className="size-3.5" />
          </button>
        </div>
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-cyan-300 hover:underline">
          <ExternalLink className="size-3.5" /> Ouvrir comme conducteur B (démo)
        </a>
      </div>
    </div>
  );
}

export function ResponsibilityBar({ r }: { r: Responsibility }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-semibold uppercase tracking-widest text-cyan-300/80">
          <Scale className="size-3.5" /> Responsabilités (barème)
        </span>
        {r.contradiction && <span className="text-amber-300">déclarations contradictoires</span>}
      </div>
      <div className="flex h-9 overflow-hidden rounded-xl text-xs font-semibold">
        <div className="grid place-items-center bg-cyan-500/70 transition-all duration-1000" style={{ width: `${Math.max(r.a, 8)}%` }}>
          A · {r.a}%
        </div>
        <div className="grid place-items-center bg-fuchsia-500/70 transition-all duration-1000" style={{ width: `${Math.max(r.b, 8)}%` }}>
          B · {r.b}%
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{r.rule}</p>
    </div>
  );
}

export function CoherenceList({ flags }: { flags: CoherenceFlag[] }) {
  if (flags.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-emerald-300">
        <Check className="size-4" /> Déclarations cohérentes : aucune anomalie détectée
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {flags.map((f, i) => (
        <li
          key={i}
          className={cn(
            "flex items-start gap-2 rounded-lg px-3 py-2 text-xs ring-1",
            f.level === "high" ? "bg-red-500/10 text-red-200 ring-red-400/25" : f.level === "medium" ? "bg-amber-400/10 text-amber-100 ring-amber-300/25" : "bg-white/5 text-muted-foreground ring-white/10"
          )}
        >
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>
            <b className="mr-1">{f.code}</b>
            {f.text}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Seal({ seal }: { seal: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-500/[0.06] px-3 py-2 text-xs">
      <Fingerprint className="size-4 shrink-0 text-emerald-300" />
      <span className="text-muted-foreground">Scellé SHA-256</span>
      <code className="min-w-0 flex-1 truncate text-emerald-200" title={seal}>
        {seal}
      </code>
    </div>
  );
}

export function PdfButton({ constatId, signed }: { constatId: string; signed: boolean }) {
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      await downloadConstatPdf(constatId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Téléchargement impossible");
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      onClick={download}
      disabled={busy}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60",
        signed ? "bg-gradient-to-r from-emerald-400 to-cyan-400 text-slate-950" : "border border-white/15 bg-white/5 text-muted-foreground hover:text-foreground"
      )}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileDown className="size-3.5" />}
      {signed ? "Télécharger le PDF officiel" : "Télécharger le brouillon (PDF)"}
    </button>
  );
}
