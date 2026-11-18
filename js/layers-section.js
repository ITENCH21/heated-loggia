// Связка 3D-разреза (js/layers3d.js) со страницей: список слоёв, подписи, скролл.
const host = document.getElementById("layers3d");
const list = document.querySelector(".layer-list");
const detail = document.querySelector(".layer-detail");
const labelsBox = document.querySelector(".layers-labels");
const fallback = document.querySelector(".ph-layers");
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const SWATCH = {
  "wall-brick": "#D6D3CC", "wall-membrane": "#EEF0EE", "wall-xps": "#F26A1B",
  "wall-penofol": "#C9CED1", "wall-battens": "#D9B88E", "wall-finish": "#E2C29C",
  "floor-slab": "#AEB6B8", "floor-waterproof": "#2E3438", "floor-joists": "#E9772F",
  "floor-board": "#E4E1DA", "floor-heating": "#3A2E2A", "floor-finish": "#B98E63"
};
const swatchFor = (layer) => SWATCH[layer.id] || "#B9C1C2";
const shortName = (name) => name.split(/[:,(]/)[0].replace(/\s+\d.*$/, "").trim();
const fmtTemp = (t) => (typeof t === "number" ? (t > 0 ? "+" : t < 0 ? "−" : "") + Math.abs(Math.round(t)) + "°" : "");

function showFallback() {
  host.remove();
  labelsBox.remove();
  fallback.hidden = false;
}

async function boot() {
  let mod;
  try {
    mod = await import("./layers3d.js");
  } catch (e) {
    console.warn("3D-разрез не загрузился:", e);
    return showFallback();
  }

  let ctl;
  const items = new Map();
  const labels = new Map();

  // Активный слой: то, на что навёл посетитель, иначе слой из «экскурсии» по скроллу
  let userLayer = null, tourLayer = null, shownId;
  function render() {
    const layer = userLayer || tourLayer;
    const id = layer ? layer.id : null;
    if (id === shownId) return;
    shownId = id;
    ctl.highlight(id);
    items.forEach((li, k) => li.classList.toggle("is-active", k === id));
    labels.forEach((el, k) => el.classList.toggle("is-active", k === id));
    detail.textContent = layer ? `${layer.name}. ${layer.note || ""}` : "";
  }
  const setActive = (layer) => { userLayer = layer; render(); };

  try {
    ctl = mod.createLayers3D(host, { autoRotate: !reduce, onLayerChange: setActive });
  } catch (e) {
    console.warn("WebGL недоступен:", e);
    return showFallback();
  }

  // Список слоёв по группам
  const groups = { wall: "Стена", floor: "Пол" };
  Object.entries(groups).forEach(([g, title]) => {
    const layers = ctl.layers.filter((l) => l.group === g);
    if (!layers.length) return;
    const head = document.createElement("li");
    head.className = "group-title";
    head.textContent = title + ", от улицы внутрь";
    list.appendChild(head);
    layers.forEach((l) => {
      const li = document.createElement("li");
      li.tabIndex = 0;
      li.innerHTML = `<i style="--c:${swatchFor(l)}"></i><span>${l.name}</span><b>${fmtTemp(l.temp)}</b>`;
      const on = () => setActive(l);
      const off = () => setActive(null);
      li.addEventListener("mouseenter", on);
      li.addEventListener("focus", on);
      li.addEventListener("mouseleave", off);
      li.addEventListener("blur", off);
      list.appendChild(li);
      items.set(l.id, li);

      const tag = document.createElement("span");
      tag.textContent = shortName(l.name) + (typeof l.temp === "number" ? "  " + fmtTemp(l.temp) : "");
      labelsBox.appendChild(tag);
      labels.set(l.id, tag);
    });
  });

  // Подписи следуют за слоями, видны когда пирог раскрыт
  let explode = reduce ? 1 : 0;
  ctl.setExplode(explode);
  function placeLabels() {
    labels.forEach((el, id) => {
      const on = id === shownId && window.innerWidth > 700;
      const p = on && ctl.project(id);
      if (!p || p.visible === false) { el.classList.remove("is-on"); return; }
      el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -150%)`;
      el.classList.add("is-on");
    });
    requestAnimationFrame(placeLabels);
  }
  requestAnimationFrame(placeLabels);

  // Скролл раскрывает пирог
  const gsap = window.gsap, ST = window.ScrollTrigger;
  if (!reduce && gsap && ST) {
    gsap.registerPlugin(ST);
    const state = { t: 0 };
    const mm = gsap.matchMedia();
    mm.add("(min-width: 1081px)", () => {
      // первая треть скролла раскрывает пирог, дальше слои по очереди подсвечиваются
      const N = ctl.layers.length;
      const tw = gsap.to(state, {
        t: 1, ease: "none",
        onUpdate: () => {
          explode = Math.min(1, state.t / 0.3);
          ctl.setExplode(explode);
          const k = (state.t - 0.36) / 0.6;
          tourLayer = k < 0 || k > 1 ? null : ctl.layers[Math.min(N - 1, Math.floor(k * N))];
          render();
        },
        scrollTrigger: { trigger: ".layers-pin", start: "top top", end: "+=260%", pin: true, scrub: 0.6 }
      });
      return () => { tw.kill(); tourLayer = null; render(); };
    });
    mm.add("(max-width: 1080px)", () => {
      const tw = gsap.to(state, {
        t: 1, ease: "none",
        onUpdate: () => { explode = state.t; ctl.setExplode(explode); },
        scrollTrigger: { trigger: ".layers-stage", start: "top 75%", end: "bottom 35%", scrub: 0.8 }
      });
      return () => tw.kill();
    });
  }
}

// main.js ставит GSAP через defer; модули тоже выполняются после парсинга,
// но ждём DOMContentLoaded, чтобы ScrollTrigger уже был зарегистрирован
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
