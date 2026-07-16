# Собирает m4b-аудиокнигу с главами (резерв на случай блокировки github.io):
# mp3 -> concat -> AAC 64k -> build/<loc>.m4b с FFMETADATA-главами.
# Использование: .venv/bin/python tools/make_m4b.py <локация>
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOC = sys.argv[1] if len(sys.argv) > 1 else "mutianyu"
AUDIO = ROOT / "locations" / LOC / "audio"
FFMPEG = ROOT / ".venv" / "bin" / "static_ffmpeg"
BUILD = ROOT / "build"
BUILD.mkdir(exist_ok=True)

lib = json.loads((ROOT / "locations" / "locations.json").read_text(encoding="utf-8"))
exc = next(e for e in lib["excursions"] if e["id"] == LOC)
chapters = json.loads((ROOT / "locations" / LOC / "chapters.json").read_text(encoding="utf-8"))

concat = BUILD / "list.txt"
concat.write_text(
    "".join(f"file '{(AUDIO / Path(c['file']).name).as_posix()}'\n" for c in chapters),
    encoding="utf-8",
)

meta_lines = [
    ";FFMETADATA1",
    f"title={exc['title']} — аудиоэкскурсия",
    "artist=Аудиогид",
    f"album=Аудиогид: {exc['country']}",
    "genre=Audiobook",
]
t = 0.0
for c in chapters:
    start_ms = round(t * 1000)
    t += c["duration_sec"]
    end_ms = round(t * 1000)
    meta_lines += ["[CHAPTER]", "TIMEBASE=1/1000", f"START={start_ms}", f"END={end_ms}", f"title={c['title']}"]
meta = BUILD / "meta.txt"
meta.write_text("\n".join(meta_lines) + "\n", encoding="utf-8")

out = BUILD / f"{LOC}.m4b"
subprocess.run(
    [str(FFMPEG), "-y", "-hide_banner", "-loglevel", "error",
     "-f", "concat", "-safe", "0", "-i", str(concat),
     "-i", str(meta), "-map_metadata", "1",
     "-c:a", "aac", "-b:a", "64k", "-f", "ipod", str(out)],
    check=True,
)
size_mb = out.stat().st_size / 1e6
print(f"готово: {out} ({size_mb:.1f} МБ, {t/60:.1f} мин, {len(chapters)} глав)")
