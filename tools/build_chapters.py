# Собирает locations/<loc>/chapters.json из mp3 (длительности через ffprobe).
# Названия глав — из scripts/<loc>/titles.json.
# Использование: .venv/bin/python tools/build_chapters.py <локация>
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOC = sys.argv[1] if len(sys.argv) > 1 else "mutianyu"
AUDIO = ROOT / "locations" / LOC / "audio"
FFPROBE = ROOT / ".venv" / "bin" / "static_ffprobe"

titles = json.loads((ROOT / "scripts" / LOC / "titles.json").read_text(encoding="utf-8"))

chapters = []
for mp3 in sorted(AUDIO.glob("*.mp3")):
    out = subprocess.run(
        [str(FFPROBE), "-v", "quiet", "-show_entries", "format=duration", "-of", "json", str(mp3)],
        capture_output=True, text=True, check=True,
    )
    dur = float(json.loads(out.stdout)["format"]["duration"])
    nn = mp3.stem
    chapters.append({"file": f"audio/{mp3.name}", "title": titles[nn], "duration_sec": round(dur, 2)})

out_path = ROOT / "locations" / LOC / "chapters.json"
out_path.write_text(json.dumps(chapters, ensure_ascii=False, indent=1), encoding="utf-8")
total = sum(c["duration_sec"] for c in chapters)
print(f"готово: {out_path} — {len(chapters)} глав, {total/60:.1f} мин")
