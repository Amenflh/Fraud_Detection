"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ScanSearch, Sparkles, UserCheck, UserX, HelpCircle, type LucideIcon } from "lucide-react";
import { Controller, useForm, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ClaimFormValues, claimFormSchema } from "../lib/validation";
import LiveSignals from "./LiveSignals";

const INCIDENT_TYPES: { value: string; label: string }[] = [
  { value: "collision", label: "Collision" },
  { value: "theft", label: "Vol" },
  { value: "fire", label: "Incendie" },
  { value: "vandalism", label: "Vandalisme" },
  { value: "other", label: "Autre" },
];

const DEFAULT_VALUES: ClaimFormValues = {
  claim_id: "",
  policy_id: "",
  claim_amount: 1000,
  claim_date: new Date().toISOString().slice(0, 10),
  incident_type: "collision",
  days_since_policy_start: 365,
  prior_claims_count: 0,
  vehicle_age: 5,
  claim_description: "",
};

// Demo presets, picked so the trained model lands in each verdict band.
const SCENARIOS: { label: string; icon: LucideIcon; tone: string; values: Partial<ClaimFormValues> }[] = [
  {
    label: "Client fidèle",
    icon: UserCheck,
    tone: "hover:border-emerald-400/50 hover:text-emerald-300",
    values: {
      policy_id: "P-48213",
      claim_amount: 3500,
      incident_type: "collision",
      days_since_policy_start: 1800,
      prior_claims_count: 0,
      vehicle_age: 6,
      claim_description: "Accrochage léger sur parking, constat amiable signé par les deux parties.",
    },
  },
  {
    label: "Cas ambigu",
    icon: HelpCircle,
    tone: "hover:border-amber-300/50 hover:text-amber-200",
    values: {
      policy_id: "P-77120",
      claim_amount: 12000,
      incident_type: "fire",
      days_since_policy_start: 90,
      prior_claims_count: 2,
      vehicle_age: 9,
      claim_description: "Incendie du véhicule stationné la nuit, aucun témoin.",
    },
  },
  {
    label: "Profil suspect",
    icon: UserX,
    tone: "hover:border-red-400/50 hover:text-red-300",
    values: {
      policy_id: "P-90514",
      claim_amount: 9000,
      incident_type: "theft",
      days_since_policy_start: 150,
      prior_claims_count: 5,
      vehicle_age: 2,
      claim_description: "Vol déclaré 48 h après les faits, clés non restituées.",
    },
  },
];

export default function ClaimForm({
  isSubmitting,
  onSubmit,
}: {
  isSubmitting: boolean;
  onSubmit: (values: ClaimFormValues) => void;
}) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<ClaimFormValues>({
    resolver: zodResolver(claimFormSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const [amount, days, prior] = useWatch({
    control,
    name: ["claim_amount", "days_since_policy_start", "prior_claims_count"],
  });

  return (
    <Card className="relative">
      <div className="absolute inset-x-0 top-0 h-px shimmer-border animate-shimmer" />
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ScanSearch className="size-4 text-cyan-300" /> Déclaration de sinistre
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Sparkles className="size-3.5" /> Scénarios :
          </span>
          {SCENARIOS.map(({ label, icon: Icon, tone, values }) => (
            <button
              key={label}
              type="button"
              onClick={() => reset({ ...DEFAULT_VALUES, ...values })}
              className={cn(
                "flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted-foreground transition active:scale-95",
                tone
              )}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5 sm:col-span-1">
            <Label htmlFor="claim_id">ID sinistre (optionnel)</Label>
            <Input id="claim_id" placeholder="généré automatiquement" {...register("claim_id")} />
          </div>

          <div className="col-span-2 space-y-1.5 sm:col-span-1">
            <Label htmlFor="policy_id">ID police</Label>
            <Input id="policy_id" placeholder="ex. P-48213" {...register("policy_id")} />
            {errors.policy_id && <p className="text-sm text-destructive">{errors.policy_id.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="claim_amount">Montant du sinistre (DT)</Label>
            <Input id="claim_amount" type="number" min={0} step="0.01" {...register("claim_amount")} />
            {errors.claim_amount && <p className="text-sm text-destructive">{errors.claim_amount.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="claim_date">Date du sinistre</Label>
            <Input id="claim_date" type="date" {...register("claim_date")} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="incident_type">Type d&apos;incident</Label>
            <Controller
              name="incident_type"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="incident_type" className="w-full">
                    <SelectValue placeholder="Choisir..." />
                  </SelectTrigger>
                  <SelectContent>
                    {INCIDENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="days_since_policy_start">Jours depuis début police</Label>
            <Input id="days_since_policy_start" type="number" min={0} {...register("days_since_policy_start")} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="prior_claims_count">Sinistres antérieurs</Label>
            <Input id="prior_claims_count" type="number" min={0} {...register("prior_claims_count")} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vehicle_age">Âge du véhicule (ans)</Label>
            <Input id="vehicle_age" type="number" min={0} {...register("vehicle_age")} />
          </div>

          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="claim_description">Description (optionnel)</Label>
            <Textarea id="claim_description" rows={2} {...register("claim_description")} />
          </div>

          <div className="col-span-2">
            <LiveSignals claim_amount={amount} days_since_policy_start={days} prior_claims_count={prior} />
          </div>

          <div className="col-span-2">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="group relative h-11 w-full overflow-hidden bg-gradient-to-r from-cyan-400 to-indigo-500 text-slate-950 font-semibold hover:opacity-95"
            >
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              <ScanSearch className={cn("size-4", isSubmitting && "animate-pulse")} />
              {isSubmitting ? "Les agents analysent le sinistre…" : "Lancer l'analyse"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
