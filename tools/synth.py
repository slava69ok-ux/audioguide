# Озвучка глав через edge-tts + сбор таймингов абзацев из WordBoundary.
# Использование: .venv/bin/python tools/synth.py <локация> [NN ...]  (без NN — все главы)
import asyncio
import json
import re
import subprocess
import sys
from pathlib import Path

import edge_tts

VOICE = "ru-RU-DmitryNeural"
ROOT = Path(__file__).resolve().parent.parent
LOC = sys.argv[1] if len(sys.argv) > 1 else "mutianyu"
SCRIPTS = ROOT / "scripts" / LOC
AUDIO = ROOT / "locations" / LOC / "audio"
TIMINGS = ROOT / "locations" / LOC / "timings"
FFPROBE = ROOT / ".venv" / "bin" / "static_ffprobe"


def paragraphs(text):
    return [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]


def probe_duration(mp3):
    out = subprocess.run(
        [str(FFPROBE), "-v", "quiet", "-show_entries", "format=duration", "-of", "json", str(mp3)],
        capture_output=True, text=True, check=True,
    )
    return float(json.loads(out.stdout)["format"]["duration"])


async def synth_chapter(txt_path, retries=3):
    nn = txt_path.name[:2]
    text = txt_path.read_text(encoding="utf-8").strip()
    paras = paragraphs(text)
    full = "\n\n".join(paras)

    # позиция начала каждого абзаца в полном тексте
    starts, pos = [], 0
    for p in paras:
        starts.append(pos)
        pos += len(p) + 2

    mp3 = AUDIO / f"{nn}.mp3"
    events = []
    for attempt in range(1, retries + 1):
        try:
            events.clear()
            comm = edge_tts.Communicate(full, VOICE, boundary="WordBoundary")
            with open(mp3, "wb") as f:
                async for chunk in comm.stream():
                    if chunk["type"] == "audio":
                        f.write(chunk["data"])
                    elif chunk["type"] == "WordBoundary":
                        events.append((chunk["offset"] / 1e7, chunk["text"]))
            break
        except Exception as e:
            print(f"[{nn}] попытка {attempt} не удалась: {e}", flush=True)
            if attempt == retries:
                raise
            await asyncio.sleep(5 * attempt)

    duration = probe_duration(mp3)

    # сопоставляем события со словами исходника последовательным поиском
    para_start = [None] * len(paras)
    search_pos, matched = 0, 0
    for sec, word in events:
        w = word.strip()
        if not w:
            continue
        idx = full.find(w, search_pos)
        if idx < 0:
            continue
        matched += 1
        search_pos = idx + len(w)
        pi = 0
        for i, st in enumerate(starts):
            if idx >= st:
                pi = i
        if para_start[pi] is None:
            para_start[pi] = sec

    method = "wordboundary"
    coverage = matched / max(1, len(events))
    filled = sum(1 for s in para_start if s is not None)
    if not events or coverage < 0.5 or filled < len(paras) * 0.8:
        # фолбэк: пропорционально числу символов
        method = "proportional"
        total_chars = sum(len(p) for p in paras)
        acc = 0.0
        para_start = []
        for p in paras:
            para_start.append(duration * acc / total_chars)
            acc += len(p)
    else:
        # заполняем редкие пропуски интерполяцией и чиним монотонность
        for i in range(len(para_start)):
            if para_start[i] is None:
                prev_v = para_start[i - 1] if i > 0 else 0.0
                nxt = next((para_start[j] for j in range(i + 1, len(para_start)) if para_start[j] is not None), duration)
                para_start[i] = (prev_v + nxt) / 2
        for i in range(1, len(para_start)):
            if para_start[i] <= para_start[i - 1]:
                para_start[i] = para_start[i - 1] + 0.01

    para_start[0] = 0.0
    data = [
        {"para_index": i, "start_sec": round(min(s, duration), 3), "text": paras[i]}
        for i, s in enumerate(para_start)
    ]
    TIMINGS.joinpath(f"{nn}.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    print(f"[{nn}] готово: {duration/60:.1f} мин, абзацев {len(paras)}, "
          f"метод {method}, покрытие слов {coverage:.0%}", flush=True)


async def main():
    only = set(sys.argv[2:])
    AUDIO.mkdir(parents=True, exist_ok=True)
    TIMINGS.mkdir(parents=True, exist_ok=True)
    files = sorted(SCRIPTS.glob("*.txt"))
    if only:
        files = [f for f in files if f.name[:2] in only]
    if not files:
        sys.exit(f"нет глав в {SCRIPTS}")
    for f in files:
        await synth_chapter(f)


asyncio.run(main())
