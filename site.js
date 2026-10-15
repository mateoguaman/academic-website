// Behaviour for index.html: rows that open in place, the pinned clip on
// laptops, clips that play on hover (mouse) or while on screen (phones),
// the section in view marked in the bar, and the phone menu. The content
// itself is all in index.html.

(function () {
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const phone = matchMedia("(max-width: 767px)");

  // A figure turns on: its second image or clip fades in; a clip loads
  // only the first time it plays.
  function on(fig) {
    fig.classList.add("is-on");
    const v = fig.querySelector("video");
    if (!v) return;
    if (!v.src) v.src = v.dataset.src;
    v.play().catch(() => {});
  }
  function off(fig) {
    fig.classList.remove("is-on");
    const v = fig.querySelector("video");
    if (v && v.src) v.pause();
  }

  // The bar link of the section in view.
  const bar = document.getElementById("bar");
  if (bar) {
    const pairs = [...bar.querySelectorAll('a[href^="#"]')]
      .map((a) => [a, document.querySelector(a.getAttribute("href"))])
      .filter(([, s]) => s);
    const update = () => {
      let cur = null;
      pairs.forEach(([a, s]) => {
        if (s.getBoundingClientRect().top <= innerHeight * 0.3) cur = a;
      });
      pairs.forEach(([a]) => a.classList.toggle("is-active", a === cur));
    };
    addEventListener("scroll", update, { passive: true });
    update();
  }

  // The phone menu; a link in it closes it.
  const button = document.getElementById("menu-button");
  const menu = document.getElementById("menu");
  if (button && menu) {
    const set = (open) => {
      document.documentElement.classList.toggle("menu-open", open);
      button.setAttribute("aria-expanded", String(open));
    };
    button.addEventListener("click", () => set(!document.documentElement.classList.contains("menu-open")));
    menu.addEventListener("click", (e) => e.target.closest("a") && set(false));
  }

  const idx = document.getElementById("idx");
  if (!idx) return;
  const rows = [...idx.querySelectorAll(".row")];

  // Laptops: a copy of each paper's figure in the pinned column; the
  // hovered (or last opened) paper's shows and plays.
  const preview = document.getElementById("preview");
  const figs = rows.map((r) => {
    const f = r.querySelector("[data-media]").cloneNode(true);
    f.className = "media pv";
    preview.append(f);
    return f;
  });
  const show = (i) =>
    figs.forEach((f, j) => {
      f.classList.toggle("is-shown", i === j);
      if (i === j && !phone.matches) on(f);
      else off(f);
    });
  show(0);

  // Rows open in place.
  const setOpen = (r, open) => {
    r.classList.toggle("is-open", open);
    r.querySelector(".row-head").setAttribute("aria-expanded", String(open));
    r.querySelector(".row-body").hidden = !open;
  };
  rows.forEach((r, i) => {
    const head = r.querySelector(".row-head");
    const body = r.querySelector(".row-body");
    body.id = `paper-${i + 1}`;
    head.setAttribute("aria-controls", body.id);
    if (fine) r.addEventListener("mouseenter", () => show(i));
    head.addEventListener("click", () => {
      setOpen(r, !r.classList.contains("is-open"));
      show(i);
    });
  });
  const all = document.getElementById("all");
  all.addEventListener("click", () => {
    const open = all.getAttribute("aria-pressed") !== "true";
    rows.forEach((r) => setOpen(r, open));
    all.setAttribute("aria-pressed", String(open));
    all.textContent = open ? "Close all" : "Open all";
  });

  // Phones: the first paper starts open, and clips in open rows play while
  // on screen.
  if (phone.matches) setOpen(rows[0], true);
  if (!fine && !still) {
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => (e.isIntersecting ? on(e.target) : off(e.target))),
      { threshold: 0.6 },
    );
    rows.forEach((r) => {
      const f = r.querySelector("[data-media]");
      if (f.querySelector("video")) io.observe(f);
    });
  }
})();
