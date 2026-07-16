# Автопроверка текстов глав перед озвучкой: латиница, markdown, римские цифры, сокращения.
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "scripts"

BAD_ABBR = [r"\bкм\b", r"\bкв\b", r"\bтыс\b",
            r"(?<![а-яёА-ЯЁ])[тТ]\.\s*[дп]\.", r"(?<![а-яёА-ЯЁ])н\.\s*э\.", r"(?<![а-яёА-ЯЁ])др\.\s"]
MD_CHARS = r"[#*_`\[\]{}()<>|~^%$@&+=/\\]"

ok = True
for f in sorted(SCRIPTS.glob("*.txt")):
    text = f.read_text(encoding="utf-8")
    problems = []
    for m in re.finditer(r"[A-Za-z]+", text):
        problems.append(f"латиница: {m.group()!r} @ {m.start()}")
    for m in re.finditer(MD_CHARS, text):
        problems.append(f"спецсимвол: {m.group()!r} @ {m.start()}")
    for pat in BAD_ABBR:
        for m in re.finditer(pat, text, re.IGNORECASE):
            problems.append(f"сокращение: {m.group()!r} @ {m.start()}")
    # цифры допустимы только в виде годов: 1-4 цифры перед словами год/года/году/годов
    for m in re.finditer(r"\d+", text):
        tail = text[m.end():m.end() + 12]
        if not re.match(r"\s+(год|года|году|годов|году,|года,)", tail):
            problems.append(f"цифры не-год: {m.group()!r} … {text[m.start():m.end()+15]!r}")
    words = len(text.split())
    paras = [p for p in re.split(r"\n\s*\n", text) if p.strip()]
    long_paras = sum(1 for p in paras if len(re.findall(r"[.!?…]+", p)) > 4)
    est_min = words / 135
    status = "OK " if not problems else "FAIL"
    print(f"{status} {f.name}: {words} слов ≈ {est_min:.1f} мин, {len(paras)} абзацев, длинных абзацев: {long_paras}")
    for p in problems:
        print(f"     - {p}")
        ok = False

total = sum(len(f.read_text(encoding='utf-8').split()) for f in SCRIPTS.glob("*.txt"))
print(f"\nИТОГО: {total} слов ≈ {total/135:.0f} минут при 135 слов/мин")
sys.exit(0 if ok else 1)
