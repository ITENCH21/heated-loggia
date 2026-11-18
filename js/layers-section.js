// Связка 3D-разреза (js/layers3d.js) со страницей.
// Прокрутка страницы разрез не трогает: посетитель сам нажимает «Разобрать на слои»,
// листает слои стрелками (или клавишами ← →) и жмёт «Собрать», чтобы выйти.
const host = document.getElementById("layers3d");
const list = document.querySelector(".layer-list");
const detail = document.querySelector(".layer-detail");
const labelsBox = document.querySelector(".layers-labels");
const fallback = document.querySelector(".ph-layers");
const ui = document.querySelector(".layers-ui");
const startBtn = document.querySelector(".layers-start");
const nav = document.querySelector(".layers-nav");
const prevBtn = document.querySelector(".ln-prev");
const nextBtn = document.querySelector(".ln-next");
const closeBtn = document.querySelector(".ln-close");
const countEl = document.querySelector(".ln-count");
const nameEl = document.querySelector(".ln-name");
const section = document.getElementById("layers");
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
const groupName = { wall: "Стена", floor: "Пол" };

const viewBox = document.querySelector(".layers-view");
function loadPhoto() {
  const img = fallback.querySelector("img");
  if (!img.src) img.src = img.dataset.src;
}
function showFallback() {
  host.remove();
  labelsBox.remove();
  if (ui) ui.remove();
  if (viewBox) viewBox.remove();
  loadPhoto();
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

  // Активный слой: на что навёл посетитель, иначе выбранный стрелками
  let hoverLayer = null, pickedLayer = null, shownId;
  function render() {
    const layer = hoverLayer || pickedLayer;
    const id = layer ? layer.id : null;
    if (id === shownId) return;
    shownId = id;
    ctl.highlight(id);
    items.forEach((li, k) => li.classList.toggle("is-active", k === id));
    labels.forEach((el, k) => el.classList.toggle("is-active", k === id));
    detail.textContent = layer ? `${layer.name}, ${fmtTemp(layer.temp)}. ${layer.note || ""}` : "";
  }
  const setHover = (layer) => { hoverLayer = layer; render(); };

  try {
    ctl = mod.createLayers3D(host, { autoRotate: !reduce, onLayerChange: setHover });
  } catch (e) {
    console.warn("WebGL недоступен:", e);
    return showFallback();
  }
  const L = ctl.layers;

  // ---------- режим «разобрано» ----------
  let open = false, idx = 0;
  const state = { t: 0 };
  const gsap = window.gsap;

  function animateExplode(to) {
    if (gsap && !reduce) {
      gsap.to(state, { t: to, duration: 1.1, ease: "power2.inOut", overwrite: true, onUpdate: () => ctl.setExplode(state.t) });
    } else {
      state.t = to; ctl.setExplode(to);
    }
  }

  function go(i) {
    idx = (i + L.length) % L.length;
    pickedLayer = L[idx];
    countEl.innerHTML = `<span class="ln-group">${groupName[pickedLayer.group] || ""} · </span>${idx + 1} / ${L.length}`;
    nameEl.textContent = `${shortName(pickedLayer.name)} ${fmtTemp(pickedLayer.temp)}`;
    render();
  }

  function openLayers(at = 0) {
    if (!open) {
      open = true;
      section.classList.add("is-open");
      startBtn.hidden = true;
      nav.hidden = false;
      animateExplode(1);
    }
    go(at);
    nextBtn.focus({ preventScroll: true });
  }

  function closeLayers() {
    if (!open) return;
    open = false;
    section.classList.remove("is-open");
    pickedLayer = null;
    render();
    animateExplode(0);
    nav.hidden = true;
    startBtn.hidden = false;
    startBtn.focus({ preventScroll: true });
  }

  // переключатель «3D-макет / Фото разреза»
  viewBox.hidden = false;
  viewBox.querySelectorAll(".lv-btn").forEach((b) => b.addEventListener("click", () => {
    const photo = b.dataset.view === "photo";
    if (photo) { closeLayers(); loadPhoto(); }
    fallback.hidden = !photo;
    section.classList.toggle("is-photo", photo);
    viewBox.querySelectorAll(".lv-btn").forEach((x) => {
      const on = x === b;
      x.classList.toggle("is-on", on);
      x.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }));

  startBtn.addEventListener("click", () => openLayers(0));
  prevBtn.addEventListener("click", () => go(idx - 1));
  nextBtn.addEventListener("click", () => go(idx + 1));
  closeBtn.addEventListener("click", closeLayers);
  section.addEventListener("keydown", (e) => {
    if (!open) return;
    if (e.key === "ArrowRight") { e.preventDefault(); go(idx + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(idx - 1); }
    else if (e.key === "Escape") { e.preventDefault(); closeLayers(); }
  });

  // ---------- список слоёв слева: наведение подсвечивает, клик открывает слой ----------
  Object.entries(groupName).forEach(([g, title]) => {
    const layers = L.filter((l) => l.group === g);
    if (!layers.length) return;
    const head = document.createElement("li");
    head.className = "group-title";
    head.textContent = title + ", от улицы внутрь";
    list.appendChild(head);
    layers.forEach((l) => {
      const li = document.createElement("li");
      li.tabIndex = 0;
      li.setAttribute("role", "button");
      li.innerHTML = `<i style="--c:${swatchFor(l)}"></i><span>${l.name}</span><b>${fmtTemp(l.temp)}</b>`;
      li.addEventListener("mouseenter", () => setHover(l));
      li.addEventListener("mouseleave", () => setHover(null));
      li.addEventListener("click", () => openLayers(L.indexOf(l)));
      li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openLayers(L.indexOf(l)); } });
      list.appendChild(li);
      items.set(l.id, li);

      const tag = document.createElement("span");
      tag.textContent = shortName(l.name) + "  " + fmtTemp(l.temp);
      labelsBox.appendChild(tag);
      labels.set(l.id, tag);
    });
  });

  // ---------- подпись над активным слоем ----------
  ctl.setExplode(0);
  function placeLabels() {
    labels.forEach((el, id) => {
      const on = id === shownId && state.t > 0.6 && window.innerWidth > 700;
      const p = on && ctl.project(id);
      if (!p || p.visible === false) { el.classList.remove("is-on"); return; }
      el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -150%)`;
      el.classList.add("is-on");
    });
    requestAnimationFrame(placeLabels);
  }
  requestAnimationFrame(placeLabels);

  // ---------- мягко привлекаем внимание к кнопке, когда блок появился на экране ----------
  if ("IntersectionObserver" in window && !reduce) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && !open) {
          startBtn.classList.remove("is-nudge");
          void startBtn.offsetWidth; // перезапуск анимации
          startBtn.classList.add("is-nudge");
        }
      });
    }, { threshold: 0.6 });
    io.observe(host);
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
