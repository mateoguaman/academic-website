// Helpers shared by the side-quest pages.
(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";

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

  // A "date:" line can list several dates, comma-separated. Returned oldest first, formatted.
  function formatDates(s) {
    return String(s || "")
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean)
      .sort()
      .map(formatDate);
  }

  // Fetches and parses a Markdown story file. Returns { meta, body }, or null if missing.
  async function fetchEntry(url) {
    try {
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) return null;
      return window.Markdown.parseFrontMatter(await res.text());
    } catch (err) {
      return null;
    }
  }

  function showLoadProblem(notice, pagePath) {
    notice.hidden = false;
    notice.textContent =
      location.protocol === "file:"
        ? `Stories can't load from a file:// page. From the repository folder, run \`python3 -m http.server\` and open http://localhost:8000/${pagePath}.`
        : "The stories couldn't be loaded. Try refreshing the page.";
  }

  // Map lines and patterns are sized for the full desktop map (828px wide) and
  // scale down with it, so a phone shows the same picture, just smaller. Calls
  // onScale(px, unitsPerPx) whenever the map's size changes, where
  // px(desktopPx, minDevicePx) gives the scaled width in CSS pixels, never below
  // minDevicePx physical pixels, and unitsPerPx converts CSS pixels to map units.
  const DESKTOP_MAP_WIDTH = 828;
  function watchMapScale(svg, onScale) {
    const update = () => {
      const width = svg.clientWidth || DESKTOP_MAP_WIDTH;
      const devicePx = 1 / (window.devicePixelRatio || 1);
      const px = (desktop, minDevicePx) => Math.max((desktop * width) / DESKTOP_MAP_WIDTH, minDevicePx * devicePx);
      const viewWidth = svg.viewBox.baseVal && svg.viewBox.baseVal.width;
      onScale(px, (viewWidth || width) / width);
    };
    new ResizeObserver(update).observe(svg);
    return update; // call again after changing the viewBox
  }

  // A red-and-white diagonal stripe pattern with the given id. Returns the
  // pattern and a function that sets the stripe spacing in map units.
  function stripePattern(id) {
    const pattern = el("pattern", { id, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, SVG_NS);
    pattern.innerHTML = `<rect width="100%" height="100%" fill="#fff"/><rect class="stripe" height="100%" fill="#da291c"/>`;
    const setSpacing = (tile) => {
      pattern.setAttribute("width", tile);
      pattern.setAttribute("height", tile);
      pattern.lastChild.setAttribute("width", tile * 0.4);
    };
    return { pattern, setSpacing };
  }

  window.SideQuest = {
    SVG_NS,
    CAN_HOVER: window.matchMedia("(hover: hover)").matches,
    SMOOTH: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    el,
    formatDate,
    formatDates,
    fetchEntry,
    showLoadProblem,
    watchMapScale,
    stripePattern,
  };
})();
