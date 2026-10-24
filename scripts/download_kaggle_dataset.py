"""Download the auto insurance claims fraud dataset from Kaggle.

Requires a Kaggle API token. Get one from https://www.kaggle.com/settings
(Account > API > Create New Token) and place the downloaded kaggle.json at:
    Windows: C:\\Users\\<you>\\.kaggle\\kaggle.json
    Linux/Mac: ~/.kaggle/kaggle.json

Alternatively, set KAGGLE_USERNAME and KAGGLE_KEY in .env.
"""
import argparse
import sys
from pathlib import Path

# Allow `from app...` imports when run as `python scripts/download_kaggle_dataset.py`.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

DEFAULT_DATASET = "buntyshah/auto-insurance-claims-data"
FALLBACK_DATASET = "shivamb/vehicle-claim-fraud-detection"


def _has_kaggle_credentials() -> bool:
    kaggle_json = Path.home() / ".kaggle" / "kaggle.json"
    if kaggle_json.exists():
        return True

    from app.config import get_settings

    settings = get_settings()
    return bool(settings.kaggle_username and settings.kaggle_key)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", default=DEFAULT_DATASET)
    parser.add_argument("--output-dir", default="data/raw")
    args = parser.parse_args()

    if not _has_kaggle_credentials():
        print(
            "No Kaggle credentials found.\n\n"
            "1. Get an API token at https://www.kaggle.com/settings (Account > API > Create New Token)\n"
            "2. Place the downloaded kaggle.json at C:\\Users\\<you>\\.kaggle\\kaggle.json\n"
            "   (or set KAGGLE_USERNAME / KAGGLE_KEY in .env)\n"
            "3. Re-run this script.\n\n"
            "No credentials yet? Run scripts/generate_synthetic_data.py instead to get a working "
            "dataset for development.",
            file=sys.stderr,
        )
        sys.exit(1)

    import os

    from app.config import get_settings

    settings = get_settings()
    if settings.kaggle_username and settings.kaggle_key:
        os.environ.setdefault("KAGGLE_USERNAME", settings.kaggle_username)
        os.environ.setdefault("KAGGLE_KEY", settings.kaggle_key)

    try:
        import kaggle
    except ImportError:
        print("The `kaggle` package is not installed. Run: pip install -r requirements.txt", file=sys.stderr)
        sys.exit(1)

    try:
        kaggle.api.authenticate()
        kaggle.api.dataset_download_files(args.dataset, path=args.output_dir, unzip=True)
        print(f"Downloaded '{args.dataset}' to {args.output_dir}")
    except Exception as exc:
        print(
            f"Failed to download '{args.dataset}': {exc}\n\n"
            f"If this dataset is unavailable, try the fallback:\n"
            f"  python scripts/download_kaggle_dataset.py --dataset {FALLBACK_DATASET}\n"
            "or fall back to synthetic data:\n"
            "  python scripts/generate_synthetic_data.py",
            file=sys.stderr,
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
