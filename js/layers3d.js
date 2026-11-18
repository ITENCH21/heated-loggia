/**
 * layers3d.js — интерактивный 3D-разрез утеплённой лоджии с послойным «взрывом».
 *
 * Требует importmap на странице:
 *   "three":         "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js"
 *   "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
 *
 *   import { createLayers3D } from './js/layers3d.js';
 *   const ctl = createLayers3D(containerEl, { onLayerChange(layer){}, autoRotate: true });
 *   ctl.setExplode(t);      // 0..1
 *   ctl.highlight(id|null);
 *   ctl.layers;             // [{id, group, name, note, temp}]
 *   ctl.project(id);        // {x, y, visible} в пикселях контейнера
 *   ctl.dispose();
 *
 * Доп. опции: onRender(ctl) — вызывается после каждого кадра (удобно двигать HTML-лейблы).
 * Доп. методы: ctl.setAutoRotate(bool), ctl.explode (текущее t).
 * Контейнеру нужна явная высота. Если WebGL2 недоступен — бросается Error с code === 'WEBGL_UNAVAILABLE'.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const DEG = Math.PI / 180;

/* ------------------------------------------------------------------ данные */

// temp — условная температура внутри слоя (°C) при −18 °C на улице и +22 °C в помещении.
const LAYER_DEFS = [
  { id: 'wall-brick',     group: 'wall',  temp: -15, name: 'Парапет: силикатный кирпич 120 мм', note: 'Несущее ограждение лоджии — принимает на себя ветер, дождь и мороз.' },
  { id: 'wall-membrane',  group: 'wall',  temp: -12, name: 'Гидро-ветрозащита',                 note: 'Не пускает влагу и ветер в утеплитель, но выпускает пар наружу.' },
  { id: 'wall-xps',       group: 'wall',  temp: 2,   name: 'Пеноплекс 50 мм',                   note: 'Главный тепловой барьер: здесь температура переходит из минуса в плюс.' },
  { id: 'wall-penofol',   group: 'wall',  temp: 16,  name: 'Пенофол 5 мм, фольгой внутрь',      note: 'Фольга отражает тепло обратно в комнату и работает как пароизоляция.' },
  { id: 'wall-battens',   group: 'wall',  temp: 19,  name: 'Обрешётка: брус 20×40',             note: 'Держит отделку ровной плоскостью и оставляет вентзазор у фольги.' },
  { id: 'wall-finish',    group: 'wall',  temp: 21,  name: 'Вагонка / панели',                  note: 'Финишная отделка из тёплого дерева — то, что вы видите в готовой лоджии.' },
  { id: 'floor-slab',     group: 'floor', temp: -15, name: 'Бетонная плита 150 мм',             note: 'Основание лоджии; перед утеплением её выравнивают и обеспыливают.' },
  { id: 'floor-waterproof', group: 'floor', temp: -12, name: 'Гидроизоляция',                   note: 'Отсекает влагу плиты, чтобы лаги и утеплитель оставались сухими.' },
  { id: 'floor-joists',   group: 'floor', temp: 2,   name: 'Лаги + пеноплекс 50 мм',            note: 'Лаги задают уровень пола, пеноплекс между ними держит тепло.' },
  { id: 'floor-board',    group: 'floor', temp: 18,  name: 'ГВЛ / фанера 12 мм',                note: 'Жёсткое основание: распределяет нагрузку под тёплый пол и покрытие.' },
  { id: 'floor-heating',  group: 'floor', temp: 28,  name: 'Плёночный тёплый пол',              note: 'Тонкие нагревательные полосы дают ровное тепло по всей площади пола.' },
  { id: 'floor-finish',   group: 'floor', temp: 24,  name: 'Ламинат / кварцвинил',              note: 'Износостойкое финишное покрытие, совместимое с тёплым полом.' },
];

// Геометрия, метры. Тонкие слои слегка утрированы, чтобы читались.
const G = {
  W: 1.0,            // ширина фрагмента по X
  H: 0.95,           // высота стены над плитой
  D: 1.06,           // глубина пола по Z (от наружной грани парапета)
  SX: 0.065,         // ступенька среза по X на каждый слой
  SY: 0.04,          // ступенька верха стены
  SZ: 0.045,         // ступенька переднего края пола
  wall:  [0.12, 0.008, 0.05, 0.012, 0.022, 0.016],
  floor: [0.15, 0.008, 0.05, 0.012, 0.006, 0.011],
  EW: 0.072,         // разнос слоёв стены по Z
  EF: 0.066,         // разнос слоёв пола по Y
  GAP: 0.06,         // доп. отъезд пола от стены при разносе
};

const COLORS = {
  ink: 0x17212b,
  accent: 0xf26a1b,
  glow: 0xfff1e6,
};

const MAX_YAW = 25 * DEG;
const BASE_AZ = 38 * DEG;
const BASE_EL = 23 * DEG;
const FIT = 0.74;
const DIM_OPACITY = 0.18;
const CATCHER_OPACITY = 0.14;

/* ------------------------------------------------------------- утилиты */

function rng(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);

function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function noise(g, w, h, amp, R) {
  const d = g.getImageData(0, 0, w, h); const a = d.data;
  for (let i = 0; i < a.length; i += 4) {
    const n = (R() - 0.5) * amp;
    a[i] += n; a[i + 1] += n; a[i + 2] += n;
  }
  g.putImageData(d, 0, 0);
}
// рисует фигуру с повтором через края — для бесшовности
function wrapped(w, h, x, y, r, fn) {
  for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {
    if (x + dx + r < 0 || x + dx - r > w || y + dy + r < 0 || y + dy - r > h) continue;
    fn(x + dx, y + dy);
  }
}
function dots(g, S, n, rMin, rMax, colorFn, R) {
  for (let i = 0; i < n; i++) {
    const x = R() * S, y = R() * S, r = rMin + R() * (rMax - rMin);
    g.fillStyle = colorFn(R);
    wrapped(S, S, x, y, r, (px, py) => { g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill(); });
  }
}
// волнистые линии волокон, бесшовные по длине (целое число периодов)
function grainLines(g, W, H, n, horizontal, colorFn, R) {
  const L = horizontal ? W : H, A = horizontal ? H : W;
  for (let i = 0; i < n; i++) {
    const base = R() * A, a1 = 1 + R() * 4, f1 = 1 + Math.floor(R() * 3), p1 = R() * 6.28;
    const a2 = R() * 1.5, f2 = 3 + Math.floor(R() * 5), p2 = R() * 6.28;
    g.strokeStyle = colorFn(R); g.lineWidth = 0.6 + R() * 1.8;
    g.beginPath();
    for (let s = 0; s <= L; s += 8) {
      const o = base + a1 * Math.sin((s / L) * f1 * 6.283 + p1) + a2 * Math.sin((s / L) * f2 * 6.283 + p2);
      if (horizontal) (s ? g.lineTo(s, o) : g.moveTo(s, o));
      else (s ? g.lineTo(o, s) : g.moveTo(o, s));
    }
    g.stroke();
  }
}

/* -------------------------------------------------- процедурные текстуры */

function makeTextures(maxAniso) {
  const list = [];
  const R = rng(20261118);
  const tex = (canvas, tw, th, srgb = true) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / tw, 1 / th);
    t.anisotropy = maxAniso;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    list.push(t);
    return t;
  };
  const T = {};

  // Силикатный кирпич: 250×65 + швы 10 мм, ложковая перевязка. Тайл 0.52 × 0.30 м.
  {
    const S = 512; const [c, g] = cv(S, S); const [b, bg] = cv(S, S);
    g.fillStyle = '#B9BDBA'; g.fillRect(0, 0, S, S);
    bg.fillStyle = '#404040'; bg.fillRect(0, 0, S, S);
    const rows = 4, ch = S / rows, per = 2, bw = S / per, jx = 12, jy = 16;
    const tones = ['#DEDCD5', '#D6D4CC', '#E3E1DA', '#D2D1CA', '#DAD9D3', '#E0DDD4', '#CFCFC9', '#D8D6CE'];
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * bw / 2;
      for (let k = -1; k <= per; k++) {
        const idx = ((k % per) + per) % per;
        const x = k * bw + off + jx / 2, y = r * ch + jy / 2, w = bw - jx, h = ch - jy;
        g.fillStyle = tones[(r * per + idx) % tones.length]; g.fillRect(x, y, w, h);
        g.fillStyle = 'rgba(40,50,60,0.06)'; g.fillRect(x, y + h - 6, w, 6);
        g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(x, y, w, 3);
        bg.fillStyle = '#D0D0D0'; bg.fillRect(x, y, w, h);
      }
    }
    dots(g, S, 900, 0.5, 1.6, (R) => R() < 0.5 ? 'rgba(90,100,110,0.18)' : 'rgba(255,255,255,0.2)', R);
    noise(g, S, S, 14, R); noise(bg, S, S, 40, R);
    T.brick = tex(c, 0.52, 0.30); T.brickBump = tex(b, 0.52, 0.30, false);
  }

  // Бетон: холодный серый с заполнителем и порами. Тайл 0.8 м.
  {
    const S = 512; const [c, g] = cv(S, S);
    g.fillStyle = '#B9C1C2'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 26; i++) {
      const x = R() * S, y = R() * S, r = 40 + R() * 110;
      wrapped(S, S, x, y, r, (px, py) => {
        const gr = g.createRadialGradient(px, py, 0, px, py, r);
        const dark = R() < 0.5;
        gr.addColorStop(0, dark ? 'rgba(70,80,88,0.07)' : 'rgba(255,255,255,0.08)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(px - r, py - r, r * 2, r * 2);
      });
    }
    dots(g, S, 1500, 0.6, 2.6, (R) => R() < 0.55 ? 'rgba(95,105,112,0.22)' : 'rgba(235,240,240,0.25)', R);
    dots(g, S, 260, 0.5, 1.4, () => 'rgba(45,52,58,0.45)', R);
    noise(g, S, S, 16, R);
    T.concrete = tex(c, 0.8, 0.8);
  }

  // Пеноплекс: оранжевый с ячеистым зерном. Тайл 0.25 м.
  {
    const S = 512; const [c, g] = cv(S, S);
    g.fillStyle = '#E9772F'; g.fillRect(0, 0, S, S);
    dots(g, S, 7000, 0.8, 2.4, (R) => R() < 0.5 ? 'rgba(255,214,170,0.10)' : 'rgba(150,60,10,0.08)', R);
    noise(g, S, S, 12, R);
    T.xps = tex(c, 0.25, 0.25);
  }

  // Мембрана ветрозащиты: светлое холодное полотно с печатью стального цвета. Тайл 0.25 м.
  {
    const S = 512; const [c, g] = cv(S, S);
    g.fillStyle = '#E4E8E8'; g.fillRect(0, 0, S, S);
    g.fillStyle = 'rgba(23,33,43,0.035)';
    for (let i = 0; i < S; i += 3) { g.fillRect(i, 0, 1, S); g.fillRect(0, i, S, 1); }
    g.fillStyle = 'rgba(93,107,120,0.38)';
    for (let y = 60; y < S; y += 256) for (let x = 0; x < S; x += 32) g.fillRect(x, y, 18, 4);
    noise(g, S, S, 6, R);
    T.membrane = tex(c, 0.25, 0.25);
  }

  // Вспененный полиэтилен (бока пенофола). Тайл 0.1 м.
  {
    const S = 256; const [c, g] = cv(S, S);
    g.fillStyle = '#EEF0EE'; g.fillRect(0, 0, S, S);
    dots(g, S, 900, 0.8, 2.2, () => 'rgba(120,130,135,0.08)', R);
    noise(g, S, S, 10, R);
    T.foam = tex(c, 0.1, 0.1);
  }

  // Фольга: «мятая» карта рельефа из случайных граней. Тайл 0.35 м.
  {
    const S = 512; const [c, g] = cv(S, S);
    g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 420; i++) {
      const x = R() * S, y = R() * S, s = 20 + R() * 70, v = 100 + Math.floor(R() * 60);
      g.fillStyle = `rgba(${v},${v},${v},0.55)`;
      wrapped(S, S, x, y, s, (px, py) => {
        g.beginPath(); g.moveTo(px, py);
        g.lineTo(px + (R() - 0.5) * s * 2, py + (R() - 0.5) * s * 2);
        g.lineTo(px + (R() - 0.5) * s * 2, py + (R() - 0.5) * s * 2);
        g.closePath(); g.fill();
      });
    }
    noise(g, S, S, 8, R);
    T.foilBump = tex(c, 0.35, 0.35, false);
  }

  // Сосна (брус, лаги): волокна вдоль длины. Тайл 0.9 × 0.12 м.
  {
    const W = 1024, H = 128; const [c, g] = cv(W, H);
    g.fillStyle = '#E2C29C'; g.fillRect(0, 0, W, H);
    grainLines(g, W, H, 34, true, (R) => `rgba(160,110,60,${0.08 + R() * 0.18})`, R);
    noise(g, W, H, 10, R);
    T.pine = tex(c, 0.9, 0.12);
  }

  // Вагонка: вертикальные доски 90 мм со шпунтом. Тайл 0.36 × 1.2 м.
  {
    const W = 512, H = 1024; const [c, g] = cv(W, H); const [b, bg] = cv(W, H);
    const tones = ['#E2C29C', '#DDBB93', '#E6C8A4', '#D9B78E'];
    bg.fillStyle = '#C8C8C8'; bg.fillRect(0, 0, W, H);
    const bwPx = W / 4;
    for (let k = 0; k < 4; k++) {
      const x0 = k * bwPx;
      g.fillStyle = tones[k]; g.fillRect(x0, 0, bwPx, H);
      g.save(); g.beginPath(); g.rect(x0, 0, bwPx, H); g.clip();
      g.translate(x0, 0);
      grainLines(g, bwPx, H, 14, false, (R) => `rgba(170,115,60,${0.06 + R() * 0.16})`, R);
      g.restore();
      g.fillStyle = 'rgba(80,50,25,0.55)'; g.fillRect(x0, 0, 3, H);
      g.fillStyle = 'rgba(255,240,220,0.35)'; g.fillRect(x0 + 3, 0, 2, H);
      bg.fillStyle = '#303030'; bg.fillRect(x0, 0, 4, H);
      bg.fillStyle = '#A0A0A0'; bg.fillRect(x0 + 4, 0, 3, H);
    }
    noise(g, W, H, 8, R); noise(bg, W, H, 10, R);
    T.lining = tex(c, 0.36, 1.2); T.liningBump = tex(b, 0.36, 1.2, false);
  }

  // ГВЛ: светлый холодный лист с волокнами. Тайл 0.5 м.
  {
    const S = 512; const [c, g] = cv(S, S);
    g.fillStyle = '#D9DCD7'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 3200; i++) {
      const x = R() * S, y = R() * S, a = R() * Math.PI, l = 2 + R() * 6;
      g.strokeStyle = `rgba(110,118,120,${0.05 + R() * 0.06})`; g.lineWidth = 0.7;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    noise(g, S, S, 8, R);
    T.board = tex(c, 0.5, 0.5);
  }

  // Гидроизоляция пола: тёмная битумная мембрана с посыпкой. Тайл 0.3 м.
  {
    const S = 512; const [c, g] = cv(S, S);
    g.fillStyle = '#2C343B'; g.fillRect(0, 0, S, S);
    dots(g, S, 2600, 0.5, 1.5, (R) => `rgba(170,180,185,${0.1 + R() * 0.12})`, R);
    noise(g, S, S, 10, R);
    T.waterproof = tex(c, 0.3, 0.3);
  }

  // Плёночный тёплый пол: тёмная плёнка, медные шины, оранжевые нагревательные полосы.
  // Тайл 0.6 (X) × 0.5 (Z) м.
  {
    const S = 512; const [c, g] = cv(S, S);
    g.fillStyle = '#262D33'; g.fillRect(0, 0, S, S);
    const period = S / 5, sw = period * 0.6;
    for (let i = 0; i < 5; i++) {
      const x = i * period + (period - sw) / 2;
      g.fillStyle = '#D9622A'; g.fillRect(x, 44, sw, S - 88);
      g.fillStyle = 'rgba(255,190,140,0.12)';
      for (let y = 48; y < S - 44; y += 7) g.fillRect(x, y, sw, 2);
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x, 44, 2, S - 88); g.fillRect(x + sw - 2, 44, 2, S - 88);
    }
    g.fillStyle = '#C17F4A'; g.fillRect(0, 26, S, 12); g.fillRect(0, S - 38, S, 12);
    g.fillStyle = 'rgba(255,220,180,0.35)'; g.fillRect(0, 27, S, 2); g.fillRect(0, S - 37, S, 2);
    noise(g, S, S, 6, R);
    T.heating = tex(c, 0.6, 0.5);
  }

  // Ламинат: тёплый дуб, доски 0.6 × 0.2 м со смещением стыков. Тайл 1.2 × 0.8 м.
  {
    const W = 1024, H = 512; const [c, g] = cv(W, H); const [b, bg] = cv(W, H);
    bg.fillStyle = '#C8C8C8'; bg.fillRect(0, 0, W, H);
    const rows = 4, rh = H / rows, pl = W / 2;
    const offs = [0, 0.33, 0.66, 0.17];
    const tones = ['#B5845A', '#AC7B52', '#BC8C61', '#A8774F', '#B38258', '#AE7E55', '#B98A5E', '#A6754C'];
    for (let r = 0; r < rows; r++) {
      const y0 = r * rh, off = offs[r] * pl;
      for (let k = -1; k <= 2; k++) {
        const idx = ((k % 2) + 2) % 2;
        const x0 = k * pl + off;
        g.fillStyle = tones[(r * 2 + idx) % tones.length]; g.fillRect(x0, y0, pl, rh);
        g.fillStyle = 'rgba(60,35,15,0.6)'; g.fillRect(x0, y0, 2, rh);
        bg.fillStyle = '#404040'; bg.fillRect(x0, y0, 3, rh);
      }
      g.save(); g.beginPath(); g.rect(0, y0, W, rh); g.clip(); g.translate(0, y0);
      grainLines(g, W, rh, 18, true, (R) => `rgba(95,60,30,${0.06 + R() * 0.14})`, R);
      g.restore();
      g.fillStyle = 'rgba(55,32,15,0.6)'; g.fillRect(0, y0, W, 2);
      bg.fillStyle = '#404040'; bg.fillRect(0, y0, W, 3);
    }
    noise(g, W, H, 8, R); noise(bg, W, H, 6, R);
    T.laminate = tex(c, 1.2, 0.8); T.laminateBump = tex(b, 1.2, 0.8, false);
  }

  return { T, list };
}

/* ------------------------------------------------------------ материалы */

function makeMaterialFactory(T) {
  const common = {
    transparent: true, opacity: 1,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    emissive: COLORS.glow, emissiveIntensity: 0,
  };
  const std = (p) => new THREE.MeshStandardMaterial({ ...common, ...p });
  const phys = (p) => new THREE.MeshPhysicalMaterial({ ...common, ...p });
  return {
    brick: () => std({ map: T.brick, bumpMap: T.brickBump, bumpScale: 2, roughness: 0.92 }),
    concrete: () => std({ map: T.concrete, roughness: 0.95 }),
    membrane: () => std({ map: T.membrane, roughness: 0.7 }),
    xps: () => std({ map: T.xps, roughness: 0.85 }),
    foam: () => std({ map: T.foam, roughness: 0.9 }),
    foil: () => phys({ color: 0xf1f3f4, metalness: 1, roughness: 0.2, envMapIntensity: 3.4, bumpMap: T.foilBump, bumpScale: 1.6 }),
    pine: () => std({ map: T.pine, roughness: 0.78 }),
    lining: () => std({ map: T.lining, bumpMap: T.liningBump, bumpScale: 1.4, roughness: 0.68 }),
    board: () => std({ map: T.board, roughness: 0.95 }),
    waterproof: () => std({ map: T.waterproof, roughness: 0.75 }),
    heating: () => phys({ map: T.heating, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.35 }),
    laminate: () => phys({ map: T.laminate, bumpMap: T.laminateBump, bumpScale: 1.2, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.5 }),
  };
}

// Box с UV в метрах (мировая плотность текстуры одинакова на всех гранях).
function boxGeo(x0, x1, y0, y1, z0, z1) {
  const w = x1 - x0, h = y1 - y0, d = z1 - z0;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + cx, y = p.getY(i) + cy, z = p.getZ(i) + cz;
    if (Math.abs(n.getX(i)) > 0.5) uv.setXY(i, z, y);
    else if (Math.abs(n.getY(i)) > 0.5) uv.setXY(i, x, z);
    else uv.setXY(i, x, y);
  }
  uv.needsUpdate = true;
  return { geo: g, center: new THREE.Vector3(cx, cy, cz) };
}

/* -------------------------------------------------------------- модель */

function buildModel(mf) {
  const model = new THREE.Group();
  const layers = [];
  const X0 = -G.W / 2;
  const xmax = (i) => G.W / 2 - i * G.SX;

  const zWall = [0];
  for (let i = 0; i < G.wall.length; i++) zWall.push(zWall[i] + G.wall[i]);
  const zIn = zWall[G.wall.length];
  const yFloor = [0];
  for (let j = 1; j < G.floor.length; j++) yFloor.push(yFloor[j - 1] + G.floor[j]);
  const floorTop = yFloor[yFloor.length - 1];

  function makeLayer(def, index) {
    const root = new THREE.Group();
    model.add(root);
    const lineMat = new THREE.LineBasicMaterial({ color: COLORS.ink, transparent: true, opacity: 0.22, depthWrite: false });
    const L = {
      ...def, index, root, meshes: [], mats: new Set(), lineMat,
      anchor: new THREE.Vector3(), offset: new THREE.Vector3(),
      cur: 1, glow: 0,
    };
    layers.push(L);
    return L;
  }
  function piece(L, mat, x0, x1, y0, y1, z0, z1) {
    const { geo, center } = boxGeo(x0, x1, y0, y1, z0, z1);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(center);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData.layerId = L.id;
    (Array.isArray(mat) ? mat : [mat]).forEach((m) => L.mats.add(m));
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), L.lineMat);
    edges.raycast = () => {};
    mesh.add(edges);
    L.root.add(mesh);
    L.meshes.push(mesh);
    return mesh;
  }

  const defs = Object.fromEntries(LAYER_DEFS.map((d) => [d.id, d]));

  /* стена: от улицы (z=0) внутрь (+z) */
  const wallIds = ['wall-brick', 'wall-membrane', 'wall-xps', 'wall-penofol', 'wall-battens', 'wall-finish'];
  wallIds.forEach((id, i) => {
    const L = makeLayer(defs[id], i);
    const x1 = xmax(i), top = G.H - i * G.SY, z0 = zWall[i], z1 = zWall[i + 1];
    if (id === 'wall-brick') piece(L, mf.brick(), X0, x1, 0, top, z0, z1);
    else if (id === 'wall-membrane') piece(L, mf.membrane(), X0, x1, 0, top, z0, z1);
    else if (id === 'wall-xps') piece(L, mf.xps(), X0, x1, 0, top, z0, z1);
    else if (id === 'wall-penofol') {
      const foam = mf.foam(), foil = mf.foil();
      // порядок граней BoxGeometry: +x, -x, +y, -y, +z, -z → фольга смотрит внутрь (+z)
      piece(L, [foam, foam, foam, foam, foil, foam], X0, x1, 0, top, z0, z1);
    } else if (id === 'wall-battens') {
      const m = mf.pine();
      for (const y of [0.04, 0.27, 0.5, 0.73]) if (y + 0.04 <= top) piece(L, m, X0, x1, y, y + 0.04, z0, z1);
    } else if (id === 'wall-finish') piece(L, mf.lining(), X0, x1, 0, top, z0, z1);
    L.anchor.set(x1, (Math.max(floorTop, 0) + top) / 2 + 0.05, (z0 + z1) / 2);
    L.offset.set(0, 0, i * G.EW);
  });

  /* пол: от плиты вверх */
  const floorIds = ['floor-slab', 'floor-waterproof', 'floor-joists', 'floor-board', 'floor-heating', 'floor-finish'];
  const floorShiftZ = (wallIds.length - 1) * G.EW + G.GAP;
  floorIds.forEach((id, j) => {
    const L = makeLayer(defs[id], j);
    const x1 = xmax(j);
    if (id === 'floor-slab') {
      piece(L, mf.concrete(), X0, x1, -G.floor[0], 0, -0.03, G.D);
      L.anchor.set(x1, -G.floor[0] / 2, (zIn + G.D) / 2);
      return;
    }
    const y0 = yFloor[j - 1], y1 = yFloor[j], z1 = G.D - j * G.SZ;
    if (id === 'floor-waterproof') piece(L, mf.waterproof(), X0, x1, y0, y1, zIn, z1);
    else if (id === 'floor-joists') {
      const wood = mf.pine(), xps = mf.xps();
      const lw = 0.04; let z = zIn;
      for (let c = zIn + 0.06; c + lw / 2 < z1 - 0.03; c += 0.3) {
        if (c - lw / 2 > z) piece(L, xps, X0, x1, y0, y1 - 0.002, z, c - lw / 2);
        piece(L, wood, X0, x1, y0, y1, c - lw / 2, c + lw / 2);
        z = c + lw / 2;
      }
      if (z < z1) piece(L, xps, X0, x1, y0, y1 - 0.002, z, z1);
    } else if (id === 'floor-board') piece(L, mf.board(), X0, x1, y0, y1, zIn, z1);
    else if (id === 'floor-heating') piece(L, mf.heating(), X0, x1, y0, y1, zIn, z1);
    else if (id === 'floor-finish') piece(L, mf.laminate(), X0, x1, y0, y1, zIn, z1);
    L.anchor.set(x1, (y0 + y1) / 2, (zIn + z1) / 2);
    L.offset.set(0, j * G.EF, floorShiftZ);
  });

  // порядок слоёв как в LAYER_DEFS
  layers.sort((a, b) => LAYER_DEFS.findIndex((d) => d.id === a.id) - LAYER_DEFS.findIndex((d) => d.id === b.id));
  return { model, layers };
}

/* ------------------------------------------------------------- WebGL */

function webglError(cause) {
  const err = new Error('Layers3D: WebGL2 недоступен в этом браузере или на устройстве — покажите статичную картинку-фолбэк.');
  err.name = 'WebGLUnavailableError';
  err.code = 'WEBGL_UNAVAILABLE';
  if (cause) err.cause = cause;
  return err;
}
function assertWebGL2() {
  let ok = false;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    ok = !!gl;
    if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch (e) { ok = false; }
  if (!ok) throw webglError();
}

/* ---------------------------------------------------------------- API */

export function createLayers3D(container, options = {}) {
  if (!(container instanceof HTMLElement)) throw new TypeError('createLayers3D: первым аргументом нужен DOM-элемент контейнера.');
  assertWebGL2();
  const opts = { autoRotate: true, onLayerChange: null, onRender: null, ...options };

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) { throw webglError(e); }

  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.86;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const el = renderer.domElement;
  Object.assign(el.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', touchAction: 'pan-y', outline: 'none' });
  el.setAttribute('aria-hidden', 'true');
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  container.appendChild(el);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  const envRT = pmrem.fromScene(roomEnv, 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.5;
  roomEnv.dispose?.();

  const { T, list: textures } = makeTextures(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
  const { model, layers } = buildModel(makeMaterialFactory(T));
  scene.add(model);
  const byId = new Map(layers.map((L) => [L.id, L]));
  const pickables = layers.flatMap((L) => L.meshes);
  const publicLayers = Object.freeze(LAYER_DEFS.map((d) => Object.freeze({ id: d.id, group: d.group, name: d.name, note: d.note, temp: d.temp })));
  const publicById = new Map(publicLayers.map((p) => [p.id, p]));

  // границы для подгонки камеры: собранное и разнесённое состояние
  const boundsAt = (t) => {
    layers.forEach((L) => L.root.position.copy(L.offset).multiplyScalar(t));
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    return { center: sphere.center.clone(), radius: sphere.radius, box };
  };
  const b1 = boundsAt(1), b0 = boundsAt(0);

  // свет
  const hemi = new THREE.HemisphereLight(0xf4f7f8, 0xb7aea2, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4e8, 2.3);
  const sunTarget = new THREE.Object3D();
  sunTarget.position.copy(b1.center);
  scene.add(sunTarget);
  sun.target = sunTarget;
  sun.position.copy(b1.center).add(new THREE.Vector3(2.6, 3.6, 1.6));
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -1.4, right: 1.4, top: 1.4, bottom: -1.4, near: 0.5, far: 9 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.012;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xdfe8f0, 0.5);
  fill.position.copy(b1.center).add(new THREE.Vector3(-3, 1.5, 2));
  scene.add(fill);

  // мягкая тень «макета на столе» поверх фона сайта
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ color: COLORS.ink, opacity: CATCHER_OPACITY }));
  catcher.rotation.x = -Math.PI / 2;
  catcher.position.y = -G.floor[0] - 0.001;
  catcher.receiveShadow = true;
  catcher.raycast = () => {};
  scene.add(catcher);

  const camera = new THREE.PerspectiveCamera(26, 1, 0.05, 50);
  const target = new THREE.Vector3();

  /* состояние */
  let width = container.clientWidth || 1, height = container.clientHeight || 1;
  let explodeT = 0;
  let highlightId = null, hoverId = null;
  let yaw = 0, pitch = 0, userYaw = 0, userPitch = 0;
  let clock = 0, last = 0, raf = 0, inView = true, disposed = false;
  let autoRotate = !!opts.autoRotate;
  const mqReduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let reduced = !!(mqReduce && mqReduce.matches);
  const autoActive = () => autoRotate && !reduced;

  function applyExplode() {
    const e = ease(explodeT);
    for (const L of layers) L.root.position.copy(L.offset).multiplyScalar(e);
  }
  function placeCamera() {
    const e = ease(explodeT);
    target.lerpVectors(b0.center, b1.center, e);
    const r = lerp(b0.radius, b1.radius, e);
    const vf = camera.fov * DEG;
    const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
    let dist = (r / Math.sin(Math.min(vf, hf) / 2)) * FIT;
    if (width < 700) dist *= 1.22;
    const az = BASE_AZ + yaw, el2 = BASE_EL + pitch;
    camera.position.set(
      target.x + dist * Math.cos(el2) * Math.sin(az),
      target.y + dist * Math.sin(el2),
      target.z + dist * Math.cos(el2) * Math.cos(az),
    );
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }

  const accent = new THREE.Color(COLORS.accent), ink = new THREE.Color(COLORS.ink);
  function applyLayerLook(L) {
    const o = L.cur;
    for (const m of L.mats) {
      m.opacity = o;
      m.depthWrite = o > 0.95;
      m.emissiveIntensity = L.glow * 0.07;
    }
    L.lineMat.opacity = lerp(0.22, 0.85, L.glow) * Math.max(o, 0.35);
    L.lineMat.color.copy(ink).lerp(accent, L.glow);
    const cast = o > 0.6;
    for (const mesh of L.meshes) mesh.castShadow = cast;
  }

  function update(dt) {
    let moving = false;
    const k = 1 - Math.exp(-dt * 6);
    if (autoActive()) clock += dt;
    const sway = autoActive() ? Math.sin(clock * (2 * Math.PI / 18)) * 9 * DEG : 0;
    const tYaw = clamp(userYaw + sway, -MAX_YAW, MAX_YAW);
    yaw += (tYaw - yaw) * k;
    pitch += (userPitch - pitch) * k;
    if (Math.abs(tYaw - yaw) > 1e-4 || Math.abs(userPitch - pitch) > 1e-4) moving = true;

    const kh = 1 - Math.exp(-dt * 10);
    for (const L of layers) {
      const tOp = highlightId == null || highlightId === L.id ? 1 : DIM_OPACITY;
      const tGlow = highlightId === L.id ? 1 : 0;
      if (Math.abs(tOp - L.cur) > 0.002 || Math.abs(tGlow - L.glow) > 0.002) {
        L.cur += (tOp - L.cur) * kh; L.glow += (tGlow - L.glow) * kh;
        moving = true;
      } else { L.cur = tOp; L.glow = tGlow; }
      applyLayerLook(L);
    }
    // тень на «столе» гаснет, пока слой подсвечен (иначе она просвечивает сквозь призрачные слои)
    const tShadow = highlightId == null ? CATCHER_OPACITY : 0;
    const cm = catcher.material;
    if (Math.abs(tShadow - cm.opacity) > 0.001) { cm.opacity += (tShadow - cm.opacity) * kh; moving = true; }
    else cm.opacity = tShadow;
    placeCamera();
    return moving;
  }

  function tick(now) {
    raf = 0;
    if (disposed) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    const moving = update(dt);
    renderer.render(scene, camera);
    if (opts.onRender) { try { opts.onRender(api); } catch (e) { console.error(e); } }
    if ((moving || autoActive()) && inView) raf = requestAnimationFrame(tick);
  }
  function requestRender() {
    if (disposed || raf || !inView) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  /* размеры и видимость */
  function resize() {
    width = container.clientWidth; height = container.clientHeight;
    if (!width || !height) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    placeCamera();
    requestRender();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  const io = new IntersectionObserver((entries) => {
    inView = entries[entries.length - 1].isIntersecting;
    if (inView) requestRender();
    else if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }, { rootMargin: '80px' });
  io.observe(container);
  const onReduce = () => { reduced = !!mqReduce.matches; requestRender(); };
  mqReduce?.addEventListener?.('change', onReduce);

  /* указатель */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function toNdc(e) {
    const r = el.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    return r;
  }
  function pick() {
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    return hit ? hit.object.userData.layerId : null;
  }
  function setHover(id) {
    if (id === hoverId) return;
    hoverId = id;
    highlightId = id;
    el.style.cursor = id ? 'pointer' : '';
    requestRender();
    if (opts.onLayerChange) { try { opts.onLayerChange(id ? publicById.get(id) : null); } catch (e) { console.error(e); } }
  }
  let touch = null;
  function onMove(e) {
    if (e.pointerType === 'touch') {
      if (!touch || touch.id !== e.pointerId) return;
      const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
      if (!touch.drag && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) touch.drag = true;
      if (touch.drag) {
        userYaw = clamp(touch.yaw - (dx / Math.max(width, 1)) * 70 * DEG, -MAX_YAW, MAX_YAW);
        requestRender();
      }
      return;
    }
    toNdc(e);
    userYaw = clamp(ndc.x * MAX_YAW, -MAX_YAW, MAX_YAW);
    userPitch = ndc.y * 4 * DEG;
    setHover(pick());
    requestRender();
  }
  function onLeave(e) {
    if (e.pointerType === 'touch') return;
    userYaw = 0; userPitch = 0;
    setHover(null);
    requestRender();
  }
  function onDown(e) {
    if (e.pointerType !== 'touch') return;
    touch = { id: e.pointerId, x: e.clientX, y: e.clientY, yaw: userYaw, drag: false };
  }
  function onUp(e) {
    if (e.pointerType !== 'touch' || !touch || touch.id !== e.pointerId) return;
    if (!touch.drag) {
      toNdc(e);
      const id = pick();
      setHover(id && id === hoverId ? null : id);
    }
    touch = null;
  }
  function onCancel() { touch = null; }
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerleave', onLeave);
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onCancel);

  /* публичные методы */
  const v3 = new THREE.Vector3();
  const api = {
    get layers() { return publicLayers; },
    get explode() { return explodeT; },
    setExplode(t) {
      const n = clamp(Number(t) || 0, 0, 1);
      if (n === explodeT) return;
      explodeT = n;
      applyExplode();
      placeCamera();
      requestRender();
    },
    highlight(id) {
      const next = id != null && byId.has(id) ? id : null;
      if (id != null && !byId.has(id)) console.warn(`Layers3D: неизвестный слой "${id}"`);
      hoverId = next;
      if (next === highlightId) return;
      highlightId = next;
      requestRender();
    },
    project(id) {
      const L = byId.get(id);
      if (!L) return null;
      v3.copy(L.anchor).add(L.root.position).project(camera);
      return {
        x: ((v3.x + 1) / 2) * width,
        y: ((1 - v3.y) / 2) * height,
        visible: v3.z < 1 && Math.abs(v3.x) <= 1 && Math.abs(v3.y) <= 1,
      };
    },
    setAutoRotate(on) { autoRotate = !!on; requestRender(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect();
      mqReduce?.removeEventListener?.('change', onReduce);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
      const mats = new Set();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m));
      });
      mats.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      envRT.dispose(); pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      el.remove();
    },
  };

  applyExplode();
  resize();
  placeCamera();
  requestRender();
  return api;
}

export default createLayers3D;
