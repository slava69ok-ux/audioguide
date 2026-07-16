# Audioguide 1.0

Личный аудиогид-PWA для путешествий: приезжаешь к достопримечательности, надеваешь наушники, слушаешь с телефона. Работает офлайн, живёт на GitHub Pages, ничего не собирается — чистый HTML/CSS/JS.

Первая экскурсия: **Великая Китайская стена, участок Мутяньюй** (~80 минут, 11 глав, голос ru-RU-DmitryNeural).

## Структура

```
index.html            — библиотека экскурсий (страна → места) из locations/locations.json
player.html           — плеер (?loc=mutianyu)
app.js styles.css     — логика и стили
sw.js                 — service worker: cache-first + Range-ответы для iOS-аудио
manifest.json icons/  — PWA
scripts/              — исходные тексты глав (чистый текст для TTS)
tools/                — python-скрипты генерации (см. ниже)
locations/mutianyu/
  chapters.json       — [{file, title, duration_sec}]
  audio/NN.mp3        — озвучка глав (edge-tts, 24 кГц)
  timings/NN.json     — [{para_index, start_sec, text}] для подсветки текста
build/mutianyu.m4b    — аудиокнига с главами (резерв: Apple Books, офлайн)
```

## Регенерация (нужен Python 3)

```bash
python3 -m venv .venv
.venv/bin/pip install edge-tts static-ffmpeg pillow
.venv/bin/python tools/validate.py        # автопроверка текстов перед озвучкой
.venv/bin/python tools/synth.py           # озвучка + тайминги (можно: synth.py 03 07)
.venv/bin/python tools/build_chapters.py  # chapters.json из mp3
.venv/bin/python tools/make_m4b.py        # аудиокнига build/mutianyu.m4b
```

## Локальный запуск

```bash
python3 -m http.server 8737
# открыть http://localhost:8737
```

## Новая экскурсия

1. Тексты глав → `scripts/` новой папки, озвучка теми же скриптами в `locations/<id>/`
2. Запись в `locations/locations.json`
3. Существующий код не трогается: библиотека и плеер подхватят новую папку сами
