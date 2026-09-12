"""Portable hosting entrypoint: validate dependencies/data, then start Streamlit."""
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


def main():
    from brain_racer.database import open_database
    from brain_racer.questions import QuestionBank
    QuestionBank()
    # Fail the deployment early if an explicitly configured database is unreachable.
    if os.environ.get("DATABASE_URL") or os.environ.get("MONGO_URI"):
        db = open_database(os.environ.get("DATABASE_URL"), os.environ.get("MONGO_URI"),
                           os.environ.get("MONGO_DATABASE", "brain_racer"))
        if hasattr(db, "close"):
            db.close()
        else:
            db.engine.dispose()
    port = os.environ.get("PORT", "8501")
    if not port.isdigit() or not 1 <= int(port) <= 65535:
        raise ValueError("PORT deve essere un numero tra 1 e 65535.")
    command = [sys.executable, "-m", "streamlit", "run", str(ROOT / "app.py"),
               "--server.address=0.0.0.0", f"--server.port={port}",
               "--server.headless=true", "--browser.gatherUsageStats=false"]
    if os.name == "nt":
        return subprocess.call(command, cwd=ROOT)
    os.chdir(ROOT)
    os.execv(sys.executable, command)


if __name__ == "__main__":
    sys.exit(main())
