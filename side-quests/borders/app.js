// Borders map. Rides come from rides.js (built from the GPS files by
// build_rides.py); their stories live in entries/<ride id>.md.
(function () {
  "use strict";

  const COUNTRIES = [
    ["FR", "France"],
    ["DE", "Germany"],
    ["IT", "Italy"],
    ["AT", "Austria"],
    ["LI", "Liechtenstein"],
  ].map(([code, name]) => ({ code, name }));
  const COUNTRY_NAME = Object.fromEntries(COUNTRIES.map((c) => [c.code, c.name]));

  const MAP = window.BORDERS_MAP;
  const RIDES = (window.RIDES || []).slice();
  const BY_ID = Object.fromEntries(RIDES.map((r) => [r.id, r]));
  const { render: renderMarkdown, escapeHtml } = window.Markdown;
  const { SVG_NS, CAN_HOVER, SMOOTH, el, formatDates, fetchEntry } = window.SideQuest;

  const entries = {}; // ride id -> { meta, body } from entries/<id>.md
  const state = { hover: null, focus: null, selected: null, loaded: RIDES.length === 0 };
  let storyMedia = [];

  const $ = (id) => document.getElementById(id);
  const svg = $("map");
  const story = $("story");
  const readout = $("readout");

  // ---------- Ride data: the GPS file's values, overridden by the story file ----------

  const meta = (id) => (entries[id] && entries[id].meta) || {};
  const titleOf = (id) => meta(id).title || BY_ID[id].title;
  const rawDate = (id) => meta(id).date || BY_ID[id].date || "";
  const datesOf = (id) => formatDates(rawDate(id));
  const firstDate = (id) => rawDate(id).split(",").map((s) => s.trim()).filter(Boolean).sort()[0] || "";

  const ALIASES = {
    FR: ["fr", "france", "frankreich"],
    DE: ["de", "germany", "deutschland", "allemagne"],
    IT: ["it", "italy", "italia", "italien", "italie"],
    AT: ["at", "austria", "österreich", "oesterreich", "autriche"],
    LI: ["li", "liechtenstein"],
  };
  function parseCountries(s) {
    const out = new Set();
    for (const word of String(s || "").toLowerCase().split(/[\s,;/]+/)) {
      for (const [code, names] of Object.entries(ALIASES)) if (names.includes(word)) out.add(code);
    }
    return out;
  }

  // Borders crossed on a ride: found in the GPS track, plus any listed in the story file.
  const bordersOf = (id) => {
    const set = new Set([...BY_ID[id].borders, ...parseCountries(meta(id).borders)]);
    return COUNTRIES.map((c) => c.code).filter((c) => set.has(c));
  };

  // Rides that crossed each country, earliest first.
  function ridesByCountry() {
    const out = Object.fromEntries(COUNTRIES.map((c) => [c.code, []]));
    for (const r of RIDES) for (const code of bordersOf(r.id)) out[code].push(r.id);
    for (const ids of Object.values(out)) ids.sort((a, b) => (firstDate(a) < firstDate(b) ? -1 : 1));
    return out;
  }

  const fmtKm = (km) => `${km.toLocaleString("en-US", { maximumFractionDigits: 1 })} km`;
  const fmtM = (m) => `${Math.round(m).toLocaleString("en-US")} m`;

  // ---------- Map ----------

  // Frame the map on Switzerland plus every ride, with a little of each neighbour around.
  const box = RIDES.reduce(
    (b, r) => [Math.min(b[0], r.bbox[0]), Math.min(b[1], r.bbox[1]), Math.max(b[2], r.bbox[2]), Math.max(b[3], r.bbox[3])],
    MAP.chBox.slice()
  );
  const PAD = 28;
  const viewBox = [box[0] - PAD, box[1] - PAD, box[2] - box[0] + 2 * PAD, box[3] - box[1] + 2 * PAD];
  svg.setAttribute("viewBox", viewBox.join(" "));

  const countryPaths = {};
  const countryGroup = el("g", {}, SVG_NS);
  for (const c of COUNTRIES) {
    countryPaths[c.code] = countryGroup.appendChild(el("path", { d: MAP.countries[c.code], class: "country", "data-code": c.code }, SVG_NS));
  }

  // The Swiss outline is drawn as its five border stretches, which turn red once crossed.
  const borderPaths = {};
  const borderGroup = el("g", {}, SVG_NS);
  for (const c of COUNTRIES) {
    borderPaths[c.code] = borderGroup.appendChild(el("path", { d: MAP.borders[c.code], class: "outline border", "data-code": c.code }, SVG_NS));
  }

  const rideGroup = el("g", { class: "rides" }, SVG_NS);
  const rideEls = {};
  const crossingDots = [];
  for (const r of RIDES) {
    const g = el("g", { class: "ride", "data-id": r.id }, SVG_NS);
    g.append(el("path", { d: r.path, class: "ride-hit" }, SVG_NS), el("path", { d: r.path, class: "ride-line" }, SVG_NS));
    for (const c of r.crossings) crossingDots.push(g.appendChild(el("circle", { cx: c.x, cy: c.y, r: 3, class: "crossing" }, SVG_NS)));
    rideEls[r.id] = rideGroup.appendChild(g);
  }

  // The background is neighbour-grey, so slivers where the Swiss and Natural Earth
  // borders don't quite meet read as neighbouring land rather than white gaps.
  const [vx, vy, vw, vh] = viewBox;
  svg.append(
    el("rect", { x: vx, y: vy, width: vw, height: vh, class: "land" }, SVG_NS),
    countryGroup,
    el("path", { d: MAP.neighbourLines, class: "neighbour-lines" }, SVG_NS),
    el("path", { d: MAP.switzerland, class: "switzerland" }, SVG_NS),
    el("path", { d: MAP.cantonLines, class: "canton-lines" }, SVG_NS),
    el("path", { d: MAP.lakes, class: "lakes" }, SVG_NS),
    borderGroup,
    rideGroup
  );

  window.SideQuest.watchMapScale(svg, (px, unitsPerPx) => {
    svg.style.setProperty("--neighbour-line-w", px(0.9, 0.5) + "px");
    svg.style.setProperty("--canton-line-w", px(0.5, 0.5) + "px");
    svg.style.setProperty("--outline-w", px(1.4, 1) + "px");
    svg.style.setProperty("--border-crossed-w", px(3.5, 2) + "px");
    svg.style.setProperty("--ride-w", px(1.6, 1) + "px");
    svg.style.setProperty("--ride-hover-w", px(3, 1.5) + "px");
    svg.style.setProperty("--crossing-ring-w", px(1.5, 1) + "px");
    const r = px(3.5, 3) * unitsPerPx;
    for (const dot of crossingDots) dot.setAttribute("r", r);
  });

  // ---------- Side column and ride list ----------

  const countryRows = {};
  for (const c of COUNTRIES) {
    const li = el("li", { "data-code": c.code });
    li.innerHTML = `<span class="name">${c.name}</span><span class="status">—</span>`;
    countryRows[c.code] = $("countries").appendChild(li);
  }

  const rideRows = {};
  function buildRideList() {
    const list = $("rides");
    list.innerHTML = "";
    if (!RIDES.length) {
      list.innerHTML = `<p class="rides-empty">No rides yet.</p>`;
      return;
    }
    const newestFirst = RIDES.slice().sort((a, b) => (firstDate(a.id) < firstDate(b.id) ? 1 : -1));
    for (const r of newestFirst) {
      const b = el("button", { class: "ride-row", type: "button", "data-id": r.id, "aria-pressed": "false" });
      const dates = datesOf(r.id);
      b.innerHTML =
        `<span class="date">${escapeHtml(dates[0] || "")}</span>` +
        `<span class="title">${escapeHtml(titleOf(r.id))}</span>` +
        `<span class="codes">${bordersOf(r.id).join(" ")}</span>` +
        `<span class="km">${fmtKm(r.distanceKm)}</span>`;
      rideRows[r.id] = list.appendChild(b);
    }
  }

  // ---------- Rendering ----------

  function renderMap() {
    const byCountry = ridesByCountry();
    const preview = state.hover || state.focus;
    for (const c of COUNTRIES) {
      const crossed = byCountry[c.code].length > 0;
      const hovered = preview && preview.country === c.code;
      countryPaths[c.code].classList.toggle("crossed", crossed);
      countryPaths[c.code].classList.toggle("is-hover", !!hovered);
      borderPaths[c.code].classList.toggle("crossed", crossed);
      borderPaths[c.code].classList.toggle("is-hover", !!hovered);
      countryRows[c.code].classList.toggle("crossed", crossed);
      countryRows[c.code].classList.toggle("is-hover", !!hovered);
    }
    for (const r of RIDES) {
      const hovered = !!(preview && preview.ride === r.id);
      const selected = state.selected === r.id;
      rideEls[r.id].classList.toggle("is-hover", hovered);
      rideEls[r.id].classList.toggle("is-selected", selected);
      if (rideRows[r.id]) {
        rideRows[r.id].classList.toggle("is-hover", hovered);
        rideRows[r.id].setAttribute("aria-pressed", String(selected));
      }
    }
    // Fade the other rides while one is hovered.
    rideGroup.classList.toggle("has-hover", !!(preview && preview.ride));
    // Draw the open ride, then the hovered one, on top of the others.
    if (state.selected) rideGroup.appendChild(rideEls[state.selected]);
    if (preview && preview.ride) rideGroup.appendChild(rideEls[preview.ride]);
  }

  function renderReadout() {
    const p = state.hover || state.focus || (state.selected && { ride: state.selected });
    if (!p) {
      readout.innerHTML = `<p class="readout-hint">${
        !RIDES.length
          ? "No rides yet."
          : CAN_HOVER
            ? "Hover over a ride, or a country you've crossed into. Click a ride to read about it."
            : "Tap a ride to read about it."
      }</p>`;
      return;
    }
    if (p.ride) {
      const borders = bordersOf(p.ride).map((c) => COUNTRY_NAME[c]).join(", ");
      readout.innerHTML =
        `<p class="readout-code touched">${escapeHtml(datesOf(p.ride).join(", "))}</p>` +
        `<p class="readout-name">${escapeHtml(titleOf(p.ride))}</p>` +
        `<p class="readout-status">${fmtKm(BY_ID[p.ride].distanceKm)}${borders ? " · " + escapeHtml(borders) : ""}</p>`;
      return;
    }
    const ids = ridesByCountry()[p.country];
    readout.innerHTML =
      `<p class="readout-code touched">${p.country}</p>` +
      `<p class="readout-name">${COUNTRY_NAME[p.country]}</p>` +
      `<p class="readout-status">${
        ids.length
          ? `Crossed on ${ids.length} ride${ids.length > 1 ? "s" : ""}, first ${escapeHtml(datesOf(ids[0])[0] || "")}`
          : "Not yet"
      }</p>`;
  }

  function renderSummary() {
    const byCountry = ridesByCountry();
    const n = COUNTRIES.filter((c) => byCountry[c.code].length).length;
    $("count").textContent = n;
    if (n === COUNTRIES.length) document.querySelector(".lede").textContent = "All five borders crossed. Quest complete.";
    for (const c of COUNTRIES) {
      const ids = byCountry[c.code];
      countryRows[c.code].querySelector(".status").textContent = ids.length ? datesOf(ids[0])[0] || "Crossed" : "—";
    }
    buildRideList();
  }

  function update() {
    renderMap();
    renderReadout();
  }

  function setHover(h) {
    const same = (a, b) => (a && b ? a.ride === b.ride && a.country === b.country : a === b);
    if (same(state.hover, h)) return;
    state.hover = h;
    update();
  }

  // ---------- Story: route map, elevation profile, then the written story ----------

  function routeMap(r) {
    // Frame the ride with some room around it, in a shape that isn't too tall or thin.
    let [x0, y0, x1, y1] = r.bbox;
    let w = Math.max(x1 - x0, 20);
    let h = Math.max(y1 - y0, 20);
    const pad = Math.max(w, h) * 0.12;
    w += 2 * pad;
    h += 2 * pad;
    if (h > w * 0.75) w = h / 0.75;
    if (w > h * 2) h = w / 2;
    const cx = (r.bbox[0] + r.bbox[2]) / 2;
    const cy = (r.bbox[1] + r.bbox[3]) / 2;
    const vb = [cx - w / 2, cy - h / 2, w, h].map((n) => n.toFixed(1)).join(" ");
    const countries = COUNTRIES.map((c) => `<path class="country" d="${MAP.countries[c.code]}"/>`).join("");
    const dots = r.crossings.map((c) => `<circle class="crossing route-crossing" cx="${c.x}" cy="${c.y}" r="1"/>`).join("");
    // Zoomed in, so Switzerland and its lakes use the full-detail outlines.
    const D = MAP.detail;
    return (
      `<figure class="route-figure">` +
      `<svg class="route-map" viewBox="${vb}" role="img" aria-label="Route of this ride">` +
      `<rect class="land" x="${cx - w}" y="${cy - h}" width="${2 * w}" height="${2 * h}"/>` +
      `${countries}<path class="neighbour-lines" d="${MAP.neighbourLines}"/>` +
      `<path class="switzerland" d="${D.switzerland}"/><path class="canton-lines" d="${MAP.cantonLines}"/>` +
      `<path class="lakes" d="${D.lakes}"/><path class="outline" d="${D.outline}"/>` +
      `<path class="ride-line" d="${r.path}"/>${dots}<circle class="route-dot" r="1" hidden/>` +
      `</svg></figure>`
    );
  }

  // Round tick step giving roughly `target` ticks over `span`.
  function niceStep(span, target) {
    const raw = span / target;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / mag;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
  }

  // Elevation profile: a 2px line over a light wash, recessive grid, the highest
  // point labelled, and a crosshair that also moves a dot along the route map.
  function drawProfile(fig, r, routeSvg) {
    const pts = r.profile;
    const svgEl = fig.querySelector("svg");
    const tip = fig.querySelector(".profile-tip");
    const dot = routeSvg.querySelector(".route-dot");
    const W = svgEl.clientWidth;
    const H = svgEl.clientHeight;
    if (!W) return;
    const M = { l: 44, r: 8, t: 18, b: 20 };
    const maxKm = pts[pts.length - 1][0] || 1;
    const eles = pts.map((p) => p[1]);
    const yStep = niceStep(Math.max(Math.max(...eles) - Math.min(...eles), 50), 3);
    const yMin = Math.floor(Math.min(...eles) / yStep) * yStep;
    const yMax = Math.ceil(Math.max(...eles) / yStep) * yStep || yMin + yStep;
    const X = (km) => M.l + (km / maxKm) * (W - M.l - M.r);
    const Y = (m) => H - M.b - ((m - yMin) / (yMax - yMin)) * (H - M.t - M.b);

    let s = "";
    for (let v = yMin; v <= yMax + 1e-9; v += yStep) {
      s += `<line class="grid" x1="${M.l}" x2="${W - M.r}" y1="${Y(v)}" y2="${Y(v)}"/>`;
      s += `<text class="tick" x="${M.l - 6}" y="${Y(v) + 4}" text-anchor="end">${Math.round(v).toLocaleString("en-US")}</text>`;
    }
    const xStep = niceStep(maxKm, Math.max(2, Math.min(6, Math.floor(W / 90))));
    for (let k = 0; k <= maxKm + 1e-9; k += xStep) {
      const label = k + xStep > maxKm + 1e-9 ? `${+k.toFixed(1)} km` : +k.toFixed(1);
      s += `<text class="tick" x="${X(k)}" y="${H - 4}" text-anchor="${k === 0 ? "start" : "middle"}">${label}</text>`;
    }
    const line = pts.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join("");
    s += `<path class="area" d="${line}L${X(maxKm)},${Y(yMin)}L${X(0)},${Y(yMin)}Z"/>`;
    s += `<line class="axis" x1="${M.l}" x2="${W - M.r}" y1="${Y(yMin)}" y2="${Y(yMin)}"/>`;
    s += `<path class="line" d="${line}"/>`;
    const peak = pts.reduce((a, p) => (p[1] > a[1] ? p : a), pts[0]);
    const peakX = X(peak[0]);
    const anchor = peakX < W * 0.15 ? "start" : peakX > W * 0.85 ? "end" : "middle";
    s += `<circle class="peak" cx="${peakX}" cy="${Y(peak[1])}" r="4"/>`;
    s += `<text class="peak-label" x="${peakX}" y="${Y(peak[1]) - 8}" text-anchor="${anchor}">${fmtM(peak[1])}</text>`;
    s += `<line class="crosshair" y1="${M.t}" y2="${H - M.b}" hidden/><circle class="peak crosshair-dot" r="4" hidden/>`;
    svgEl.innerHTML = s;

    const cross = svgEl.querySelector(".crosshair");
    const crossDot = svgEl.querySelector(".crosshair-dot");
    const show = (i) => {
      const p = pts[Math.max(0, Math.min(pts.length - 1, i))];
      const x = X(p[0]);
      cross.setAttribute("x1", x);
      cross.setAttribute("x2", x);
      crossDot.setAttribute("cx", x);
      crossDot.setAttribute("cy", Y(p[1]));
      cross.hidden = crossDot.hidden = tip.hidden = false;
      tip.innerHTML = `<strong>${fmtM(p[1])}</strong> · ${fmtKm(p[0])}`;
      tip.style.left = Math.max(60, Math.min(W - 60, x)) + "px";
      if (dot && p[2] != null) {
        dot.setAttribute("cx", p[2]);
        dot.setAttribute("cy", p[3]);
        dot.hidden = false;
      }
      svgEl.dataset.index = i;
    };
    const hide = () => {
      cross.hidden = crossDot.hidden = tip.hidden = true;
      if (dot) dot.hidden = true;
    };
    const nearest = (clientX) => {
      const km = ((clientX - svgEl.getBoundingClientRect().left - M.l) / (W - M.l - M.r)) * maxKm;
      let best = 0;
      for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i][0] - km) < Math.abs(pts[best][0] - km)) best = i;
      return best;
    };
    svgEl.onpointermove = (ev) => show(nearest(ev.clientX));
    svgEl.onpointerdown = (ev) => show(nearest(ev.clientX));
    svgEl.onpointerleave = hide;
    svgEl.onfocus = () => show(pts.indexOf(peak));
    svgEl.onblur = hide;
    svgEl.onkeydown = (ev) => {
      const step = Math.max(1, Math.round(pts.length / 50));
      const i = Number(svgEl.dataset.index || 0);
      if (ev.key === "ArrowRight") show(i + step);
      else if (ev.key === "ArrowLeft") show(i - step);
      else return;
      ev.preventDefault();
    };
  }

  // Keep the route map's dots a fixed size on screen, and redraw the profile to its width.
  let storyObserver = null;
  function wireStoryGraphics(r) {
    const routeSvg = story.querySelector(".route-map");
    const fig = story.querySelector(".profile");
    if (storyObserver) storyObserver.disconnect();
    storyObserver = new ResizeObserver(() => {
      const u = routeSvg.viewBox.baseVal.width / (routeSvg.clientWidth || 1);
      routeSvg.querySelectorAll(".route-crossing").forEach((c) => c.setAttribute("r", 4 * u));
      routeSvg.querySelector(".route-dot").setAttribute("r", 5 * u);
      if (fig) drawProfile(fig, r, routeSvg);
    });
    storyObserver.observe(routeSvg);
  }

  function renderStory() {
    const id = state.selected;
    story.hidden = !id;
    if (!id) {
      story.innerHTML = "";
      storyMedia = [];
      if (storyObserver) storyObserver.disconnect();
      return;
    }
    const r = BY_ID[id];
    const m = meta(id);
    const borders = bordersOf(id).map((c) => COUNTRY_NAME[c]).join(", ") || "None found";

    const facts = [["Date", datesOf(id).join("\n") || "—"], ["Distance", fmtKm(r.distanceKm)]];
    if (r.profile.length) facts.push(["Climbing", fmtM(r.climbM)]);
    if (r.highestM != null) facts.push(["Highest", fmtM(r.highestM)]);
    facts.push(["Borders", borders]);
    if (m.place) facts.push(["Where", m.place]);

    let body = "";
    if (!state.loaded) {
      storyMedia = [];
    } else {
      const rendered = renderMarkdown((entries[id] && entries[id].body) || "");
      storyMedia = rendered.media;
      body = rendered.html.trim() ? rendered.html : `<p class="empty">No story written yet.</p>`;
    }

    story.innerHTML =
      `<header class="story-meta">` +
      `<p class="story-code touched">${escapeHtml(datesOf(id)[0] || "Ride")}</p>` +
      `<h2 class="story-name">${escapeHtml(titleOf(id))}</h2>` +
      `<dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`).join("")}</dl>` +
      `<a class="to-map" href="#top" data-action="to-map">↑ Map</a>` +
      `</header>` +
      `<div class="story-body">` +
      routeMap(r) +
      (r.profile.length > 1
        ? `<figure class="profile"><p class="profile-label">Elevation</p>` +
          `<svg tabindex="0" aria-label="Elevation profile. Use the arrow keys to move along the ride."></svg>` +
          `<p class="profile-tip" hidden></p></figure>`
        : "") +
      body +
      `</div>`;
    wireStoryGraphics(r);
  }

  function revealStory() {
    const top = story.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.6) story.scrollIntoView({ behavior: SMOOTH, block: "start" });
  }

  function select(id, reveal) {
    if (id && !BY_ID[id]) id = null;
    state.selected = id;
    history.replaceState(null, "", id ? "#" + id : location.pathname + location.search);
    update();
    renderStory();
    if (id && reveal) revealStory();
  }

  // ---------- Events ----------

  function mapTarget(ev) {
    const ride = ev.target.closest(".ride");
    if (ride) return { ride: ride.dataset.id };
    const country = ev.target.closest(".country.crossed");
    if (country) return { country: country.dataset.code };
    return null;
  }

  svg.addEventListener("pointerover", (ev) => {
    if (ev.pointerType !== "touch") setHover(mapTarget(ev));
  });
  svg.addEventListener("pointerleave", () => setHover(null));
  svg.addEventListener("click", (ev) => {
    const t = mapTarget(ev);
    if (!t) return;
    // A crossed country opens the first ride that crossed into it.
    select(t.ride || ridesByCountry()[t.country][0], true);
  });

  const countryList = $("countries");
  countryList.addEventListener("pointerover", (ev) => {
    if (ev.pointerType === "touch") return;
    const li = ev.target.closest("li.crossed");
    setHover(li ? { country: li.dataset.code } : null);
  });
  countryList.addEventListener("pointerleave", () => setHover(null));

  const rideList = $("rides");
  rideList.addEventListener("pointerover", (ev) => {
    if (ev.pointerType === "touch") return;
    const b = ev.target.closest(".ride-row");
    setHover(b ? { ride: b.dataset.id } : null);
  });
  rideList.addEventListener("pointerleave", () => setHover(null));
  rideList.addEventListener("focusin", (ev) => {
    const b = ev.target.closest(".ride-row");
    if (b && b.matches(":focus-visible")) {
      state.focus = { ride: b.dataset.id };
      update();
    }
  });
  rideList.addEventListener("focusout", () => {
    state.focus = null;
    update();
  });
  rideList.addEventListener("click", (ev) => {
    const b = ev.target.closest(".ride-row");
    if (b) select(b.dataset.id, true);
  });

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
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id) select(null);
    else if (BY_ID[id]) select(id, true);
  });

  // ---------- Load stories ----------

  renderSummary();
  update();
  const initial = decodeURIComponent(location.hash.slice(1));
  if (BY_ID[initial]) select(initial);

  if (RIDES.length) {
    Promise.all(
      RIDES.map(async (r) => {
        const entry = await fetchEntry(`entries/${r.id}.md`);
        entries[r.id] = entry || { meta: {}, body: "" };
        return !!entry;
      })
    ).then((ok) => {
      state.loaded = true;
      if (!ok.some(Boolean)) window.SideQuest.showLoadProblem($("notice"), "side-quests/borders/");
      renderSummary();
      update();
      renderStory();
      if (state.selected) revealStory();
    });
  }
})();
