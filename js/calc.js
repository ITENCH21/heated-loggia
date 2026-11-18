/* =========================================================
   КАЛЬКУЛЯТОР: цены лежат в PRICES, их можно править
   без изменения логики. Всё в рублях.
   ========================================================= */
(function () {
  // Ставки: рынок РФ 2025–2026, средний+ сегмент, работа + материалы (см. docs/references.md).
  // Площадь стен и потолка ≈ 4,3 × площадь пола, высота остекления ≈ 1,5 м.
  const PRICES = {
    // остекление за погонный метр фасада (13 000 / 8 500 ₽ за м² × 1,5 м высоты)
    glazing: { none: 0, cold: 12500, warm: 19500 },
    // комплекс утепления (стены 2 000 ₽/м², пол 3 200, потолок 2 000) на м² пола
    insulation: 12000,
    // отделка стен и потолка на м² пола (ПВХ 3 000, МДФ 3 600, вагонка 4 500, ГКЛ+покраска 6 500 ₽/м² поверхности)
    finish: { pvc: 12500, lining: 19000, mdf: 15000, paint: 26000 },
    // пол на м²
    floor: { laminate: 3500, vinyl: 4000, tile: 6000 },
    heated: 4500,        // тёплый пол, м²
    thermostat: 9000,    // терморегулятор
    electricLine: 15000, // отдельная линия с УЗО
    socket: 2000,        // точка: розетка или выключатель
    lightsBase: 6000,    // точечные светильники, 2 шт
    lightsPerM: 3500,    // LED-подсветка, пог. м
    sill: 3500,          // подоконник, пог. м
    cabinet: 40000,      // шкаф или тумба (~1,2 пог. м)
    extendBase: 25000,   // вынос: демонтаж, усиление
    extendPerM: 9000,    // вынос, пог. м
    demolition: 12000,   // демонтаж и вывоз мусора
    spread: 0.12         // разброс «от–до»
  };
  window.PRICES = PRICES;

  const fmt = (n) => Math.round(n / 1000) * 1000;
  const rub = (n) => fmt(n).toLocaleString("ru-RU").replace(/,/g, " ") + " ₽";

  function frontLength(type, area) {
    // длина остекления по фасаду: балкон обычно ~1 м глубиной и стеклится с трёх сторон,
    // лоджия ~1,4 м и стеклится только спереди
    return type === "balcony" ? area / 1.0 + 2 * 1.0 : area / 1.3;
  }

  function compute(s) {
    const L = frontLength(s.type, s.area);
    const lines = [];
    const add = (label, sum) => { if (sum > 0) lines.push([label, sum]); };

    add("Демонтаж и вывоз мусора", PRICES.demolition);
    add(s.glazing === "warm" ? "Тёплое остекление" : "Холодное остекление", PRICES.glazing[s.glazing] * L);
    if (s.insulation) add("Утепление пола, стен, потолка", PRICES.insulation * s.area);
    add("Отделка стен и потолка", PRICES.finish[s.finish] * s.area);
    add("Пол", PRICES.floor[s.floor] * s.area);
    if (s.heated) add("Тёплый пол с терморегулятором", PRICES.heated * s.area + PRICES.thermostat);
    const needLine = s.sockets > 0 || s.lights || s.heated;
    add("Электрика: линия с УЗО, розетки", (needLine ? PRICES.electricLine : 0) + PRICES.socket * s.sockets);
    if (s.lights) add("Свет и LED-подсветка", PRICES.lightsBase + PRICES.lightsPerM * L);
    if (s.sill) add("Подоконник", PRICES.sill * L);
    if (s.cabinet) add("Шкаф или тумба", PRICES.cabinet);

    const total = lines.reduce((a, l) => a + l[1], 0);
    let days = 4 + s.area * 0.7 + (s.glazing !== "none" ? 2 : 0) + (s.cabinet ? 1 : 0);
    days = Math.round(days);
    return { total, lines, days, L };
  }

  function readState(form) {
    const fd = new FormData(form);
    return {
      type: fd.get("type"),
      area: parseFloat(fd.get("area")),
      glazing: fd.get("glazing"),
      finish: fd.get("finish"),
      floor: fd.get("floor"),
      insulation: fd.has("insulation"),
      heated: fd.has("heated"),
      lights: fd.has("lights"),
      sill: fd.has("sill"),
      cabinet: fd.has("cabinet"),
      sockets: parseInt(document.getElementById("sockets").value || "0", 10)
    };
  }

  function daysWord(n) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return "день";
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "дня";
    return "дней";
  }

  function init() {
    const form = document.getElementById("calcForm");
    if (!form) return;
    const area = form.querySelector("#area");
    const areaOut = form.querySelector("#areaOut");
    const sockets = document.getElementById("sockets");
    const totalEl = document.getElementById("total");
    const rangeEl = document.getElementById("range");
    const linesEl = document.getElementById("lines");
    const daysEl = document.getElementById("days");

    let shown = 0;
    let raf = 0;

    function animateTotal(to) {
      cancelAnimationFrame(raf);
      const from = shown;
      const t0 = performance.now();
      const dur = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 450;
      const step = (now) => {
        const k = dur ? Math.min(1, (now - t0) / dur) : 1;
        const e = 1 - Math.pow(1 - k, 3);
        shown = from + (to - from) * e;
        totalEl.textContent = rub(shown);
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }

    function update() {
      const s = readState(form);
      areaOut.textContent = String(s.area).replace(".", ",") + " м²";
      const p = ((s.area - area.min) / (area.max - area.min)) * 100;
      area.style.setProperty("--p", p + "%");

      const isBalcony = s.type === "balcony";

      const r = compute(s);
      animateTotal(r.total);
      rangeEl.textContent = "Обычно от " + rub(r.total * (1 - PRICES.spread)) + " до " + rub(r.total * (1 + PRICES.spread));
      linesEl.innerHTML = r.lines.map(([l, v]) => `<li><span>${l}</span><b>${rub(v)}</b></li>`).join("");
      daysEl.textContent = r.days + "–" + (r.days + 3) + " " + daysWord(r.days + 3);

      const typeName = isBalcony ? "балкон" : "лоджия";
      const summary = `Расчёт с сайта: ${typeName} ${String(s.area).replace(".", ",")} м², примерно ${rub(r.total)}`;
      window.__estimate = summary;
      const note = document.getElementById("estimateNote");
      const field = document.getElementById("estimateField");
      if (field) field.value = summary + " · " + r.lines.map((l) => l[0]).join(", ");
      if (note && note.dataset.used === "1") note.textContent = summary;
    }

    form.addEventListener("input", update);
    form.addEventListener("change", update);
    form.addEventListener("submit", (e) => e.preventDefault());
    form.querySelectorAll("[data-step]").forEach((b) =>
      b.addEventListener("click", () => {
        const v = Math.max(0, Math.min(20, parseInt(sockets.value, 10) + parseInt(b.dataset.step, 10)));
        sockets.value = v; sockets.textContent = v;
        update();
      })
    );
    sockets.value = sockets.textContent.trim();

    document.getElementById("calcCta").addEventListener("click", () => {
      const note = document.getElementById("estimateNote");
      if (!note) return;
      note.dataset.used = "1";
      note.textContent = window.__estimate;
      note.hidden = false;
    });

    update();
  }

  window.BalconyCalc = { compute, PRICES };
  document.addEventListener("DOMContentLoaded", init);
})();
