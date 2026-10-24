"use client";

import { Loader2, MessagesSquare, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { listMessages, postMessage, type ChatMessage, type Role } from "../../lib/dossiers";
import { usePolling } from "../../lib/hooks";
import { formatDateTime, ROLE_META } from "../../lib/workflow";
import { EmptyState } from "./ui";

const QUICK_REPLIES: Record<Role, string[]> = {
  gestionnaire: ["Merci, nous traitons votre dossier.", "Pouvez-vous transmettre le constat signé ?", "L'expert passera sous 48 h."],
  assure: ["Bonjour, où en est mon dossier ?", "Je viens d'envoyer les photos.", "Quand puis-je récupérer mon véhicule ?"],
  agent: ["Le client a été informé.", "Dossier complet côté agence."],
  expert: ["Expertise planifiée demain matin.", "Devis validé après contrôle.", "Merci de fournir des photos supplémentaires."],
  garage: ["Devis déposé dans l'onglet Documents.", "Véhicule réceptionné.", "Réparation terminée, véhicule prêt."],
};

export default function ChatTab({ dossierId, role }: { dossierId: string; role: Role }) {
  const fetcher = useCallback(() => listMessages(dossierId), [dossierId]);
  const { data, refresh } = usePolling<ChatMessage[]>(fetcher, { intervalMs: 5000 });
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const count = data?.length ?? 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [count]);

  async function send(message: string) {
    if (!message.trim()) return;
    setSending(true);
    try {
      await postMessage(dossierId, role, message);
      setText("");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[560px] flex-col rounded-xl border border-white/10 bg-black/10">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <MessagesSquare className="size-3.5" /> Messagerie partagée · assuré, agent, expert, garage, gestionnaire
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" /> en direct
        </span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {!data && <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />}
        {data && data.length === 0 && <EmptyState>Aucun message. Démarrez la conversation.</EmptyState>}
        {data?.map((m) => {
          const mine = m.role === role;
          const meta = ROLE_META[m.role] ?? ROLE_META.gestionnaire;
          return (
            <div key={m.id} className={cn("flex animate-fade-up", mine ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[80%] space-y-1", mine && "items-end text-right")}>
                <p className="text-[11px] text-muted-foreground">
                  <span style={{ color: meta.color }}>{meta.label}</span> · {m.author} · {formatDateTime(m.at)}
                </p>
                <p
                  className={cn("inline-block rounded-2xl px-3.5 py-2 text-left text-sm", mine ? "rounded-br-sm" : "rounded-bl-sm")}
                  style={{ background: `${meta.color}${mine ? "33" : "1a"}`, boxShadow: `inset 0 0 0 1px ${meta.color}33` }}
                >
                  {m.text}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="space-y-2 border-t border-white/10 p-3">
        <div className="flex flex-wrap gap-1.5">
          {QUICK_REPLIES[role].map((q) => (
            <button
              key={q}
              onClick={() => send(q)}
              disabled={sending}
              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:text-foreground"
            >
              {q}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
          className="flex gap-2"
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Écrire en tant que ${ROLE_META[role].label}…`}
            className="h-10 flex-1 rounded-lg border border-input bg-input/30 px-3 text-sm outline-none focus:border-ring"
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            className="grid size-10 place-items-center rounded-lg bg-gradient-to-r from-cyan-400 to-indigo-500 text-slate-950 disabled:opacity-40"
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </form>
      </div>
    </div>
  );
}
