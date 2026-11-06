"use client";

import { AlertTriangle, Bell, CheckCircle2, Clock, Mail, MessageSquare, RotateCcw, Send, ShieldOff } from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { getNotificationsStatus, listNotifications, retryNotification, type NotificationRow } from "../../lib/dossiers";
import { usePolling } from "../../lib/hooks";
import { formatDateTime } from "../../lib/workflow";
import { EmptyState, SectionTitle } from "./ui";

const STATUS: Record<NotificationRow["status"], { label: string; color: string; icon: typeof Send }> = {
  sent: { label: "Envoyé", color: "#34d399", icon: CheckCircle2 },
  simulated: { label: "Simulé", color: "#22d3ee", icon: Send },
  pending: { label: "En attente", color: "#fbbf24", icon: Clock },
  failed: { label: "Échec", color: "#f87171", icon: AlertTriangle },
  skipped: { label: "Ignoré", color: "#94a3b8", icon: ShieldOff },
};

const ROLE_LABEL: Record<string, string> = { assure: "Assuré", expert: "Expert", gestionnaire: "Gestionnaire", garage: "Garage" };

function ProviderChip({ label, real }: { label: string; real: boolean }) {
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-[11px] ring-1", real ? "bg-emerald-500/10 text-emerald-300 ring-emerald-400/30" : "bg-white/5 text-muted-foreground ring-white/10")}>
      {label} : {real ? "envoi réel" : "simulé"}
    </span>
  );
}

export default function NotificationsTab({ dossierId, canRetry, refreshKey }: { dossierId: string; canRetry: boolean; refreshKey?: number }) {
  const fetcher = useCallback(() => listNotifications(dossierId), [dossierId, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data: rows, refresh } = usePolling<NotificationRow[]>(fetcher, { intervalMs: 4000 });
  const { data: status } = usePolling(getNotificationsStatus, { intervalMs: 30000 });

  async function retry(id: number) {
    try {
      await retryNotification(id);
      toast.success("Nouvel essai lancé");
      setTimeout(refresh, 1200);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  }

  return (
    <div className="space-y-5">
      {status && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs">
          <Bell className="size-4 text-cyan-300" />
          <ProviderChip label="E-mail" real={status.email.configured} />
          <ProviderChip label="SMS" real={status.sms.configured} />
          <span className="text-muted-foreground">
            Alerte fraude dès un score de {status.alert_threshold} · {status.alert_recipients} destinataire(s)
            {status.allowlist && " · liste blanche active"}
          </span>
          {!status.email.configured && !status.sms.configured && (
            <span className="basis-full text-muted-foreground">Aucun fournisseur configuré : les messages sont enregistrés mais pas transmis (voir .env : SMTP_* et TWILIO_*).</span>
          )}
        </div>
      )}

      <section>
        <SectionTitle icon={Bell}>Journal des envois ({rows?.length ?? 0})</SectionTitle>
        {rows && rows.length === 0 && <EmptyState>Aucune notification pour ce dossier.</EmptyState>}
        <ul className="space-y-2">
          {rows?.map((n) => {
            const st = STATUS[n.status];
            const Icon = st.icon;
            const ChannelIcon = n.channel === "sms" ? MessageSquare : Mail;
            return (
              <li key={n.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm animate-fade-up">
                <div className="flex flex-wrap items-center gap-2">
                  <ChannelIcon className="size-4 text-muted-foreground" />
                  <span className="font-medium">{n.channel === "sms" ? "SMS" : "E-mail"}</span>
                  <span className="text-xs text-muted-foreground">
                    → {ROLE_LABEL[n.recipient_role] ?? n.recipient_role} · {n.recipient}
                  </span>
                  <span className="ml-auto flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ color: st.color, background: `${st.color}1a` }}>
                    <Icon className="size-3" /> {st.label}
                    {n.provider && <span className="opacity-70">· {n.provider}</span>}
                  </span>
                </div>
                {n.subject && <p className="mt-1.5 text-xs font-medium">{n.subject}</p>}
                <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{n.body.length > 220 ? `${n.body.slice(0, 220)}…` : n.body}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                  <span>{formatDateTime(n.created_at)}</span>
                  {n.attempts > 0 && <span>{n.attempts} tentative(s)</span>}
                  {n.error && <span className="text-red-300">{n.error}</span>}
                  {canRetry && (n.status === "failed" || n.status === "skipped") && (
                    <button onClick={() => retry(n.id)} className="ml-auto flex items-center gap-1 text-cyan-300 hover:underline">
                      <RotateCcw className="size-3" /> Renvoyer
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
