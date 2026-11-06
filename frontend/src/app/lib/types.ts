export interface ClaimInput {
  claim_id: string;
  policy_id: string;
  claim_amount: number;
  claim_date: string;
  incident_type: string;
  days_since_policy_start: number;
  prior_claims_count: number;
  vehicle_age?: number | null;
  claim_description?: string | null;
}

export interface RiskAssessment {
  risk_score: number;
  is_anomaly: boolean;
  model_used: "isolation_forest" | "xgboost" | "ensemble" | "none";
  feature_contributions: Record<string, number> | null;
}

export interface InvestigationNote {
  summary: string;
  red_flags: string[];
  tool_calls_made: string[];
}

export interface FraudVerdict {
  claim_id: string;
  final_verdict: "fraud" | "not_fraud" | "needs_human_review";
  confidence: number;
  report: string;
  risk_assessment: RiskAssessment;
  investigation: InvestigationNote;
}

export interface ScoreBucket {
  range_label: string;
  count: number;
}

export interface ClaimsStats {
  total_claims: number;
  fraud_count: number;
  not_fraud_count: number;
  needs_review_count: number;
  fraud_rate: number;
  avg_risk_score: number;
  score_distribution: ScoreBucket[];
}

export interface HealthStatus {
  status: string;
  openai_configured: boolean;
  model_trained: boolean;
  dataset_present: boolean;
  supabase_auth_configured: boolean;
  email_configured?: boolean;
  sms_configured?: boolean;
}

export interface ClaimsList {
  claims: FraudVerdict[];
  total: number;
}
