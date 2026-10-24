"""Build the canonical processed dataset (data/processed/claims.csv) from either
a downloaded Kaggle CSV (data/raw/) or the synthetic fallback (data/synthetic/claims.csv).

Kaggle datasets rarely match our canonical column names exactly - this script is the
adapter layer. Adjust COLUMN_MAP if you target a different Kaggle dataset.
"""
import argparse
from pathlib import Path

import pandas as pd

RAW_DIR = Path("data/raw")
SYNTHETIC_PATH = Path("data/synthetic/claims.csv")
OUTPUT_PATH = Path("data/processed/claims.csv")

CANONICAL_COLUMNS = [
    "claim_id",
    "policy_id",
    "claim_amount",
    "claim_date",
    "incident_type",
    "days_since_policy_start",
    "prior_claims_count",
    "is_fraud",
]

# Maps a known Kaggle schema (e.g. buntyshah/auto-insurance-claims-data) onto our
# canonical column names. Extend/adjust this if you use a different dataset slug.
COLUMN_MAP = {
    "policy_number": "policy_id",
    "total_claim_amount": "claim_amount",
    "incident_date": "claim_date",
    "incident_type": "incident_type",
    "months_as_customer": "days_since_policy_start_months",
    "number_of_vehicles_involved": "prior_claims_count",
    "fraud_reported": "is_fraud",
}


def _find_raw_csv() -> Path | None:
    if not RAW_DIR.exists():
        return None
    csvs = sorted(RAW_DIR.glob("*.csv"))
    return csvs[0] if csvs else None


def _adapt_kaggle_csv(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    df = df.rename(columns=COLUMN_MAP)

    if "days_since_policy_start_months" in df.columns:
        df["days_since_policy_start"] = (df["days_since_policy_start_months"] * 30).astype(int)

    if df["is_fraud"].dtype == object:
        df["is_fraud"] = df["is_fraud"].str.upper().map({"Y": 1, "N": 0}).fillna(0).astype(int)

    if "claim_id" not in df.columns:
        df["claim_id"] = [f"C{i:06d}" for i in range(len(df))]

    missing = [c for c in CANONICAL_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(
            f"Downloaded dataset is missing expected columns after mapping: {missing}. "
            "Update COLUMN_MAP in scripts/build_features.py for this dataset's schema."
        )
    return df[CANONICAL_COLUMNS]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", choices=["auto", "raw", "synthetic"], default="auto")
    args = parser.parse_args()

    raw_csv = _find_raw_csv()

    if args.source == "raw" or (args.source == "auto" and raw_csv is not None):
        if raw_csv is None:
            raise SystemExit(f"No CSV found in {RAW_DIR}. Run scripts/download_kaggle_dataset.py first.")
        print(f"Using downloaded Kaggle dataset: {raw_csv}")
        df = _adapt_kaggle_csv(raw_csv)
    else:
        if not SYNTHETIC_PATH.exists():
            raise SystemExit(
                f"No synthetic dataset found at {SYNTHETIC_PATH}. "
                "Run scripts/generate_synthetic_data.py first."
            )
        print(f"Using synthetic dataset: {SYNTHETIC_PATH}")
        df = pd.read_csv(SYNTHETIC_PATH)[CANONICAL_COLUMNS]

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUTPUT_PATH, index=False)
    print(f"Wrote {len(df)} rows to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
