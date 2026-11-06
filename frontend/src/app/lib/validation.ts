import { z } from "zod";

export const claimFormSchema = z.object({
  claim_id: z.string(),
  policy_id: z.string().min(1, "Champ requis"),
  claim_amount: z.coerce.number().positive("Le montant doit être positif"),
  claim_date: z.string().min(1, "Champ requis"),
  incident_type: z.string().min(1, "Champ requis"),
  days_since_policy_start: z.coerce.number().int().min(0, "Doit être positif ou nul"),
  prior_claims_count: z.coerce.number().int().min(0, "Doit être positif ou nul"),
  vehicle_age: z.coerce.number().int().min(0).optional(),
  claim_description: z.string().optional(),
});

export type ClaimFormValues = z.infer<typeof claimFormSchema>;
// Raw form values before z.coerce turns the numeric fields into numbers.
export type ClaimFormInput = z.input<typeof claimFormSchema>;

export const loginSchema = z.object({
  email: z.string().email("Adresse email invalide"),
  password: z.string().min(6, "6 caractères minimum"),
});

export type LoginValues = z.infer<typeof loginSchema>;
