(function () {
  const S = window.SITE || {};
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- 1. Данные из config.js ---------- */
  function applyConfig() {
    $$("[data-cfg]").forEach((el) => { const v = S[el.dataset.cfg]; if (v) el.textContent = v; });
    $$("[data-cfg-alt]").forEach((el) => { const v = S[el.dataset.cfgAlt]; if (v) el.alt = v + ", руководитель компании"; });
    const hrefs = {
      tel: S.phoneRaw ? "tel:" + S.phoneRaw : null,
      whatsapp: S.whatsapp ? "https://wa.me/" + S.whatsapp : null,
      telegram: S.telegram ? "https://t.me/" + S.telegram : null,
      avito: S.avito || null
    };
    $$("[data-cfg-href]").forEach((el) => {
      const v = hrefs[el.dataset.cfgHref];
      if (v) el.href = v; else if (el.dataset.cfgHref !== "tel") el.hidden = true;
    });
  }

  /* ---------- 2. Картинки: подставляем, когда файл появился ---------- */
  function loadPlaceholder(fig) {
    const src = fig.dataset.img;
    if (!src) return;
    const probe = new Image();
    probe.onload = () => {
      const img = fig.querySelector("img") || fig.appendChild(document.createElement("img"));
      img.src = src; img.hidden = false; img.loading = "lazy"; img.decoding = "async";
      fig.classList.add("is-loaded");
      if (window.ScrollTrigger) window.ScrollTrigger.refresh();
    };
    probe.src = src;
  }

  function buildGallery() {
    const grid = $("#galleryTrack");
    if (!grid) return;
    const photos = (S.gallery || []).map((item, i) => {
      const file = typeof item === "string" ? item : item.file;
      const caption = typeof item === "string" ? "" : item.caption || "";
      return { src: "assets/img/avito/" + file, caption, alt: caption || "Наша работа, фото " + (i + 1) };
    });
    photos.forEach((ph, i) => {
      const fig = document.createElement("figure");
      fig.className = "ph wg-item";
      fig.setAttribute("role", "listitem");
      fig.dataset.img = ph.src;
      fig.dataset.label = ph.src.split("/").pop();
      const img = document.createElement("img");
      img.alt = ph.alt;
      img.hidden = true;
      fig.appendChild(img);
      if (ph.caption) {
        const fc = document.createElement("figcaption");
        fc.textContent = ph.caption;
        fig.appendChild(fc);
      }
      const open = document.createElement("button");
      open.type = "button";
      open.className = "wg-open";
      open.setAttribute("aria-label", "Открыть крупно: " + ph.alt);
      open.addEventListener("click", () => lightbox(photos, i));
      fig.appendChild(open);
      grid.appendChild(fig);
    });
    // плитка со ссылкой на Авито закрывает сетку
    if (S.avito) {
      const cta = document.createElement("a");
      cta.className = "wg-cta";
      cta.href = S.avito; cta.target = "_blank"; cta.rel = "noopener";
      cta.setAttribute("role", "listitem");
      cta.innerHTML = '<b>Больше работ и отзывы клиентов</b><span>В нашем профиле на Авито: фото объектов, цены и что пишут заказчики.</span><em>Открыть профиль на Авито</em>';
      grid.appendChild(cta);
    }
  }

  /* ---------- просмотр фото крупно ---------- */
  function lightbox(photos, start) {
    const dlg = $(".lightbox");
    if (!dlg || typeof dlg.showModal !== "function") { window.open(photos[start].src, "_blank", "noopener"); return; }
    const img = $(".lb-img", dlg), cap = $(".lb-cap", dlg), count = $(".lb-count", dlg);
    let i = start;
    const show = () => {
      const ph = photos[i];
      img.src = ph.src; img.alt = ph.alt;
      cap.textContent = ph.caption;
      count.textContent = (i + 1) + " / " + photos.length;
    };
    const step = (d) => { i = (i + d + photos.length) % photos.length; show(); };
    if (!dlg.dataset.bound) {
      dlg.dataset.bound = "1";
      $(".lb-prev", dlg).addEventListener("click", () => dlg._step(-1));
      $(".lb-next", dlg).addEventListener("click", () => dlg._step(1));
      $(".lb-close", dlg).addEventListener("click", () => dlg.close());
      dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
      dlg.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight") dlg._step(1);
        if (e.key === "ArrowLeft") dlg._step(-1);
      });
      dlg.addEventListener("close", () => { if (window.__lenis) window.__lenis.start(); });
      let x0 = null; // свайп на телефоне
      dlg.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
      dlg.addEventListener("touchend", (e) => {
        if (x0 === null) return;
        const dx = e.changedTouches[0].clientX - x0;
        if (Math.abs(dx) > 50) dlg._step(dx < 0 ? 1 : -1);
        x0 = null;
      });
    }
    dlg._step = step;
    show();
    if (window.__lenis) window.__lenis.stop();
    dlg.showModal();
  }

  function buildIdeas() {
    const grid = $("#ideasGrid");
    const section = $("#ideas");
    if (!grid || !(S.ideas || []).length) return;
    const cards = S.ideas.map((it) => new Promise((ok) => {
      const img = new Image();
      img.onload = () => ok({ it, img });
      img.onerror = () => ok(null);
      img.src = "assets/img/ideas/" + it.file;
    }));
    Promise.all(cards).then((list) => {
      list.filter(Boolean).forEach(({ it, img }) => {
        const fig = document.createElement("figure");
        fig.className = "idea";
        img.alt = it.title + ": " + it.note;
        img.loading = "lazy";
        img.decoding = "async";
        const cap = document.createElement("figcaption");
        cap.innerHTML = "<b></b><span></span>";
        cap.querySelector("b").textContent = it.title;
        cap.querySelector("span").textContent = it.note;
        const frame = document.createElement("div");
        frame.className = "idea-img";
        frame.appendChild(img);
        fig.append(frame, cap);
        grid.appendChild(fig);
      });
      if (grid.children.length) {
        grid.dataset.count = grid.children.length;
        section.hidden = false;
        if (window.ScrollTrigger) window.ScrollTrigger.refresh();
      }
    });
  }

  function lazyPlaceholders() {
    const figs = $$(".ph[data-img]");
    if (!("IntersectionObserver" in window)) return figs.forEach(loadPlaceholder);
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { loadPlaceholder(e.target); io.unobserve(e.target); } });
    }, { rootMargin: "600px 0px" });
    figs.forEach((f) => (f.classList.contains("ph-hero") ? loadPlaceholder(f) : io.observe(f)));
  }

  /* ---------- 3. Шапка и мобильная панель ---------- */
  function chrome() {
    const header = $(".site-header");
    const bar = $(".mobile-bar");
    const contact = $("#contact");
    let lastY = 0;
    const onScroll = () => {
      const y = window.scrollY;
      header.classList.toggle("is-scrolled", y > 20);
      header.classList.toggle("is-hidden", y > 400 && y > lastY + 4);
      if (y < lastY - 4) header.classList.remove("is-hidden");
      const nearForm = contact && contact.getBoundingClientRect().top < window.innerHeight * 0.6;
      bar && bar.classList.toggle("is-on", y > window.innerHeight * 0.7 && !nearForm);
      lastY = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- 4. Анимации ---------- */
  function heroTemp() {
    const el = $(".js-temp");
    if (!el) return;
    if (reduce) { el.textContent = "+22"; return; }
    const set = (o) => { const v = Math.round(o.t); el.textContent = (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v); };
    // ждём реальную погоду не дольше 1,5 с, иначе стартуем с −18
    const wait = new Promise((ok) => setTimeout(() => ok(null), 1500));
    Promise.race([window.__wx || Promise.resolve(null), wait]).then((w) => {
      const from = w && typeof w.t === "number" ? Math.min(w.t, 21) : -18;
      const o = { t: from };
      set(o);
      if (window.gsap) window.gsap.to(o, { t: 22, duration: 2.2, delay: 0.3, ease: "power2.out", onUpdate: () => set(o) });
      else el.textContent = "+22";
    });
  }

  function motion() {
    const gsap = window.gsap, ST = window.ScrollTrigger;
    if (!gsap || !ST) return;
    gsap.registerPlugin(ST);

    if (!reduce && window.Lenis) {
      const lenis = new window.Lenis({ lerp: 0.12, smoothWheel: true });
      lenis.on("scroll", ST.update);
      gsap.ticker.add((t) => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
      document.querySelectorAll('a[href^="#"]').forEach((a) =>
        a.addEventListener("click", (e) => {
          const id = a.getAttribute("href");
          if (id.length < 2) return;
          const target = document.querySelector(id);
          if (!target) return;
          e.preventDefault();
          lenis.scrollTo(target, { offset: -72 });
        })
      );
      window.__lenis = lenis;
    }

    // Единственная «самостоятельная» анимация: открытие hero
    if (!reduce) {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.from(".hero-title .line", { yPercent: 100, opacity: 0, duration: 0.9, stagger: 0.08 })
        .from(".hero-lead, .hero-cta, .hero-facts", { y: 20, opacity: 0, duration: 0.7, stagger: 0.08 }, "-=0.5")
        .from(".hero-visual .ph-hero", { clipPath: "inset(12% 0 0 0 round 28px)", duration: 1.1 }, 0.1)
        .from(".thermo", { y: 24, opacity: 0, duration: 0.6 }, 0.6);
    }

  }

  /* ---------- 5. До / после ---------- */
  function beforeAfter() {
    const frame = $(".ba-frame");
    if (!frame) return;
    const block = frame.closest(".ba");
    const srcs = $$(".ba-img", frame).map((f) => f.dataset.img);
    Promise.all(srcs.map((src) => new Promise((ok, no) => { const i = new Image(); i.onload = ok; i.onerror = no; i.src = src; })))
      .then(() => { block.hidden = false; if (window.ScrollTrigger) window.ScrollTrigger.refresh(); })
      .catch(() => {});
    const range = $(".ba-range", frame);
    const set = () => frame.style.setProperty("--pos", range.value + "%");
    range.addEventListener("input", set);
    set();
  }

  /* ---------- 7. Форма заявки ---------- */
  function phoneMask(input) {
    const fmt = (digits) => {
      let d = digits.replace(/\D/g, "");
      if (d.startsWith("8")) d = "7" + d.slice(1);
      if (!d.startsWith("7")) d = "7" + d;
      d = d.slice(0, 11);
      const p = [d.slice(1, 4), d.slice(4, 7), d.slice(7, 9), d.slice(9, 11)];
      let out = "+7";
      if (p[0]) out += " (" + p[0];
      if (p[0].length === 3) out += ")";
      if (p[1]) out += " " + p[1];
      if (p[2]) out += "-" + p[2];
      if (p[3]) out += "-" + p[3];
      return { out, len: d.length };
    };
    input.addEventListener("input", () => { const v = input.value; if (v.replace(/\D/g, "").length === 0) return; input.value = fmt(v).out; });
    input.addEventListener("focus", () => { if (!input.value) input.value = "+7 "; });
    input.addEventListener("blur", () => { if (input.value.trim() === "+7") input.value = ""; });
    return () => fmt(input.value).len === 11;
  }

  function leadForm() {
    const form = $("#leadForm");
    if (!form) return;
    const phone = form.elements.phone;
    const valid = phoneMask(phone);
    const err = $(".lf-error", form);
    const done = $(".lf-done", form);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!valid()) {
        phone.setAttribute("aria-invalid", "true"); err.hidden = false; phone.focus();
        return;
      }
      phone.removeAttribute("aria-invalid"); err.hidden = true;
      const data = {
        name: form.elements.name.value.trim(),
        phone: phone.value,
        comment: form.elements.comment.value.trim(),
        estimate: form.elements.estimate.value
      };
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true; btn.textContent = "Отправляем…";

      if (S.formEndpoint) {
        try {
          const r = await fetch(S.formEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(data)
          });
          if (!r.ok) throw new Error(r.status);
          done.hidden = false;
        } catch (_) {
          btn.disabled = false; btn.textContent = "Записаться на замер";
          err.textContent = "Заявка не отправилась. Позвоните нам или напишите в WhatsApp.";
          err.hidden = false;
        }
        return;
      }
      // Без сервера: открываем WhatsApp с готовым текстом
      const text = ["Здравствуйте! Хочу записаться на замер.", data.name && "Имя: " + data.name, "Телефон: " + data.phone, data.comment && "Задача: " + data.comment, data.estimate]
        .filter(Boolean).join("\n");
      done.hidden = false;
      if (S.whatsapp) window.open("https://wa.me/" + S.whatsapp + "?text=" + encodeURIComponent(text), "_blank", "noopener");
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    applyConfig();
    buildGallery();
    buildIdeas();
    lazyPlaceholders();
    chrome();
    beforeAfter();
    leadForm();
    motion();
    heroTemp();
  });
})();
