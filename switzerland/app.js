// Interactive canton map. Stories live in entries/<code>.md; geometry in map-data.js.
(function () {
  "use strict";

  const CANTONS = [
    ["ZH", "Zürich", "Zürich"],
    ["BE", "Bern", "Bern"],
    ["LU", "Luzern", "Luzern"],
    ["UR", "Uri", "Altdorf"],
    ["SZ", "Schwyz", "Schwyz"],
    ["OW", "Obwalden", "Sarnen"],
    ["NW", "Nidwalden", "Stans"],
    ["GL", "Glarus", "Glarus"],
    ["ZG", "Zug", "Zug"],
    ["FR", "Fribourg", "Fribourg"],
    ["SO", "Solothurn", "Solothurn"],
    ["BS", "Basel-Stadt", "Basel"],
    ["BL", "Basel-Landschaft", "Liestal"],
    ["SH", "Schaffhausen", "Schaffhausen"],
    ["AR", "Appenzell Ausserrhoden", "Herisau"],
    ["AI", "Appenzell Innerrhoden", "Appenzell"],
    ["SG", "St. Gallen", "St. Gallen"],
    ["GR", "Graubünden", "Chur"],
    ["AG", "Aargau", "Aarau"],
    ["TG", "Thurgau", "Frauenfeld"],
    ["TI", "Ticino", "Bellinzona"],
    ["VD", "Vaud", "Lausanne"],
    ["VS", "Valais", "Sion"],
    ["NE", "Neuchâtel", "Neuchâtel"],
    ["GE", "Genève", "Genève"],
    ["JU", "Jura", "Delémont"],
  ].map(([code, name, capital]) => ({ code, name, capital }));

  const BY_CODE = Object.fromEntries(CANTONS.map((c) => [c.code, c]));
  const MAP = window.SWISS_MAP;
  const { render: renderMarkdown, parseFrontMatter, escapeHtml } = window.Markdown;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const CAN_HOVER = window.matchMedia("(hover: hover)").matches;
  const SMOOTH = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

  // code -> { meta: { date, place, title }, body }. A canton is touched once its file has a date.
  const entries = {};
  const meta = (code) => (entries[code] && entries[code].meta) || {};
  const isTouched = (code) => !!meta(code).date;

  // hover: mouse over a canton (map or list); focus: keyboard focus in the list;
  // selected: the canton whose story is open.
  const state = { hover: null, focus: null, selected: null, loaded: false };
  let storyMedia = [];

  const $ = (id) => document.getElementById(id);
  const svg = $("map");
  const story = $("story");
  const readout = $("readout");
  const indexGrid = $("index-grid"); // optional: the list can be deleted from the HTML

  function el(tag, attrs, ns) {
    const node = ns ? document.createElementNS(ns, tag) : document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
    return node;
  }

  // "2025-07-14" -> "14.07.2025"; "2025-07" -> "07.2025". Anything else is shown as written.
  function formatDate(s) {
    const m = String(s || "").match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/);
    if (!m) return String(s || "");
    const pad = (n) => String(n).padStart(2, "0");
    return [m[3] && pad(m[3]), m[2] && pad(m[2]), m[1]].filter(Boolean).join(".");
  }

  // Touched cantons in the order they were touched.
  const chronological = () =>
    CANTONS.filter((c) => isTouched(c.code)).sort((a, b) => (meta(a.code).date < meta(b.code).date ? -1 : 1));

  // ---------- Map ----------

  svg.setAttribute("viewBox", `0 0 ${MAP.width} ${MAP.height}`);
  const cantonGroup = el("g", {}, SVG_NS);
  const labelGroup = el("g", {}, SVG_NS);
  const paths = {};
  const labels = {};

  for (const c of CANTONS) {
    const geo = MAP.cantons[c.code];
    paths[c.code] = cantonGroup.appendChild(el("path", { d: geo.d, class: "canton", "data-code": c.code }, SVG_NS));

    // Skip labels that would not fit (Basel-Stadt).
    if (geo.r >= 7) {
      const t = el("text", { x: geo.label[0], y: geo.label[1], class: "label" }, SVG_NS);
      t.style.setProperty("--fs", Math.min(16, geo.r).toFixed(1));
      t.style.setProperty("--fs-small", Math.min(26, geo.r * 1.3).toFixed(1));
      t.textContent = c.code;
      labels[c.code] = labelGroup.appendChild(t);
    }
  }

  const hlSelected = el("path", { class: "highlight highlight-selected", d: "" }, SVG_NS);
  const hlHover = el("path", { class: "highlight highlight-hover", d: "" }, SVG_NS);
  svg.append(
    cantonGroup,
    el("path", { class: "lakes", d: MAP.lakes }, SVG_NS),
    el("path", { class: "outline", d: MAP.outline }, SVG_NS),
    hlSelected,
    hlHover,
    labelGroup
  );

  // ---------- List ----------

  const rows = {};
  if (indexGrid) {
    for (const c of CANTONS) {
      const b = el("button", { class: "index-row", type: "button", "data-code": c.code, "aria-pressed": "false" });
      b.innerHTML = `<span class="code">${c.code}</span><span class="name">${escapeHtml(c.name)}</span><span class="date"></span>`;
      rows[c.code] = indexGrid.appendChild(b);
    }
  }

  // ---------- Rendering ----------

  function renderMap() {
    const preview = state.hover || state.focus;
    for (const c of CANTONS) {
      const touched = isTouched(c.code);
      const hovered = c.code === preview;
      const selected = c.code === state.selected;
      for (const node of [paths[c.code], labels[c.code], rows[c.code]]) {
        if (!node) continue;
        node.classList.toggle("touched", touched);
        node.classList.toggle("is-hover", hovered);
        node.classList.toggle("is-selected", selected);
      }
      if (rows[c.code]) rows[c.code].setAttribute("aria-pressed", String(selected));
    }
    hlSelected.setAttribute("d", state.selected ? MAP.cantons[state.selected].d : "");
    hlHover.setAttribute("d", preview && preview !== state.selected ? MAP.cantons[preview].d : "");
  }

  function renderReadout() {
    const code = state.hover || state.focus || state.selected;
    if (!code) {
      readout.innerHTML = `<p class="readout-hint">${
        CAN_HOVER ? "Hover over a canton to see it. Click to read its story." : "Tap a canton to read its story."
      }</p>`;
      return;
    }
    const touched = isTouched(code);
    readout.innerHTML =
      `<p class="readout-code${touched ? " touched" : ""}">${code}</p>` +
      `<p class="readout-name">${escapeHtml(BY_CODE[code].name)}</p>` +
      `<p class="readout-status">${touched ? "Touched " + escapeHtml(formatDate(meta(code).date)) : state.loaded ? "Not yet" : ""}</p>`;
  }

  function renderStory() {
    const code = state.selected;
    story.hidden = !code;
    if (!code) {
      story.innerHTML = "";
      storyMedia = [];
      return;
    }

    const c = BY_CODE[code];
    const m = meta(code);
    const touched = isTouched(code);

    const facts = [["Touched", touched ? formatDate(m.date) : state.loaded ? "Not yet" : "…"]];
    if (m.place) facts.push(["Where", m.place]);
    facts.push(["Capital", c.capital]);

    let body;
    if (!state.loaded) {
      body = `<p class="empty">Loading…</p>`;
      storyMedia = [];
    } else {
      const rendered = renderMarkdown((entries[code] && entries[code].body) || "");
      storyMedia = rendered.media;
      body = rendered.html.trim()
        ? rendered.html
        : `<p class="empty">${touched ? "No story written yet." : "Not touched yet."}</p>`;
    }

    let nav = "";
    if (touched) {
      const order = chronological();
      const i = order.findIndex((x) => x.code === code);
      const link = (x, label) =>
        x
          ? `<button type="button" data-code="${x.code}"><small>${label}</small><strong>${escapeHtml(x.name)}</strong> ${escapeHtml(formatDate(meta(x.code).date))}</button>`
          : "";
      const prev = link(order[i - 1], "← Earlier");
      const next = link(order[i + 1], "Later →");
      if (prev || next) nav = `<nav class="story-nav" aria-label="More stories">${prev}${next}</nav>`;
    }

    story.innerHTML =
      `<header class="story-meta">` +
      `<p class="story-code${touched ? " touched" : ""}">${code}</p>` +
      `<h2 class="story-name">${escapeHtml(c.name)}</h2>` +
      `<dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`).join("")}</dl>` +
      `<a class="to-map" href="#top" data-action="to-map">↑ Map</a>` +
      `</header>` +
      `<div class="story-body">` +
      (m.title ? `<h3 class="story-title">${escapeHtml(m.title)}</h3>` : "") +
      body +
      nav +
      `</div>`;
  }

  function renderSummary() {
    const n = CANTONS.filter((c) => isTouched(c.code)).length;
    $("count").textContent = String(n).padStart(2, "0");
    if (n === CANTONS.length) document.querySelector(".lede").textContent = "All 26 cantons touched. Quest complete.";
    for (const c of CANTONS) {
      if (rows[c.code]) rows[c.code].querySelector(".date").textContent = isTouched(c.code) ? formatDate(meta(c.code).date) : "—";
    }
  }

  function update() {
    renderMap();
    renderReadout();
  }

  function setHover(code) {
    if (state.hover === code) return;
    state.hover = code;
    update();
  }

  function revealStory() {
    const top = story.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.6) story.scrollIntoView({ behavior: SMOOTH, block: "start" });
  }

  function select(code, reveal) {
    state.selected = code;
    history.replaceState(null, "", code ? "#" + code : location.pathname + location.search);
    update();
    renderStory();
    if (code && reveal) revealStory();
  }

  // ---------- Events ----------

  // Map: preview on mouse hover, open the story on click/tap. Touch has no hover.
  svg.addEventListener("pointerover", (ev) => {
    if (ev.pointerType === "touch") return;
    const p = ev.target.closest(".canton");
    setHover(p ? p.dataset.code : null);
  });
  svg.addEventListener("pointerleave", () => setHover(null));
  svg.addEventListener("click", (ev) => {
    const p = ev.target.closest(".canton");
    if (p) select(p.dataset.code, true);
  });

  if (indexGrid) {
    indexGrid.addEventListener("pointerover", (ev) => {
      if (ev.pointerType === "touch") return;
      const b = ev.target.closest(".index-row");
      setHover(b ? b.dataset.code : null);
    });
    indexGrid.addEventListener("pointerleave", () => setHover(null));
    indexGrid.addEventListener("focusin", (ev) => {
      const b = ev.target.closest(".index-row");
      if (b && b.matches(":focus-visible")) {
        state.focus = b.dataset.code;
        update();
      }
    });
    indexGrid.addEventListener("focusout", () => {
      state.focus = null;
      update();
    });
    indexGrid.addEventListener("click", (ev) => {
      const b = ev.target.closest(".index-row");
      if (b) select(b.dataset.code, true);
    });
  }

  story.addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-code], [data-index], [data-action]");
    if (!t) return;
    if (t.dataset.code) {
      select(t.dataset.code, true);
    } else if (t.dataset.index) {
      openLightbox(Number(t.dataset.index));
    } else if (t.dataset.action === "to-map") {
      ev.preventDefault();
      $("top").scrollIntoView({ behavior: SMOOTH });
    }
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !lightbox.open && state.selected) select(null);
  });

  window.addEventListener("hashchange", () => {
    const code = decodeURIComponent(location.hash.slice(1)).toUpperCase();
    if (!code) select(null);
    else if (BY_CODE[code]) select(code, true);
  });

  // ---------- Style switch (strict / soft) ----------

  const styleButtons = document.querySelectorAll("[data-style-choice]");
  function markStyle() {
    const current = document.documentElement.getAttribute("data-style");
    styleButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.styleChoice === current)));
  }
  styleButtons.forEach((b) =>
    b.addEventListener("click", () => {
      const s = b.dataset.styleChoice;
      document.documentElement.setAttribute("data-style", s);
      try {
        localStorage.setItem("canton-style", s);
      } catch (e) {}
      const url = new URL(location.href);
      url.searchParams.set("style", s);
      history.replaceState(null, "", url);
      markStyle();
    })
  );
  markStyle();

  // ---------- Lightbox ----------

  const lightbox = $("lightbox");
  let lbIndex = 0;

  function showLightboxItem() {
    const item = storyMedia[lbIndex];
    const src = escapeHtml(item.src);
    $("lb-media").innerHTML = /\.(mp4|webm|mov)$/i.test(item.src)
      ? `<video src="${src}" controls playsinline autoplay></video>`
      : `<img src="${src}" alt="${escapeHtml(item.caption)}">`;
    const count = storyMedia.length > 1 ? `${lbIndex + 1}/${storyMedia.length}` : "";
    $("lb-caption").textContent = [count, item.caption].filter(Boolean).join("   ");
    $("lb-prev").hidden = $("lb-next").hidden = storyMedia.length < 2;
  }

  function openLightbox(index) {
    if (!storyMedia[index]) return;
    lbIndex = index;
    showLightboxItem();
    lightbox.showModal();
  }

  function stepLightbox(delta) {
    lbIndex = (lbIndex + delta + storyMedia.length) % storyMedia.length;
    showLightboxItem();
  }

  $("lb-close").addEventListener("click", () => lightbox.close());
  $("lb-prev").addEventListener("click", () => stepLightbox(-1));
  $("lb-next").addEventListener("click", () => stepLightbox(1));
  lightbox.addEventListener("click", (ev) => {
    if (ev.target === lightbox) lightbox.close();
  });
  lightbox.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowLeft") stepLightbox(-1);
    if (ev.key === "ArrowRight") stepLightbox(1);
  });
  lightbox.addEventListener("close", () => {
    $("lb-media").innerHTML = ""; // stops video playback
  });

  // ---------- Load stories ----------

  async function loadEntry(code) {
    try {
      const res = await fetch(`entries/${code.toLowerCase()}.md`, { cache: "no-cache" });
      if (!res.ok) throw new Error(res.status);
      entries[code] = parseFrontMatter(await res.text());
      return true;
    } catch (err) {
      entries[code] = { meta: {}, body: "" };
      return false;
    }
  }

  const initial = decodeURIComponent(location.hash.slice(1)).toUpperCase();
  update();
  if (BY_CODE[initial]) select(initial);

  Promise.all(CANTONS.map((c) => loadEntry(c.code))).then((ok) => {
    state.loaded = true;
    if (!ok.some(Boolean)) {
      const notice = $("notice");
      notice.hidden = false;
      notice.textContent =
        location.protocol === "file:"
          ? "Stories can't load from a file:// page. From the repository folder, run `python3 -m http.server` and open http://localhost:8000/switzerland/."
          : "The stories couldn't be loaded. Try refreshing the page.";
    }
    renderSummary();
    update();
    renderStory();
    if (state.selected) revealStory();
  });
})();
