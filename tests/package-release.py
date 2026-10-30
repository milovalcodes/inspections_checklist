"""Build a static-only upload package; never include local inspection records."""
from pathlib import Path
import hashlib
import json
import re
import zipfile

root = Path(__file__).resolve().parents[1]
out = root / "output" / "releases"
out.mkdir(parents=True, exist_ok=True)
worker = (root / "service-worker.js").read_text(encoding="utf-8")
assets = ["service-worker.js", ".nojekyll", "vendor/JSZIP-LICENSE.md"]
asset_block = worker.split("const ASSETS = [", 1)[1].split("];", 1)[0]
for entry in re.findall(r"'\./([^']*)'", asset_block):
    name = entry.split("?", 1)[0]
    if name and name not in assets:
        assets.append(name)
for name in assets:
    assert (root / name).is_file(), f"Missing app asset: {name}"
    assert (root / name).resolve().is_relative_to(root.resolve()), f"Asset outside app: {name}"
package = out / "CIMCO-Inspection-v62-website.zip"
with zipfile.ZipFile(package, "w", zipfile.ZIP_DEFLATED) as archive:
    for name in assets:
        archive.write(root / name, "website-upload/" + name)
    archive.writestr("READ-ME-FIRST.txt", "CIMCO Inspection v62 - optional existing field app update\n\n"
        "Upload the contents of website-upload to the existing website location. "
        "Keep the same origin and paths so phones retain saved inspections.\n\n"
        "Only static app files are included. No inspection records, condition photos, "
        "office credentials, or email service configuration are included.\n\n"
        "Desktop checks passed. Check camera access, offline reopening, signatures, "
        "and PDF saving on an inspector phone before general rollout.\n")
with zipfile.ZipFile(package) as archive:
    assert archive.testzip() is None
    assert "website-upload/service-worker.js" in archive.namelist()
    for entry in archive.namelist():
        assert not any(part in entry for part in ["output/", "tmp/", "office-delivery", "config.json"])
    manifest = {"version": "v62", "files": archive.namelist(),
                "sha256": hashlib.sha256(package.read_bytes()).hexdigest()}
(out / "v62-package-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
print(f"Verified {len(assets)} static app files in {package}")

offline_dir = out / "offline-v62"
names = ["CIMCO-Field-App.html", "CIMCO-Field-Practice.html", "CIMCO-Office-Desk.html", "CIMCO-Office-Practice.html",
         "examples/SAMPLE-Office-Packet.zip", "examples/SAMPLE-Visit-File.json", "examples/OPEN-REPORT.html"]
guide = (root / "OFFLINE-SHARING.md").read_text(encoding="utf-8")
(offline_dir / "READ-ME-FIRST.txt").write_text(guide, encoding="utf-8")
offline_package = out / "CIMCO-Inspection-v62-offline.zip"
with zipfile.ZipFile(offline_package, "w", zipfile.ZIP_DEFLATED) as archive:
    for name in names:
        assert (offline_dir / name).is_file(), f"Build offline files first: {name}"
        archive.write(offline_dir / name, name)
    archive.writestr("READ-ME-FIRST.txt", guide)
    archive.write(root / "vendor/JSZIP-LICENSE.md", "JSZIP-LICENSE.md")
with zipfile.ZipFile(offline_package) as archive:
    assert archive.testzip() is None
    assert set(archive.namelist()) == set(names + ["READ-ME-FIRST.txt", "JSZIP-LICENSE.md"])
    offline_manifest = {"version": "v62", "files": archive.namelist(),
                        "sha256": hashlib.sha256(offline_package.read_bytes()).hexdigest()}
(out / "v62-offline-manifest.json").write_text(json.dumps(offline_manifest, indent=2), encoding="utf-8")
print(f"Verified self-contained office distribution: {offline_package}")
