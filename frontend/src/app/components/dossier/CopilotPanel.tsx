"use client";

import { Bot, Copy, Mail, MessageSquare, MessageSquareText, Send, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { notifyInsured, type Copilot } from "../../lib/dossiers";

const PRIORITY: Record<string, string> = {
  haute: "bg-red-500/15 text-red-300 ring-red-400/30",
  moyenne: "bg-amber-400/10 text-amber-200 ring-amber-300/30",
  normale: "bg-cyan-400/10 text-cyan-200 ring-cyan-300/30",
  basse: "bg-white/5 text-muted-foreground ring-white/10",
};

type Channel = "sms" | "email";

export default function CopilotPanel({
  dossierId,
  copilot,
  canSend,
  onChange,
}: {
  dossierId: string;
  copilot?: Copilot;
  canSend: boolean;
  onChange: () => void;
}) {
  const [draft, setDraft] = useState<{ base: string; text: string } | null>(null);
  const [channels, setChannels] = useState<Channel[]>(["sms"]);
  const [sending, setSending] = useState(false);

  if (!copilot) return null;
  // Reset the editable draft whenever the copilot proposes a new SMS.
  const sms = draft && draft.base === copilot.sms ? draft.text : copilot.sms;
  const toggle = (c: Channel) => setChannels((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));

  async function send() {
    setSending(true);
    try {
      const queued = await notifyInsured(dossierId, sms, channels);
      toast.success(`${queued.length} notification(s) transmise(s) — suivi dans l'onglet Notifications`);
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="relative overflow-hidden ring-1 ring-fuchsia-400/20">
      <div className="absolute -right-10 -top-10 size-40 rounded-full bg-fuchsia-500/20 blur-3xl" />
      <CardHeader className="relative flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-sm">
          <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-fuchsia-500/40 to-indigo-500/40">
            <Bot className="size-4 text-fuchsia-200" />
          </span>
          Copilote IA
        </CardTitle>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">{copilot.source === "llm" ? "LLM" : "règles métier"}</span>
      </CardHeader>
      <CardContent className="relative space-y-4">
        <p className="text-sm leading-relaxed text-muted-foreground">{copilot.summary}</p>

        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-fuchsia-200/90">
              <Sparkles className="size-3.5" /> Prochaine action
            </span>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] ring-1", PRIORITY[copilot.priority] ?? PRIORITY.normale)}>priorité {copilot.priority}</span>
          </div>
          <p className="text-sm font-medium">{copilot.next_action}</p>
        </div>

        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            <MessageSquareText className="size-3.5" /> Message à l&apos;assuré
          </p>
          <Textarea value={sms} onChange={(e) => setDraft({ base: copilot.sms, text: e.target.value })} rows={3} className="text-sm" />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className={cn("text-[11px] tabular-nums", sms.length > 160 ? "text-amber-300" : "text-muted-foreground")}>
              {sms.length}/160{sms.length > 160 && " · 2 SMS facturés"}
            </span>
            <div className="flex items-center gap-2">
              {(["sms", "email"] as Channel[]).map((c) => (
                <button
                  key={c}
                  onClick={() => toggle(c)}
                  className={cn(
                    "flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] transition",
                    channels.includes(c) ? "border-fuchsia-300/50 bg-fuchsia-500/15 text-fuchsia-100" : "border-white/10 text-muted-foreground"
                  )}
                >
                  {c === "sms" ? <MessageSquare className="size-3" /> : <Mail className="size-3" />} {c === "sms" ? "SMS" : "E-mail"}
                </button>
              ))}
              <button
                onClick={() => navigator.clipboard.writeText(sms).then(() => toast.success("Copié"))}
                className="rounded-lg border border-white/10 bg-white/5 p-2 text-muted-foreground transition hover:text-foreground"
                title="Copier"
              >
                <Copy className="size-3.5" />
              </button>
              {canSend && (
                <button
                  onClick={send}
                  disabled={sending || !sms.trim() || channels.length === 0}
                  className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-fuchsia-500 to-indigo-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  <Send className="size-3.5" /> Envoyer
                </button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
