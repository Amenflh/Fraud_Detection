"use client";

import {
  ArrowLeft,
  ArrowRight,
  Ban,
  Camera,
  Car,
  FileText,
  History,
  Info,
  Loader2,
  MessagesSquare,
  Search,
  ShieldAlert,
  UserCog,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import ChatTab from "../../components/dossier/ChatTab";
import CopilotPanel from "../../components/dossier/CopilotPanel";
import { FraudTab, GeneralTab } from "../../components/dossier/InfoTabs";
import { DocumentsTab, PhotosTab } from "../../components/dossier/MediaTabs";
import { ExpertTab, GarageTab } from "../../components/dossier/PartnerTabs";
import TimelineTab from "../../components/dossier/TimelineTab";
import { AlertBadge, EmptyState, FraudIndexChip, NetworkBadge, SlaChip, StatusBadge, VerdictPill } from "../../components/dossier/ui";
import WorkflowStepper from "../../components/dossier/WorkflowStepper";
import RiskGauge from "../../components/RiskGauge";
import { advanceDossier, DOSSIERS_UPDATED_EVENT, getDossier, type Role, type StatusKey } from "../../lib/dossiers";
import { usePolling } from "../../lib/hooks";
import { formatAmount, ROLE_META, STAGE_META } from "../../lib/workflow";

type TabKey = "fraude" | "general" | "photos" | "documents" | "expert" | "garage" | "chat" | "historique";

const ROLES: Role[] = ["gestionnaire", "assure", "agent", "expert", "garage"];

export default function DossierPage() {
  const { id } = useParams<{ id: string }>();
  const fetcher = useCallback(() => getDossier(id), [id]);
  const { data: dossier, error, refresh } = usePolling(fetcher, { intervalMs: 10000, refreshOn: DOSSIERS_UPDATED_EVENT });
  const [tab, setTab] = useState<TabKey>("fraude");
  const [role, setRole] = useState<Role>("gestionnaire");
  const [busy, setBusy] = useState<StatusKey | null>(null);

  const onChange = useCallback(() => {
    refresh();
    window.dispatchEvent(new Event(DOSSIERS_UPDATED_EVENT));
  }, [refresh]);

  async function move(to: StatusKey) {
    if (to === "rejete" && !window.confirm("Rejeter ce dossier pour fraude ? L'assuré sera notifié d'un refus motivé.")) return;
    setBusy(to);
    try {
      await advanceDossier(id, to, role);
      toast.success(`Dossier passé à « ${STAGE_META[to].label} »`);
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(null);
    }
  }

  if (error && !dossier) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
        <EmptyState>Dossier introuvable ou API indisponible ({error}).</EmptyState>
      </main>
    );
  }
  if (!dossier) {
    return (
      <main className="mx-auto w-full max-w-7xl space-y-4 px-4 py-10 sm:px-6">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-[500px] rounded-2xl" />
      </main>
    );
  }

  const photos = dossier.documents.filter((d) => d.content_type.startsWith("image/"));
  const alerts = dossier.events.filter((e) => e.kind === "alert").length;
  const tabs: { key: TabKey; label: string; icon: LucideIcon; badge?: number; danger?: boolean }[] = [
    { key: "fraude", label: "Fraude & IA", icon: ShieldAlert, badge: alerts + (dossier.ai.rules?.hits.length ?? 0), danger: alerts > 0 || dossier.rules_level === "high" },
    { key: "general", label: "Général", icon: Info },
    { key: "photos", label: "Photos", icon: Camera, badge: photos.length },
    { key: "documents", label: "Documents", icon: FileText, badge: dossier.documents.length - photos.length },
    { key: "expert", label: "Expert", icon: Search },
    { key: "garage", label: "Garage", icon: Wrench },
    { key: "chat", label: "Chat", icon: MessagesSquare, badge: dossier.messages.length },
    { key: "historique", label: "Historique", icon: History },
  ];
  const nextStep = dossier.allowed_next.find((s) => s !== "rejete");
  const canReject = dossier.allowed_next.includes("rejete");

  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 px-4 py-8 sm:px-6">
      <Link href="/dossiers" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Dossiers / {dossier.id}
      </Link>

      <Card className="animate-fade-up">
        <CardContent className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={dossier.status} />
              <VerdictPill verdict={dossier.verdict} score={dossier.risk_score} />
              <NetworkBadge level={dossier.network_level} />
              {dossier.fraud_index != null && <FraudIndexChip value={dossier.fraud_index} level={dossier.rules_level} />}
              <AlertBadge count={dossier.alerts} />
            </div>
            <h1 className="flex flex-wrap items-baseline gap-x-3 text-2xl font-bold tracking-tight">
              <span className="font-mono">{dossier.id}</span>
              <span className="text-base font-normal text-muted-foreground">{dossier.insured_name}</span>
            </h1>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Car className="size-3.5" /> {dossier.make_model} · {dossier.plate}
              </span>
              <span>{formatAmount(dossier.quote_amount ?? dossier.claim_amount)}</span>
              <span>{dossier.city}</span>
              {dossier.expert && <span>Expert : {dossier.expert.name}</span>}
              <SlaChip enteredAt={dossier.stage_entered_at} slaHours={nextStep ? dossier.sla_hours : null} />
            </p>
          </div>

          <div className="flex flex-col gap-3 lg:items-end">
            <div className="flex flex-wrap items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1" title="Simulez la vue de chaque acteur">
              <UserCog className="ml-2 mr-1 size-3.5 text-muted-foreground" />
              {ROLES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={cn("rounded-full px-2.5 py-1 text-xs transition", role === r ? "text-slate-950" : "text-muted-foreground hover:text-foreground")}
                  style={role === r ? { background: ROLE_META[r].color } : undefined}
                >
                  {ROLE_META[r].label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {canReject && (
                <button
                  onClick={() => move("rejete")}
                  disabled={busy !== null}
                  className="flex items-center gap-1.5 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/20 disabled:opacity-50"
                >
                  {busy === "rejete" ? <Loader2 className="size-3.5 animate-spin" /> : <Ban className="size-3.5" />} Rejeter (fraude)
                </button>
              )}
              {nextStep && (
                <button
                  onClick={() => move(nextStep)}
                  disabled={busy !== null}
                  className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-cyan-400 to-indigo-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:opacity-90 disabled:opacity-50"
                >
                  {busy === nextStep ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRight className="size-3.5" />}
                  {nextStep === "expert_missionne" && !dossier.expert ? "Missionner l'expert recommandé" : `Passer à « ${STAGE_META[nextStep].label} »`}
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <WorkflowStepper dossier={dossier} />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Card className="min-w-0">
          <CardContent>
            <div className="-mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-white/10 px-1 pb-px">
              {tabs.map(({ key, label, icon: Icon, badge, danger }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={cn(
                    "relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-sm transition",
                    tab === key ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="size-4" />
                  {label}
                  {!!badge && (
                    <span className={cn("rounded-full px-1.5 text-[10px] tabular-nums", danger ? "bg-red-500/80 text-white" : "bg-white/10")}>{badge}</span>
                  )}
                  {tab === key && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-cyan-300 to-indigo-400" />}
                </button>
              ))}
            </div>

            <div key={tab} className="animate-fade-up">
              {tab === "fraude" && <FraudTab dossier={dossier} />}
              {tab === "general" && <GeneralTab dossier={dossier} />}
              {tab === "photos" && <PhotosTab dossier={dossier} role={role} onChange={onChange} />}
              {tab === "documents" && <DocumentsTab dossier={dossier} role={role} onChange={onChange} />}
              {tab === "expert" && <ExpertTab dossier={dossier} role={role} onChange={onChange} />}
              {tab === "garage" && <GarageTab dossier={dossier} />}
              {tab === "chat" && <ChatTab dossierId={dossier.id} role={role} />}
              {tab === "historique" && <TimelineTab dossier={dossier} />}
            </div>
          </CardContent>
        </Card>

        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <CopilotPanel dossierId={dossier.id} copilot={dossier.ai.copilot} onChange={onChange} />
          {dossier.risk_score != null && (
            <Card>
              <CardContent className="space-y-3">
                <RiskGauge score={dossier.risk_score} />
                <div className="grid grid-cols-2 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-white/5 p-2">
                    <p className="text-muted-foreground">Déclaré</p>
                    <p className="font-semibold tabular-nums">{formatAmount(dossier.claim_amount)}</p>
                  </div>
                  <div className="rounded-lg bg-white/5 p-2">
                    <p className="text-muted-foreground">Devis</p>
                    <p className="font-semibold tabular-nums">{dossier.quote_amount != null ? formatAmount(dossier.quote_amount) : "—"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </main>
  );
}
