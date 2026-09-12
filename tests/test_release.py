import importlib.util
from zipfile import ZipFile

from brain_racer.config import ROOT


def test_release_contains_source_and_excludes_local_secrets(tmp_path):
    spec = importlib.util.spec_from_file_location("release", ROOT / "scripts/package_release.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    output = module.package(tmp_path / "release.zip")
    with ZipFile(output) as archive:
        names = archive.namelist()
    assert "brain-racer/app.py" in names
    assert "brain-racer/data/questions.json" in names
    assert "brain-racer/render.yaml" in names
    assert not any(".venv" in p or p.endswith((".db", "secrets.toml", ".pyc", "/.env")) for p in names)
