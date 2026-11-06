import os
from pathlib import Path

import uvicorn

PROJECT_ROOT = Path(__file__).resolve().parent.parent

if __name__ == "__main__":
    # .env, data/local.db and data/models are resolved from the working directory:
    # start from the project root even when launched from scripts/.
    os.chdir(PROJECT_ROOT)
    # app_dir puts the project root on sys.path, so `app` is importable even when
    # this script is launched as `python scripts/run_dev_server.py`.
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        app_dir=str(PROJECT_ROOT),
        reload_dirs=[str(PROJECT_ROOT / "app")],
    )
