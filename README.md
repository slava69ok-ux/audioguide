# Audioguide 1.0

Личный аудиогид-PWA для путешествий: приезжаешь к достопримечательности, надеваешь наушники, слушаешь с телефона. Работает офлайн, живёт на GitHub Pages, ничего не собирается — чистый HTML/CSS/JS.

Экскурсии (голос ru-RU-DmitryNeural):
- **Великая Китайская стена, участок Мутяньюй** — ~80 минут, 11 глав
- **Гора Тяньмэнь, Чжанцзяцзе** — ~40 минут, 8 глав

## Структура

```
index.html            — библиотека экскурсий (страна → места) из locations/locations.json
player.html           — плеер (?loc=mutianyu, необязательный ?ch=N — старт с главы N)
app.js styles.css     — логика и стили
sw.js                 — service worker: cache-first + Range-ответы для iOS-аудио
manifest.json icons/  — PWA
scripts/<loc>/        — исходные тексты глав (чистый текст для TTS) + titles.json
tools/                — python-скрипты генерации (см. ниже)
locations/<loc>/
  chapters.json       — [{file, title, duration_sec}]
  audio/NN.mp3        — озвучка глав (edge-tts, 24 кГц)
  timings/NN.json     — [{para_index, start_sec, text}] для подсветки текста
build/<loc>.m4b       — аудиокнига с главами (резерв: Apple Books, офлайн)
```

## Регенерация (нужен Python 3)

```bash
python3 -m venv .venv
.venv/bin/pip install edge-tts static-ffmpeg pillow
.venv/bin/python tools/validate.py                 # автопроверка всех текстов перед озвучкой
.venv/bin/python tools/synth.py tianmen            # озвучка + тайминги (можно: synth.py tianmen 03 07)
.venv/bin/python tools/build_chapters.py tianmen   # chapters.json из mp3 и titles.json
.venv/bin/python tools/make_m4b.py tianmen         # аудиокнига build/tianmen.m4b
.venv/bin/python tools/selfcheck.py                # финальная проверка всех экскурсий
```

## Локальный запуск

```bash
python3 -m http.server 8737
# открыть http://localhost:8737
```

## Новая экскурсия

1. Тексты глав → `scripts/<id>/NN-nazvanie.txt` + `scripts/<id>/titles.json`
2. `synth.py <id>` → `build_chapters.py <id>` → `make_m4b.py <id>`
3. Запись в `locations/locations.json`
4. Существующий код не трогается: библиотека и плеер подхватят новую папку сами
