/* =========================================================
   Реальная погода в Санкт-Петербурге на первом экране.
   Источник: Open-Meteo (без ключа). Если запрос не прошёл,
   остаётся запасное значение из HTML (−18°).
   ========================================================= */
(function () {
  const LAT = 59.94, LON = 30.31;
  const URL = "https://api.open-meteo.com/v1/forecast?latitude=" + LAT + "&longitude=" + LON +
    "&current=temperature_2m,weather_code,wind_speed_10m,is_day&wind_speed_unit=ms&timezone=Europe%2FMoscow";
  const CACHE_KEY = "wx-spb-v1";
  const CACHE_MS = 10 * 60 * 1000;

  // Иконки: 24×24, линия 1.6, цвет берётся из CSS
  const P = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
    moon: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
    cloud: '<path d="M7 18.5h10.5a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6-1.3A4.7 4.7 0 0 0 7 18.5z"/>',
    partlyDay: '<path d="M8 3.5v1.4M3.5 8h1.4M4.8 4.8l1 1M11.2 4.8l-1 1"/><path d="M5.9 10.6A3 3 0 0 1 10.6 6"/><path d="M9 19.5h9a3.5 3.5 0 0 0 .3-7 4.8 4.8 0 0 0-9.2-1.1A4 4 0 0 0 9 19.5z"/>',
    partlyNight: '<path d="M10.5 7.6A4.6 4.6 0 0 1 4.4 3.5a4.6 4.6 0 1 0 6.1 4.1z"/><path d="M9 19.5h9a3.5 3.5 0 0 0 .3-7 4.8 4.8 0 0 0-9.2-1.1A4 4 0 0 0 9 19.5z"/>',
    fog: '<path d="M7 12.5h10.5a3.6 3.6 0 0 0 .3-7.1 5 5 0 0 0-9.6-1.1A4.2 4.2 0 0 0 7 12.5z"/><path d="M4 16h16M6 19.5h12"/>',
    rain: '<path d="M7 14.5h10.5a3.6 3.6 0 0 0 .3-7.1 5 5 0 0 0-9.6-1.1A4.2 4.2 0 0 0 7 14.5z"/><path d="M8.5 17.5l-1 2.5M12.5 17.5l-1 2.5M16.5 17.5l-1 2.5"/>',
    snow: '<path d="M7 14.5h10.5a3.6 3.6 0 0 0 .3-7.1 5 5 0 0 0-9.6-1.1A4.2 4.2 0 0 0 7 14.5z"/><path d="M8 18.2v.1M12 18.2v.1M16 18.2v.1M10 20.8v.1M14 20.8v.1" stroke-width="2.4"/>',
    sleet: '<path d="M7 14.5h10.5a3.6 3.6 0 0 0 .3-7.1 5 5 0 0 0-9.6-1.1A4.2 4.2 0 0 0 7 14.5z"/><path d="M8.5 17.5l-1 2.5M15.5 17.5l-1 2.5"/><path d="M12 19.2v.1" stroke-width="2.4"/>',
    storm: '<path d="M7 14.5h10.5a3.6 3.6 0 0 0 .3-7.1 5 5 0 0 0-9.6-1.1A4.2 4.2 0 0 0 7 14.5z"/><path d="M12.8 15.5l-2.3 3.4h3l-2.3 3.4"/>',
    wind: '<path d="M3 9h11a3 3 0 1 0-3-3"/><path d="M3 13h15a3 3 0 1 1-3 3"/><path d="M3 17h7"/>'
  };

  function describe(code, isDay, wind) {
    let icon, text;
    if (code === 0) { icon = isDay ? "sun" : "moon"; text = "ясно"; }
    else if (code <= 2) { icon = isDay ? "partlyDay" : "partlyNight"; text = "переменная облачность"; }
    else if (code === 3) { icon = "cloud"; text = "пасмурно"; }
    else if (code === 45 || code === 48) { icon = "fog"; text = "туман"; }
    else if (code >= 51 && code <= 55) { icon = "rain"; text = "морось"; }
    else if (code === 56 || code === 57 || code === 66 || code === 67) { icon = "sleet"; text = "ледяной дождь"; }
    else if (code >= 61 && code <= 65) { icon = "rain"; text = "дождь"; }
    else if (code >= 80 && code <= 82) { icon = "rain"; text = "ливень"; }
    else if ((code >= 71 && code <= 77) || code === 85 || code === 86) { icon = "snow"; text = "снег"; }
    else if (code >= 95) { icon = "storm"; text = "гроза"; }
    else { icon = "cloud"; text = "облачно"; }
    // сильный ветер без осадков показываем значком ветра
    if (wind >= 10 && ["sun", "moon", "partlyDay", "partlyNight", "cloud"].includes(icon)) icon = "wind";
    if (wind >= 7) text += ", ветер " + Math.round(wind) + " м/с";
    return { icon, text };
  }

  const fmt = (t) => { const v = Math.round(t); return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v) + "°"; };

  function readCache() {
    try {
      const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
      if (c && Date.now() - c.at < CACHE_MS) return c.data;
    } catch (_) {}
    return null;
  }
  function writeCache(data) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data })); } catch (_) {}
  }

  function load() {
    const cached = readCache();
    if (cached) return Promise.resolve(cached);
    const ctrl = "AbortController" in window ? new AbortController() : null;
    const timer = setTimeout(() => ctrl && ctrl.abort(), 4000);
    return fetch(URL, ctrl ? { signal: ctrl.signal } : {})
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((j) => {
        const c = j.current || {};
        if (typeof c.temperature_2m !== "number") throw new Error("no data");
        const data = { t: c.temperature_2m, code: c.weather_code, wind: c.wind_speed_10m || 0, day: c.is_day === 1 };
        writeCache(data);
        return data;
      })
      .finally(() => clearTimeout(timer));
  }

  function render(w) {
    const row = document.querySelector(".thermo-row.cold");
    if (!row) return;
    const d = describe(w.code, w.day, w.wind);
    row.querySelector(".wx-icon").innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + P[d.icon] + "</svg>";
    row.querySelector(".js-wx-label").textContent = "Сейчас в Петербурге";
    row.querySelector(".js-wx-desc").textContent = d.text;
    row.querySelector(".js-wx-desc").hidden = false;
    row.querySelector(".js-out").textContent = fmt(w.t);
    row.classList.add("is-live");
    const box = document.querySelector(".thermo");
    if (box) box.setAttribute("aria-label", "Сейчас в Петербурге " + fmt(w.t) + ", " + d.text + ". На утеплённой лоджии +22°");
  }

  // Промис для анимации «тепла» на лоджии: стартует от реальной уличной температуры
  window.__wx = load().then((w) => {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => render(w));
    else render(w);
    return w;
  }).catch(() => null);
})();
