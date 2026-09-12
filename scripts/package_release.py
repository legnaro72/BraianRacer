"""Create a source-only release; never include databases, tokens, or environments."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent.parent
ROOT_FILES = ["app.py", "requirements.txt", "README.md", "DEPLOY_STREAMLIT.md", "pytest.ini", ".env.example",
              ".gitignore", ".dockerignore", "Dockerfile", "compose.yaml", "render.yaml", "Procfile"]
FOLDERS = ["brain_racer", "assets", "data", "scripts", "tests", ".github/workflows"]


def package(destination=None):
    destination = Path(destination or ROOT / "artifacts/brain-racer-source.zip")
    destination.parent.mkdir(parents=True, exist_ok=True)
    files = [ROOT / f for f in ROOT_FILES] + [ROOT / ".streamlit/config.toml", ROOT / ".streamlit/secrets.example.toml"]
    for folder in FOLDERS:
        files.extend(p for p in (ROOT / folder).rglob("*")
                     if p.is_file() and "__pycache__" not in p.parts and p.suffix != ".pyc")
    with ZipFile(destination, "w", ZIP_DEFLATED) as archive:
        for source in sorted(set(files)):
            archive.write(source, "brain-racer/" + source.relative_to(ROOT).as_posix())
    return destination


if __name__ == "__main__":
    print(package())
