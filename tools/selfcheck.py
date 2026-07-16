# Самопроверка перед сдачей: валидность JSON, существование файлов,
# монотонность таймингов, соответствие абзацев текстам глав.
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOC = ROOT / "locations" / "mutianyu"
ok = True


def fail(msg):
    global ok
    ok = False
    print(f"FAIL: {msg}")


# locations.json
lib = json.loads((ROOT / "locations" / "locations.json").read_text(encoding="utf-8"))
assert lib["excursions"][0]["id"] == "mutianyu"
print("OK: locations.json валиден")

# chapters.json
chapters = json.loads((LOC / "chapters.json").read_text(encoding="utf-8"))
total = 0
for c in chapters:
    mp3 = LOC / c["file"]
    if not mp3.exists():
        fail(f"нет файла {c['file']}")
    if not (60 < c["duration_sec"] < 1200):
        fail(f"подозрительная длительность {c['file']}: {c['duration_sec']}")
    total += c["duration_sec"]
print(f"OK: chapters.json — {len(chapters)} глав, {total/60:.1f} мин")
if not (78 * 60 <= total <= 95 * 60):
    fail(f"итоговый хронометраж вне 78–95 минут: {total/60:.1f}")

# тайминги
scripts = sorted((ROOT / "scripts").glob("*.txt"))
for c in chapters:
    nn = re.search(r"(\d+)\.mp3$", c["file"]).group(1)
    tf = LOC / "timings" / f"{nn}.json"
    if not tf.exists():
        fail(f"нет таймингов {nn}.json")
        continue
    t = json.loads(tf.read_text(encoding="utf-8"))
    starts = [row["start_sec"] for row in t]
    if starts != sorted(starts) or len(set(starts)) != len(starts):
        fail(f"{nn}.json: тайминги не монотонны")
    if starts and starts[-1] >= c["duration_sec"]:
        fail(f"{nn}.json: старт последнего абзаца позже конца главы")
    if any(row["para_index"] != i for i, row in enumerate(t)):
        fail(f"{nn}.json: para_index не по порядку")
    src = next((s for s in scripts if s.name.startswith(nn)), None)
    paras = [p.strip() for p in re.split(r"\n\s*\n", src.read_text(encoding="utf-8").strip()) if p.strip()]
    if len(paras) != len(t):
        fail(f"{nn}.json: абзацев {len(t)}, в тексте {len(paras)}")
    elif any(paras[i] != t[i]["text"] for i in range(len(paras))):
        fail(f"{nn}.json: тексты абзацев не совпадают с главой")
print("OK: тайминги проверены (монотонность, длительность, тексты)")

# sw: перечисленные файлы shell существуют
sw = (ROOT / "sw.js").read_text(encoding="utf-8")
for m in re.finditer(r'"([^"]+\.(?:html|js|css|json|png))"', sw):
    p = m.group(1)
    if not (ROOT / p).exists():
        fail(f"sw.js кэширует несуществующий {p}")
print("OK: пути в sw.js существуют")

print("\nСАМОПРОВЕРКА ПРОЙДЕНА" if ok else "\nЕСТЬ ОШИБКИ")
sys.exit(0 if ok else 1)
