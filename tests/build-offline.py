"""Create self-contained local files, with every required style, script and image embedded."""
from pathlib import Path
import base64
import re

root = Path(__file__).resolve().parents[1]
out = root / "output" / "releases" / "offline-v62"
out.mkdir(parents=True, exist_ok=True)
source = (root / "index.html").read_text(encoding="utf-8")
logo = "data:image/png;base64," + base64.b64encode((root / "cimco-logo.png").read_bytes()).decode("ascii")

def inline_style(match):
    name = match.group(1).split("?", 1)[0].removeprefix("./")
    return "<style>\n" + (root / name).read_text(encoding="utf-8") + "\n</style>"

def inline_script(match):
    name = match.group(1).split("?", 1)[0].removeprefix("./")
    code = (root / name).read_text(encoding="utf-8").replace("</script", "<\\/script")
    return "<script>\n" + code + "\n</script>"

for office, practice, name in [(False, False, "CIMCO-Field-App.html"), (False, True, "CIMCO-Field-Practice.html"), (True, False, "CIMCO-Office-Desk.html"), (True, True, "CIMCO-Office-Practice.html")]:
    html = re.sub(r'<link[^>]+href="https://[^>]+>', "", source)
    html = re.sub(r'<link rel="(?:manifest|icon)"[^>]*>', "", html)
    html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', inline_style, html)
    html = re.sub(r'<script src="([^"]+)"></script>', inline_script, html)
    html = html.replace('src="./cimco-logo.png"', 'src="' + logo + '"')
    html = html.replace('let REPORT_LOGO_DATA = "";', 'let REPORT_LOGO_DATA = "' + logo + '";')
    flags = '<script>globalThis.CIMCO_OFFLINE_BUNDLE=true;globalThis.CIMCO_OFFICE_DESK=' + str(office).lower() + ';globalThis.CIMCO_PRACTICE_MODE=' + str(practice).lower() + ';</script>\n'
    html = html.replace("<style>", flags + "<style>", 1)
    license_text = (root / "vendor" / "JSZIP-LICENSE.md").read_text(encoding="utf-8").replace("</script", "<\\/script")
    html += '\n<script type="text/plain" id="third-party-license">' + license_text + '</script>\n'
    assert not re.search(r'<script[^>]+src=', html)
    assert not re.search(r'<link[^>]+href=', html)
    assert 'src="./cimco-logo.png"' not in html
    assert 'let REPORT_LOGO_DATA = "data:image/png;base64,' in html
    (out / name).write_text(html, encoding="utf-8")
    print(f"Self-contained {'office' if office else 'field'} app: {out / name} ({len(html):,} characters)")
