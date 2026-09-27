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
  const { render: renderMarkdown, escapeHtml } = window.Markdown;
  const { SVG_NS, CAN_HOVER, SMOOTH, el, formatDates, fetchEntry } = window.SideQuest;

  // code -> { meta: { touched, date, place, title }, body }. A canton is touched when
  // its file says "touched: yes", or has a date (unless it says "touched: no").
  const entries = {};
  const meta = (code) => (entries[code] && entries[code].meta) || {};
  const isTouched = (code) => {
    const m = meta(code);
    const flag = String(m.touched || "").toLowerCase();
    return /^(yes|true)$/.test(flag) || (!!m.date && !/^(no|false)$/.test(flag));
  };

  // hover: mouse over a canton (map or list); focus: keyboard focus in the list;
  // selected: the canton whose story is open.
  const state = { hover: null, focus: null, selected: null, loaded: false };
  let storyMedia = [];

  const $ = (id) => document.getElementById(id);
  const svg = $("map");
  const story = $("story");
  const readout = $("readout");
  const indexGrid = $("index-grid"); // optional: the list can be deleted from the HTML

  // "date:" can list several visits, comma-separated. Returned oldest first, formatted.
  const datesOf = (code) => formatDates(meta(code).date);

  const touchedText = (code) => ["Touched", datesOf(code).join(", ")].filter(Boolean).join(" ");

  // ---------- Map ----------

  svg.setAttribute("viewBox", `0 0 ${MAP.width} ${MAP.height}`);
  const cantonGroup = el("g", {}, SVG_NS);
  const paths = {};

  for (const c of CANTONS) {
    paths[c.code] = cantonGroup.appendChild(el("path", { d: MAP.cantons[c.code].d, class: "canton", "data-code": c.code }, SVG_NS));
  }

  // Red stripes for touched cantons. Lines and stripes scale with the map.
  const defs = el("defs", {}, SVG_NS);
  const stripes = window.SideQuest.stripePattern("stripes");
  defs.appendChild(stripes.pattern);
  window.SideQuest.watchMapScale(svg, (px, unitsPerPx) => {
    svg.style.setProperty("--canton-stroke-w", px(0.6, 0.5) + "px");
    svg.style.setProperty("--outline-w", px(1.4, 1) + "px");
    stripes.setSpacing(px(5, 4) * unitsPerPx);
  });

  svg.append(
    defs,
    cantonGroup,
    el("path", { class: "lakes", d: MAP.lakes }, SVG_NS),
    el("path", { class: "outline", d: MAP.outline }, SVG_NS)
  );

  // ---------- List ----------

  // Rows start disabled; touched cantons are enabled once the stories load.
  const rows = {};
  if (indexGrid) {
    for (const c of CANTONS) {
      const b = el("button", { class: "index-row", type: "button", "data-code": c.code, "aria-pressed": "false", disabled: "" });
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
      for (const node of [paths[c.code], rows[c.code]]) {
        if (!node) continue;
        node.classList.toggle("touched", touched);
        node.classList.toggle("is-hover", hovered);
        node.classList.toggle("is-selected", selected);
      }
      if (rows[c.code]) rows[c.code].setAttribute("aria-pressed", String(selected));
    }
  }

  function renderReadout() {
    const code = state.hover || state.focus || state.selected;
    if (!code) {
      readout.innerHTML = `<p class="readout-hint">${
        CAN_HOVER ? "Hover over a red canton to see it. Click to read its story." : "Tap a red canton to read its story."
      }</p>`;
      return;
    }
    readout.innerHTML =
      `<p class="readout-code touched">${code}</p>` +
      `<p class="readout-name">${escapeHtml(BY_CODE[code].name)}</p>` +
      `<p class="readout-status">${state.loaded ? escapeHtml(touchedText(code)) : ""}</p>`;
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

    const facts = [["Touched", state.loaded ? datesOf(code).join("\n") || "Yes" : "…"]];
    if (m.place) facts.push(["Where", m.place]);
    facts.push(["Capital", c.capital]);

    let body;
    if (!state.loaded) {
      body = `<p class="empty">Loading…</p>`;
      storyMedia = [];
    } else {
      const rendered = renderMarkdown((entries[code] && entries[code].body) || "");
      storyMedia = rendered.media;
      body = rendered.html.trim() ? rendered.html : `<p class="empty">No story written yet.</p>`;
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
      `</div>`;
  }

  function renderSummary() {
    const n = CANTONS.filter((c) => isTouched(c.code)).length;
    $("count").textContent = String(n).padStart(2, "0");
    if (n === CANTONS.length) document.querySelector(".lede").textContent = "All 26 cantons touched. Quest complete.";
    for (const c of CANTONS) {
      const row = rows[c.code];
      if (!row) continue;
      row.disabled = !isTouched(c.code);
      const dates = datesOf(c.code);
      row.querySelector(".date").textContent = !isTouched(c.code)
        ? "—"
        : dates.length > 1
          ? `${dates[0]} +${dates.length - 1}`
          : dates.join("");
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

  // Only touched cantons have a story. (Before the stories load we can't tell yet.)
  const canOpen = (code) => !state.loaded || isTouched(code);

  function select(code, reveal) {
    if (code && !canOpen(code)) code = null; // e.g. a #GR link to an untouched canton
    state.selected = code;
    history.replaceState(null, "", code ? "#" + code : location.pathname + location.search);
    update();
    renderStory();
    if (code && reveal) revealStory();
  }

  // ---------- Events ----------

  // Map: touched cantons light up on mouse hover and open their story on
  // click/tap. Untouched cantons don't react. Touch has no hover.
  const touchedTarget = (ev) => {
    const p = ev.target.closest(".canton");
    return p && isTouched(p.dataset.code) ? p.dataset.code : null;
  };
  svg.addEventListener("pointerover", (ev) => {
    if (ev.pointerType !== "touch") setHover(touchedTarget(ev));
  });
  svg.addEventListener("pointerleave", () => setHover(null));
  svg.addEventListener("click", (ev) => {
    const code = touchedTarget(ev);
    if (code) select(code, true);
  });

  if (indexGrid) {
    indexGrid.addEventListener("pointerover", (ev) => {
      if (ev.pointerType === "touch") return;
      const b = ev.target.closest(".index-row");
      setHover(b && !b.disabled ? b.dataset.code : null);
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
      if (b && !b.disabled) select(b.dataset.code, true);
    });
  }

  story.addEventListener("click", (ev) => {
    const t = ev.target.closest("[data-index], [data-action]");
    if (!t) return;
    if (t.dataset.index) {
      window.Lightbox.open(storyMedia, Number(t.dataset.index));
    } else if (t.dataset.action === "to-map") {
      ev.preventDefault();
      $("top").scrollIntoView({ behavior: SMOOTH });
    }
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !window.Lightbox.isOpen() && state.selected) select(null);
  });

  window.addEventListener("hashchange", () => {
    const code = decodeURIComponent(location.hash.slice(1)).toUpperCase();
    if (!code) select(null);
    else if (BY_CODE[code]) select(code, true);
  });

  // ---------- Load stories ----------

  async function loadEntry(code) {
    const entry = await fetchEntry(`entries/${code.toLowerCase()}.md`);
    entries[code] = entry || { meta: {}, body: "" };
    return !!entry;
  }

  const initial = decodeURIComponent(location.hash.slice(1)).toUpperCase();
  update();
  if (BY_CODE[initial]) select(initial);

  Promise.all(CANTONS.map((c) => loadEntry(c.code))).then((ok) => {
    state.loaded = true;
    if (!ok.some(Boolean)) window.SideQuest.showLoadProblem($("notice"), "side-quests/cantons/");
    renderSummary();
    if (state.selected && !isTouched(state.selected)) select(null);
    update();
    renderStory();
    if (state.selected) revealStory();
  });
})();
