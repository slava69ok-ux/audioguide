# Собирает locations/mutianyu/chapters.json из mp3 (длительности через ffprobe).
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AUDIO = ROOT / "locations" / "mutianyu" / "audio"
FFPROBE = ROOT / ".venv" / "bin" / "static_ffprobe"

TITLES = {
    "01": "Первый взгляд на Мутяньюй",
    "02": "Зачем Китаю стена",
    "03": "Хроника стен: от Цинь до монголов",
    "04": "История Мутяньюй",
    "05": "Архитектура и инженерия",
    "06": "Башни и сигнальная система",
    "07": "Война на этом участке",
    "08": "Один день солдата",
    "09": "Прогулка по Мутяньюй",
    "10": "Забвение и возрождение",
    "11": "Стена сегодня: символ и мифы",
}

chapters = []
for mp3 in sorted(AUDIO.glob("*.mp3")):
    out = subprocess.run(
        [str(FFPROBE), "-v", "quiet", "-show_entries", "format=duration", "-of", "json", str(mp3)],
        capture_output=True, text=True, check=True,
    )
    dur = float(json.loads(out.stdout)["format"]["duration"])
    chapters.append({"file": f"audio/{mp3.name}", "title": TITLES[mp3.stem], "duration_sec": round(dur, 2)})

path = ROOT / "locations" / "mutianyu" / "chapters.json"
path.write_text(json.dumps(chapters, ensure_ascii=False, indent=1), encoding="utf-8")
total = sum(c["duration_sec"] for c in chapters)
print(f"{len(chapters)} глав, всего {total/60:.1f} минут -> {path}")
