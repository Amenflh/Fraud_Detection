from functools import lru_cache
from pathlib import Path

import pandas as pd

PROCESSED_PATH = Path("data/processed/claims.csv")
SYNTHETIC_PATH = Path("data/synthetic/claims.csv")


class NoDatasetError(FileNotFoundError):
    pass


class ClaimsRepository:
    def __init__(self, df: pd.DataFrame) -> None:
        self._df = df

    @classmethod
    def load(cls) -> "ClaimsRepository":
        path = PROCESSED_PATH if PROCESSED_PATH.exists() else SYNTHETIC_PATH
        if not path.exists():
            raise NoDatasetError(
                "No claims dataset found. Run `python scripts/generate_synthetic_data.py` "
                "or download+build the Kaggle dataset."
            )
        return cls(pd.read_csv(path))

    def by_policy(self, policy_id: str) -> list[dict]:
        rows = self._df[self._df["policy_id"] == policy_id]
        return rows.to_dict(orient="records")

    def all(self) -> list[dict]:
        return self._df.to_dict(orient="records")


@lru_cache
def get_repository() -> ClaimsRepository:
    return ClaimsRepository.load()
