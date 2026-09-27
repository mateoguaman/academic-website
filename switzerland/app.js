// Interactive canton map. Content lives in cantons.js; geometry in map-data.js.
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
  const LOG = window.CANTON_LOG || {};
  const SVG_NS = "http://www.w3.org/2000/svg";
  const CAN_HOVER = window.matchMedia("(hover: hover)").matches;

  const entry = (code) => LOG[code] || {};
  const isVisited = (code) => !!entry(code).visited;
  const photosOf = (code) => (Array.isArray(entry(code).photos) ? entry(code).photos : []);

  // hover: mouse over a canton (map or list); focus: keyboard focus in the list;
  // selected: pinned by click/tap. The panel shows the first one that is set.
  const state = { hover: null, focus: null, selected: null, photo: 0 };
  const shown = () => state.hover || state.focus || state.selected;

  const $ = (id) => document.getElementById(id);
  const svg = $("map");
  const panel = $("panel");
  const chipsEl = $("chips");

  function el(tag, attrs, ns) {
    const node = ns ? document.createElementNS(ns, tag) : document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
    return node;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]
    );
  }

  // "2025-06-01" -> "1 June 2025"; also accepts "2025-06" and "2025".
  function formatDate(s) {
    if (!s) return "";
    const [y, m, d] = String(s).split("-").map(Number);
    if (!y) return String(s);
    if (!m) return String(y);
    const date = new Date(y, m - 1, d || 1);
    const opts = d ? { day: "numeric", month: "long", year: "numeric" } : { month: "long", year: "numeric" };
    return date.toLocaleDateString("en-GB", opts);
  }

  const isVideo = (src) => /\.(mp4|webm|mov)$/i.test(src);

  function mediaTag(src, alt, forThumb) {
    if (isVideo(src)) {
      // "#t=0.1" makes browsers (notably iOS Safari) show the first frame as a poster.
      const controls = forThumb ? "" : " controls";
      return `<video src="${escapeHtml(src)}#t=0.1" muted playsinline preload="metadata"${controls}></video>`;
    }
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt || "")}" loading="lazy">`;
  }

  // ---------- Build the map ----------

  svg.setAttribute("viewBox", `0 0 ${MAP.width} ${MAP.height}`);

  const cantonGroup = el("g", {}, SVG_NS);
  const labelGroup = el("g", {}, SVG_NS);
  const paths = {};
  const labels = {};

  for (const c of CANTONS) {
    const geo = MAP.cantons[c.code];
    const p = el("path", { d: geo.d, class: "canton", "data-code": c.code }, SVG_NS);
    cantonGroup.appendChild(p);
    paths[c.code] = p;

    // Skip labels that would not fit (Basel-Stadt); the list covers those.
    if (geo.r >= 7) {
      const t = el("text", { x: geo.label[0], y: geo.label[1], class: "label" }, SVG_NS);
      t.style.setProperty("--fs", Math.min(17, geo.r).toFixed(1));
      t.style.setProperty("--fs-small", Math.min(26, geo.r * 1.3).toFixed(1));
      t.textContent = c.code;
      labelGroup.appendChild(t);
      labels[c.code] = t;
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

  // ---------- Build the list + progress bar ----------

  const chips = {};
  const bar = $("progress-bar");
  for (const c of CANTONS) {
    const b = el("button", { class: "chip", type: "button", "data-code": c.code, "aria-pressed": "false" });
    b.innerHTML =
      `<span class="chip-code">${c.code}</span>` +
      `<span class="chip-name">${escapeHtml(c.name)}</span>` +
      (isVisited(c.code) ? `<span class="chip-check" aria-label="touched">✓</span>` : "");
    chipsEl.appendChild(b);
    chips[c.code] = b;

    const seg = el("span", { title: c.name });
    bar.appendChild(seg);

    for (const node of [paths[c.code], labels[c.code], b, seg]) {
      if (node && isVisited(c.code)) node.classList.add("visited");
    }
  }

  const visitedCount = CANTONS.filter((c) => isVisited(c.code)).length;
  $("count").textContent = visitedCount;
  if (visitedCount === CANTONS.length) {
    document.querySelector(".tagline").textContent = "All 26 cantons touched. Quest complete!";
  }

  // ---------- Panel ----------

  function silhouette(code) {
    // Crop the canton's own path so it fills the placeholder.
    const box = paths[code].getBBox();
    const pad = Math.max(box.width, box.height) * 0.06;
    const vb = [box.x - pad, box.y - pad, box.width + 2 * pad, box.height + 2 * pad].map((n) => n.toFixed(1)).join(" ");
    return `<svg viewBox="${vb}" aria-hidden="true"><path d="${MAP.cantons[code].d}"/></svg>`;
  }

  function renderCanton(code) {
    const c = BY_CODE[code];
    const e = entry(code);
    const visited = isVisited(code);
    const photos = photosOf(code);
    const photo = photos[Math.min(state.photo, photos.length - 1)];
    const pinned = state.selected === code;

    let html =
      `<div class="panel-head">` +
      `<span class="badge${visited ? " visited" : ""}">${code}</span>` +
      `<div><h2>${escapeHtml(c.name)}</h2><p class="sub">Capital: ${escapeHtml(c.capital)}</p></div>` +
      `</div>`;

    html += visited
      ? `<p class="status visited">✓ Touched${e.date ? " · " + escapeHtml(formatDate(e.date)) : ""}</p>`
      : `<p class="status">Not touched yet</p>`;

    if (e.place) html += `<p class="place"><strong>Where:</strong> ${escapeHtml(e.place)}</p>`;

    if (photo) {
      html +=
        `<figure class="media">` +
        `<button class="media-open" type="button" data-action="open" aria-label="Open photo full size">${mediaTag(photo.src, photo.caption)}</button>` +
        (photo.caption ? `<figcaption>${escapeHtml(photo.caption)}</figcaption>` : "") +
        `</figure>`;
      if (photos.length > 1) {
        html += `<div class="thumbs">`;
        photos.forEach((p, i) => {
          html += `<button class="thumb" type="button" data-photo="${i}" aria-label="Photo ${i + 1}" aria-current="${i === state.photo}">${mediaTag(p.src, "", true)}</button>`;
        });
        html += `</div>`;
      }
    } else {
      html +=
        `<div class="placeholder${visited ? " visited" : ""}">${silhouette(code)}` +
        `<p>${visited ? "No photo added yet." : "No photo yet. Still on the to-do list."}</p></div>`;
    }

    if (e.note) html += `<p class="note">${e.note}</p>`;

    if (!pinned) {
      html += `<p class="hint">${CAN_HOVER ? "Click to pin this canton." : ""}</p>`;
    } else {
      html += `<p class="hint">Pinned. ${CAN_HOVER ? "Click it again or press Esc to unpin." : "Tap it again to unpin."}</p>`;
    }

    panel.innerHTML = html;
  }

  function renderOverview() {
    const recent = CANTONS.filter((c) => isVisited(c.code))
      .map((c) => ({ ...c, date: entry(c.code).date || "" }))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, 5);

    let html =
      `<h2>Pick a canton</h2>` +
      `<p class="sub" style="margin-top:6px">${
        CAN_HOVER
          ? "Hover over a canton to see it, click to pin it."
          : "Tap a canton on the map, or in the list below."
      }</p>`;

    html += `<h3>Most recent</h3>`;
    if (recent.length) {
      html += `<ul class="recent">`;
      for (const c of recent) {
        html += `<li><button type="button" data-code="${c.code}"><span>${escapeHtml(c.name)}</span><span class="date">${escapeHtml(formatDate(c.date))}</span></button></li>`;
      }
      html += `</ul>`;
    } else {
      html += `<p style="margin-top:8px">Nothing yet. The quest begins soon.</p>`;
    }

    panel.innerHTML = html;
  }

  // ---------- State ----------

  let panelKey = null;

  function render() {
    const current = shown();
    const active = new Set([state.hover, state.focus, state.selected].filter(Boolean));

    for (const c of CANTONS) {
      const on = active.has(c.code);
      paths[c.code].classList.toggle("is-active", on);
      if (labels[c.code]) labels[c.code].classList.toggle("is-active", on);
      chips[c.code].classList.toggle("is-active", on);
      chips[c.code].setAttribute("aria-pressed", String(state.selected === c.code));
    }

    hlSelected.setAttribute("d", state.selected ? MAP.cantons[state.selected].d : "");
    const preview = state.hover || state.focus;
    hlHover.setAttribute("d", preview && preview !== state.selected ? MAP.cantons[preview].d : "");

    // Only re-render the panel when what it shows changes, so images don't flicker.
    const key = current ? `${current}|${state.selected === current}|${state.photo}` : "overview";
    if (key !== panelKey) {
      panelKey = key;
      current ? renderCanton(current) : renderOverview();
    }
  }

  function setHover(code) {
    if (state.hover === code) return;
    state.hover = code;
    if (!state.focus) state.photo = 0;
    render();
  }

  function select(code) {
    state.selected = code;
    state.photo = 0;
    const url = code ? "#" + code : location.pathname + location.search;
    history.replaceState(null, "", url);
    render();
  }

  const toggle = (code) => select(state.selected === code ? null : code);

  // ---------- Events ----------

  // Map: preview on mouse hover, pin on click/tap. Touch has no hover, so a tap selects.
  svg.addEventListener("pointerover", (ev) => {
    if (ev.pointerType === "touch") return;
    const p = ev.target.closest(".canton");
    setHover(p ? p.dataset.code : null);
  });
  svg.addEventListener("pointerleave", () => setHover(null));
  svg.addEventListener("click", (ev) => {
    const p = ev.target.closest(".canton");
    p ? toggle(p.dataset.code) : select(null);
  });

  chipsEl.addEventListener("pointerover", (ev) => {
    if (ev.pointerType === "touch") return;
    const b = ev.target.closest(".chip");
    setHover(b ? b.dataset.code : null);
  });
  chipsEl.addEventListener("pointerleave", () => setHover(null));
  chipsEl.addEventListener("focusin", (ev) => {
    const b = ev.target.closest(".chip");
    if (b && b.matches(":focus-visible")) {
      state.focus = b.dataset.code;
      render();
    }
  });
  chipsEl.addEventListener("focusout", () => {
    state.focus = null;
    render();
  });
  chipsEl.addEventListener("click", (ev) => {
    const b = ev.target.closest(".chip");
    if (!b) return;
    toggle(b.dataset.code);
    if (state.selected && !CAN_HOVER) panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  panel.addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-code], [data-photo], [data-action]");
    if (!t) return;
    if (t.dataset.code) {
      select(t.dataset.code);
    } else if (t.dataset.photo) {
      // Pin whatever is on screen so the gallery doesn't vanish on mouse-out.
      if (state.selected !== shown()) state.selected = shown();
      state.photo = Number(t.dataset.photo);
      render();
    } else if (t.dataset.action === "open") {
      openLightbox(shown(), state.photo);
    }
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !lightbox.open && state.selected) select(null);
  });

  function selectFromHash() {
    const code = decodeURIComponent(location.hash.slice(1)).toUpperCase();
    select(BY_CODE[code] ? code : null);
  }
  window.addEventListener("hashchange", selectFromHash);

  // ---------- Lightbox ----------

  const lightbox = $("lightbox");
  const lb = { code: null, index: 0 };

  function showLightboxPhoto() {
    const photos = photosOf(lb.code);
    const p = photos[lb.index];
    $("lb-media").innerHTML = mediaTag(p.src, p.caption);
    const media = $("lb-media").firstElementChild;
    if (media.tagName === "VIDEO") media.muted = false;
    $("lb-caption").textContent = [BY_CODE[lb.code].name, p.caption].filter(Boolean).join(" · ");
    $("lb-prev").hidden = $("lb-next").hidden = photos.length < 2;
  }

  function openLightbox(code, index) {
    if (!code || !photosOf(code).length) return;
    lb.code = code;
    lb.index = index;
    showLightboxPhoto();
    lightbox.showModal();
  }

  function stepLightbox(delta) {
    const n = photosOf(lb.code).length;
    lb.index = (lb.index + delta + n) % n;
    showLightboxPhoto();
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

  selectFromHash();
})();
