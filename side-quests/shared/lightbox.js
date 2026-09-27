// Full-screen photo viewer: Lightbox.open([{ src, caption }], index).
// Builds its own <dialog>, so pages don't need any markup for it.
(function () {
  "use strict";

  let dialog, media, caption, prev, next;
  let items = [];
  let index = 0;

  const escapeHtml = (s) => window.Markdown.escapeHtml(s);

  function build() {
    dialog = document.createElement("dialog");
    dialog.className = "lightbox";
    dialog.setAttribute("aria-label", "Photo viewer");
    dialog.innerHTML =
      `<button class="lb-btn lb-close" type="button" aria-label="Close">&times;</button>` +
      `<button class="lb-btn lb-prev" type="button" aria-label="Previous photo">&larr;</button>` +
      `<div class="lb-media"></div>` +
      `<button class="lb-btn lb-next" type="button" aria-label="Next photo">&rarr;</button>` +
      `<p class="lb-caption"></p>`;
    document.body.appendChild(dialog);
    media = dialog.querySelector(".lb-media");
    caption = dialog.querySelector(".lb-caption");
    prev = dialog.querySelector(".lb-prev");
    next = dialog.querySelector(".lb-next");

    dialog.querySelector(".lb-close").addEventListener("click", () => dialog.close());
    prev.addEventListener("click", () => step(-1));
    next.addEventListener("click", () => step(1));
    dialog.addEventListener("click", (ev) => {
      if (ev.target === dialog) dialog.close();
    });
    dialog.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowLeft") step(-1);
      if (ev.key === "ArrowRight") step(1);
    });
    dialog.addEventListener("close", () => {
      media.innerHTML = ""; // stops video playback
    });
  }

  function show() {
    const item = items[index];
    const src = escapeHtml(item.src);
    media.innerHTML = /\.(mp4|webm|mov)$/i.test(item.src)
      ? `<video src="${src}" controls playsinline autoplay></video>`
      : `<img src="${src}" alt="${escapeHtml(item.caption || "")}">`;
    const count = items.length > 1 ? `${index + 1}/${items.length}` : "";
    caption.textContent = [count, item.caption].filter(Boolean).join("   ");
    prev.hidden = next.hidden = items.length < 2;
  }

  function step(delta) {
    index = (index + delta + items.length) % items.length;
    show();
  }

  window.Lightbox = {
    open(list, start) {
      if (!list || !list[start]) return;
      if (!dialog) build();
      items = list;
      index = start;
      show();
      dialog.showModal();
    },
    isOpen: () => !!(dialog && dialog.open),
  };
})();
