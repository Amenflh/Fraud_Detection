"""Generate a synthetic insurance claims dataset for local development/testing,
used as a fallback when no Kaggle dataset has been downloaded yet.
"""
import argparse
from pathlib import Path

import numpy as np
import pandas as pd

INCIDENT_TYPES = ["collision", "theft", "fire", "vandalism", "other"]

OUTPUT_PATH = Path("data/synthetic/claims.csv")


def generate(n_rows: int, seed: int) -> pd.DataFrame:
    rng = np.random.default_rng(seed)

    is_fraud = rng.random(n_rows) < 0.12

    claim_amount = np.where(
        is_fraud,
        rng.normal(18000, 6000, n_rows),
        rng.normal(5000, 3000, n_rows),
    ).clip(min=200)

    days_since_policy_start = np.where(
        is_fraud,
        rng.integers(1, 60, n_rows),
        rng.integers(1, 2000, n_rows),
    )

    prior_claims_count = np.where(
        is_fraud,
        rng.poisson(2.5, n_rows),
        rng.poisson(0.5, n_rows),
    )

    incident_type = rng.choice(INCIDENT_TYPES, size=n_rows, p=[0.4, 0.2, 0.1, 0.1, 0.2])

    claim_date = pd.Timestamp("2025-01-01") + pd.to_timedelta(
        rng.integers(0, 600, n_rows), unit="D"
    )

    df = pd.DataFrame(
        {
            "claim_id": [f"C{i:06d}" for i in range(n_rows)],
            "policy_id": [f"P{rng.integers(0, n_rows // 3):05d}" for i in range(n_rows)],
            "claim_amount": claim_amount.round(2),
            "claim_date": claim_date.strftime("%Y-%m-%d"),
            "incident_type": incident_type,
            "days_since_policy_start": days_since_policy_start,
            "prior_claims_count": prior_claims_count,
            "vehicle_age": rng.integers(0, 20, n_rows),
            "is_fraud": is_fraud.astype(int),
        }
    )
    return df


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--n-rows", type=int, default=2000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH)
    args = parser.parse_args()

    df = generate(args.n_rows, args.seed)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(args.output, index=False)

    fraud_rate = df["is_fraud"].mean()
    print(f"Wrote {len(df)} rows to {args.output} (fraud rate: {fraud_rate:.1%})")


if __name__ == "__main__":
    main()
