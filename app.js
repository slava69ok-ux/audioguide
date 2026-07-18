/* Аудиогид: логика библиотеки (index.html) и плеера (player.html).
   Все пути относительные — сайт живёт в подкаталоге github.io/имя-репозитория/. */
"use strict";

const $ = (sel) => document.querySelector(sel);

function fmt(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

/* ================= БИБЛИОТЕКА ================= */

async function initLibrary() {
  const root = $("#library");
  let data;
  try {
    data = await fetchJSON("locations/locations.json");
  } catch (e) {
    root.innerHTML = "<p class='loading'>Не удалось загрузить библиотеку. Проверьте сеть.</p>";
    return;
  }

  const countries = [...new Set(data.excursions.map((e) => e.country))]
    .sort((a, b) => a.localeCompare(b, "ru"));
  const country = new URLSearchParams(location.search).get("country");

  root.innerHTML = "";
  if (country && countries.includes(country)) {
    renderCountry(root, data, country);
  } else {
    renderHome(root, data, countries);
  }
}

/* Главная: список стран по алфавиту */
function renderHome(root, data, countries) {
  const ul = document.createElement("ul");
  ul.className = "country-list";
  for (const c of countries) {
    const n = data.excursions.filter((e) => e.country === c).length;
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.className = "country-link";
    a.href = `index.html?country=${encodeURIComponent(c)}`;
    a.innerHTML = `<span class="country-name"></span><span class="country-count"></span><span class="country-arrow">›</span>`;
    a.querySelector(".country-name").textContent = c;
    a.querySelector(".country-count").textContent = `${n} ${plural(n, "экскурсия", "экскурсии", "экскурсий")}`;
    li.appendChild(a);
    ul.appendChild(li);
  }
  root.appendChild(ul);
}

/* Страница страны: её экскурсии */
function renderCountry(root, data, country) {
  document.title = `Аудиогид — ${country}`;
  const h1 = document.querySelector(".lib-header h1");
  if (h1) h1.textContent = country;
  const tag = document.querySelector(".lib-header .tagline");
  if (tag) {
    tag.textContent = "";
    const back = document.createElement("a");
    back.className = "back-link";
    back.href = "index.html";
    back.textContent = "‹ Все страны";
    tag.appendChild(back);
  }
  for (const exc of data.excursions.filter((e) => e.country === country)) {
    root.appendChild(buildCard(exc));
  }
}

function buildCard(exc) {
  const card = document.createElement("article");
  card.className = "card";
  card.innerHTML = `
    <div class="card-top">
      <div class="mark"></div>
      <div class="card-headings">
        <h3></h3>
        <p class="sub"></p>
      </div>
    </div>
    <p class="desc"></p>
    <div class="card-foot">
      <p class="meta">…</p>
      <p class="offline-state" hidden>✓ офлайн<button class="del">удалить</button></p>
    </div>
    <div class="card-actions">
      <a class="btn primary listen">Слушать</a>
      <button class="btn offline-btn">Скачать</button>
    </div>
    <button class="chapters-toggle" hidden>Все главы ▾</button>
    <ol class="card-chapters" hidden></ol>`;
  card.querySelector(".mark").textContent = exc.hanzi || exc.emoji || "";
  card.querySelector("h3").textContent = exc.title;
  card.querySelector(".sub").textContent = exc.subtitle || "";
  card.querySelector(".desc").textContent = exc.description || "";
  card.querySelector(".listen").href = `player.html?loc=${encodeURIComponent(exc.id)}`;

  fetchJSON(`locations/${exc.id}/chapters.json`).then((chs) => {
    const total = chs.reduce((a, c) => a + c.duration_sec, 0);
    const mins = Math.round(total / 60);
    card.querySelector(".meta").textContent =
      `${chs.length} ${plural(chs.length, "глава", "главы", "глав")} · ${mins} ${plural(mins, "минута", "минуты", "минут")}`;

    // разворачиваемый список глав: тап по главе открывает плеер сразу с неё
    const toggle = card.querySelector(".chapters-toggle");
    const ol = card.querySelector(".card-chapters");
    chs.forEach((c, i) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="num">${i + 1}</span><span class="name"></span><span class="dur">${fmt(c.duration_sec)}</span>`;
      li.querySelector(".name").textContent = c.title;
      li.addEventListener("click", () => {
        location.href = `player.html?loc=${encodeURIComponent(exc.id)}&ch=${i + 1}`;
      });
      ol.appendChild(li);
    });
    toggle.hidden = false;
    toggle.addEventListener("click", () => {
      ol.hidden = !ol.hidden;
      toggle.textContent = ol.hidden ? "Все главы ▾" : "Все главы ▴";
    });
  }).catch(() => { card.querySelector(".meta").textContent = ""; });

  const btn = card.querySelector(".offline-btn");
  const state = card.querySelector(".offline-state");

  async function refreshOffline() {
    const ok = await isDownloaded(exc.id);
    btn.hidden = ok;
    state.hidden = !ok;
  }
  refreshOffline();

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      await downloadLocation(exc.id, (p) => { btn.textContent = `Скачиваю… ${p}%`; });
      btn.textContent = "Скачать";
    } catch (e) {
      btn.textContent = "Ошибка, повторить";
    }
    btn.disabled = false;
    refreshOffline();
  });

  state.querySelector(".del").addEventListener("click", async () => {
    await caches.delete(`loc-${exc.id}`);
    btn.textContent = "Скачать";
    refreshOffline();
  });

  return card;
}

async function isDownloaded(id) {
  if (!("caches" in window)) return false;
  if (!(await caches.has(`loc-${id}`))) return false;
  const cache = await caches.open(`loc-${id}`);
  return !!(await cache.match("__complete__"));
}

async function downloadLocation(id, onProgress) {
  const base = `locations/${id}/`;
  const chapters = await fetchJSON(`${base}chapters.json`);
  const files = [`${base}chapters.json`];
  for (const c of chapters) {
    files.push(base + c.file);
    const nn = c.file.match(/(\d+)\.mp3$/)[1];
    files.push(`${base}timings/${nn}.json`);
  }
  const cache = await caches.open(`loc-${id}`);
  let done = 0;
  for (const f of files) {
    const resp = await fetch(f, { cache: "no-store" });
    if (!resp.ok) throw new Error(`${f}: ${resp.status}`);
    await cache.put(f, resp);
    done++;
    onProgress(Math.round((done / files.length) * 100));
  }
  await cache.put("__complete__", new Response("ok"));
}

/* ================= ПЛЕЕР ================= */

const SPEEDS = [0.8, 0.9, 1, 1.1, 1.25, 1.5];

async function initPlayer() {
  const params = new URLSearchParams(location.search);
  const loc = params.get("loc") || "mutianyu";

  let excTitle = loc;
  try {
    const lib = await fetchJSON("locations/locations.json");
    const entry = lib.excursions.find((e) => e.id === loc);
    if (entry) {
      excTitle = entry.title;
      // назад — на страницу страны, а не на список стран
      const back = document.querySelector(".player-header .back");
      if (back) back.href = `index.html?country=${encodeURIComponent(entry.country)}`;
    }
  } catch (e) { /* офлайн без кэша библиотеки — не критично */ }

  const chapters = await fetchJSON(`locations/${loc}/chapters.json`);
  const total = chapters.reduce((a, c) => a + c.duration_sec, 0);
  const cum = [];
  chapters.reduce((a, c, i) => { cum[i] = a; return a + c.duration_sec; }, 0);

  const audio = $("#audio");
  let idx = 0;
  let timings = [];
  let textMode = false;
  let dragging = false;
  let speed = parseFloat(localStorage.getItem("ag-speed") || "1");

  const doneKey = `ag-done-${loc}`;
  const listened = new Set(JSON.parse(localStorage.getItem(doneKey) || "[]"));

  $("#exc-title").textContent = excTitle;
  document.title = excTitle;

  function chDur() {
    return (isFinite(audio.duration) && audio.duration > 0) ? audio.duration : chapters[idx].duration_sec;
  }

  /* ---------- загрузка главы ---------- */
  async function loadChapter(i, { at = 0, autoplay = false } = {}) {
    idx = Math.max(0, Math.min(chapters.length - 1, i));
    const ch = chapters[idx];
    $("#chapter-label").textContent = `Глава ${idx + 1} из ${chapters.length}`;
    $("#chapter-title").textContent = ch.title;

    audio.src = `locations/${loc}/${ch.file}`;
    audio.playbackRate = speed;
    if (at > 0) {
      const seekTo = Math.min(at, ch.duration_sec - 1);
      const once = () => { audio.currentTime = seekTo; audio.removeEventListener("loadedmetadata", once); };
      audio.addEventListener("loadedmetadata", once);
    }
    if (autoplay) audio.play().catch(() => {});

    timings = [];
    renderText([]);
    const nn = ch.file.match(/(\d+)\.mp3$/)[1];
    fetchJSON(`locations/${loc}/timings/${nn}.json`)
      .then((t) => { timings = t; renderText(t); })
      .catch(() => { renderText(null); });

    updateMediaSession();
    renderChaptersList();
    updateBars();
  }

  /* ---------- текстовый режим ---------- */
  function renderText(t) {
    const view = $("#text-view");
    view.innerHTML = "";
    if (t === null) { view.innerHTML = "<p>Текст главы недоступен.</p>"; return; }
    for (const row of t) {
      const p = document.createElement("p");
      p.textContent = row.text;
      p.dataset.start = row.start_sec;
      p.addEventListener("click", () => {
        audio.currentTime = row.start_sec;
        if (audio.paused) audio.play().catch(() => {});
      });
      view.appendChild(p);
    }
  }

  let lastPara = -1;
  function highlightText() {
    if (!textMode || !timings.length) return;
    const t = audio.currentTime;
    let cur = 0;
    for (let i = 0; i < timings.length; i++) {
      if (t >= timings[i].start_sec) cur = i; else break;
    }
    if (cur === lastPara) return;
    lastPara = cur;
    const ps = $("#text-view").children;
    for (let i = 0; i < ps.length; i++) ps[i].classList.toggle("active", i === cur);
    if (document.visibilityState === "visible" && ps[cur]) {
      ps[cur].scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  $("#btn-text-mode").addEventListener("click", () => {
    textMode = !textMode;
    $("#btn-text-mode").classList.toggle("active", textMode);
    $("#text-view").hidden = !textMode;
    $("#art-view").style.display = textMode ? "none" : "";
    lastPara = -1;
    highlightText();
  });

  /* ---------- прогресс-бары ---------- */
  function updateBars() {
    const dur = chDur();
    const t = Math.min(audio.currentTime || 0, dur);
    if (!dragging) {
      const p = dur ? (t / dur) * 100 : 0;
      $("#chapter-bar .fill").style.width = p + "%";
      $("#chapter-bar .thumb").style.left = p + "%";
      $("#ch-elapsed").textContent = fmt(t);
      $("#ch-remain").textContent = "−" + fmt(dur - t);
      $("#ch-percent").textContent = Math.round(p) + "%";
    }
    const tt = cum[idx] + t;
    const tp = (tt / total) * 100;
    $("#total-bar .fill").style.width = tp + "%";
    $("#t-elapsed").textContent = fmt(tt);
    $("#t-remain").textContent = "−" + fmt(total - tt);
    $("#t-percent").textContent = `Вся экскурсия · ${Math.round(tp)}%`;
  }

  const bar = $("#chapter-bar");
  function barRatio(ev) {
    const r = bar.getBoundingClientRect();
    return Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
  }
  bar.addEventListener("pointerdown", (ev) => {
    dragging = true;
    bar.setPointerCapture(ev.pointerId);
    previewDrag(ev);
  });
  bar.addEventListener("pointermove", (ev) => { if (dragging) previewDrag(ev); });
  bar.addEventListener("pointerup", (ev) => {
    if (!dragging) return;
    dragging = false;
    audio.currentTime = barRatio(ev) * chDur();
    updateBars();
  });
  bar.addEventListener("pointercancel", () => { dragging = false; });
  function previewDrag(ev) {
    const ratio = barRatio(ev);
    const dur = chDur();
    $("#chapter-bar .fill").style.width = ratio * 100 + "%";
    $("#chapter-bar .thumb").style.left = ratio * 100 + "%";
    $("#ch-elapsed").textContent = fmt(ratio * dur);
    $("#ch-remain").textContent = "−" + fmt(dur * (1 - ratio));
    $("#ch-percent").textContent = Math.round(ratio * 100) + "%";
  }

  /* ---------- кнопки ---------- */
  const playBtn = $("#btn-play");
  playBtn.addEventListener("click", () => {
    if (audio.paused) audio.play().catch(() => {}); else audio.pause();
  });
  audio.addEventListener("play", () => {
    playBtn.textContent = "⏸";
    $("#resume-banner").hidden = true;
    // явное состояние для iOS: без него play/pause с локскрина глохнут после паузы
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
  });
  audio.addEventListener("pause", () => {
    playBtn.textContent = "▶";
    savePos();
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
    lastPosUpdate = 0;
    updatePositionState();
  });

  $("#btn-back15").addEventListener("click", () => { audio.currentTime = Math.max(0, audio.currentTime - 15); });
  $("#btn-fwd15").addEventListener("click", () => { audio.currentTime = Math.min(chDur(), audio.currentTime + 15); });
  $("#btn-prev").addEventListener("click", () => {
    if (audio.currentTime > 3 || idx === 0) audio.currentTime = 0;
    else loadChapter(idx - 1, { autoplay: !audio.paused });
  });
  $("#btn-next").addEventListener("click", () => {
    if (idx < chapters.length - 1) loadChapter(idx + 1, { autoplay: !audio.paused });
  });

  const speedBtn = $("#btn-speed");
  function showSpeed() { speedBtn.textContent = speed.toString().replace(".", ",") + "×"; }
  speedBtn.addEventListener("click", () => {
    const i = SPEEDS.indexOf(speed);
    speed = SPEEDS[(i + 1) % SPEEDS.length];
    audio.playbackRate = speed;
    localStorage.setItem("ag-speed", String(speed));
    showSpeed();
  });
  showSpeed();

  /* ---------- список глав ---------- */
  function renderChaptersList() {
    const ol = $("#chapters-list");
    ol.innerHTML = "";
    chapters.forEach((c, i) => {
      const li = document.createElement("li");
      if (i === idx) li.classList.add("current");
      li.innerHTML = `<span class="num">${i + 1}</span><span class="name"></span>` +
        `<span class="dur">${fmt(c.duration_sec)}</span>` +
        (listened.has(i) ? `<span class="done">✓</span>` : "");
      li.querySelector(".name").textContent = c.title;
      li.addEventListener("click", () => {
        $("#chapters-panel").hidden = true;
        loadChapter(i, { autoplay: true });
      });
      ol.appendChild(li);
    });
  }
  $("#btn-chapters").addEventListener("click", () => { renderChaptersList(); $("#chapters-panel").hidden = false; });
  $("#chapters-close").addEventListener("click", () => { $("#chapters-panel").hidden = true; });

  /* ---------- автопереход глав (один <audio>, критично для iOS) ---------- */
  audio.addEventListener("ended", () => {
    listened.add(idx);
    localStorage.setItem(doneKey, JSON.stringify([...listened]));
    if (idx < chapters.length - 1) {
      loadChapter(idx + 1, { autoplay: true });
    } else {
      savePos(0, 0);
      playBtn.textContent = "▶";
    }
  });

  audio.addEventListener("timeupdate", () => { updateBars(); highlightText(); updatePositionState(); });
  audio.addEventListener("loadedmetadata", updateBars);

  /* ---------- сохранение позиции ---------- */
  function savePos(chapter = idx, time = audio.currentTime) {
    localStorage.setItem("ag-pos", JSON.stringify({ loc, chapter, time: Math.floor(time || 0), ts: Date.now() }));
  }
  setInterval(() => { if (!audio.paused) savePos(); }, 5000);
  document.addEventListener("visibilitychange", () => savePos());
  window.addEventListener("pagehide", () => savePos());

  /* ---------- Media Session ---------- */
  function updateMediaSession() {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: chapters[idx].title,
      artist: excTitle,
      album: "Аудиогид",
      artwork: [
        { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    });
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", () => audio.play());
    ms.setActionHandler("pause", () => audio.pause());
    ms.setActionHandler("seekbackward", () => { audio.currentTime = Math.max(0, audio.currentTime - 15); });
    ms.setActionHandler("seekforward", () => { audio.currentTime = Math.min(chDur(), audio.currentTime + 15); });
    ms.setActionHandler("previoustrack", () => { if (idx > 0) loadChapter(idx - 1, { autoplay: true }); });
    ms.setActionHandler("nexttrack", () => { if (idx < chapters.length - 1) loadChapter(idx + 1, { autoplay: true }); });
    try {
      ms.setActionHandler("seekto", (d) => { if (d.seekTime != null) audio.currentTime = d.seekTime; });
    } catch (e) { /* не везде поддерживается */ }
  }
  let lastPosUpdate = 0;
  function updatePositionState() {
    if (!("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return;
    const now = Date.now();
    if (now - lastPosUpdate < 1000) return;
    lastPosUpdate = now;
    const dur = chDur();
    if (!isFinite(dur) || dur <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: dur,
        playbackRate: audio.playbackRate,
        position: Math.min(audio.currentTime, dur),
      });
    } catch (e) { /* ignore */ }
  }

  /* ---------- восстановление позиции ---------- */
  // явный ?ch=N (нумерация с 1) важнее сохранённой позиции — открываем сразу нужную главу
  const chParam = parseInt(params.get("ch") || "", 10);
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem("ag-pos") || "null"); } catch (e) {}
  if (chParam >= 1 && chParam <= chapters.length) {
    loadChapter(chParam - 1);
  } else if (saved && saved.loc === loc && (saved.chapter > 0 || saved.time > 20)) {
    $("#resume-text").textContent = `Продолжить с ${fmt(saved.time)}, глава ${saved.chapter + 1}?`;
    $("#resume-banner").hidden = false;
    $("#resume-yes").addEventListener("click", () => {
      $("#resume-banner").hidden = true;
      loadChapter(saved.chapter, { at: saved.time, autoplay: true });
    });
    $("#resume-no").addEventListener("click", () => {
      $("#resume-banner").hidden = true;
      loadChapter(0);
    });
    $("#resume-close").addEventListener("click", () => {
      $("#resume-banner").hidden = true;
    });
    loadChapter(saved.chapter, { at: saved.time });
  } else {
    loadChapter(0);
  }
}

/* ================= запуск ================= */
if (document.body.classList.contains("library")) {
  initLibrary();
} else if (document.body.classList.contains("player-page")) {
  initPlayer().catch((e) => {
    document.body.insertAdjacentHTML("beforeend",
      `<p style="padding:20px;color:#f66">Не удалось загрузить экскурсию: ${e.message}</p>`);
  });
}
