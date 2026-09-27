// A small Markdown renderer for the canton stories.
//
// Supports: paragraphs, # headings, **bold**, *italic*, `code`, [links](url),
// lists, > quotes, --- rules, raw HTML blocks, and images. A paragraph made up
// only of images becomes a figure (one image) or a grid (several), using the
// alt text as the caption.
(function () {
  "use strict";

  const IMAGE = /!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;
  const IMAGES_ONLY = /^(?:\s*!\[[^\]]*\]\(\s*[^)\s]+(?:\s+"[^"]*")?\s*\)\s*)+$/;
  const BLOCK_START = /^(#{1,6}\s|>|\s*[-*+]\s|\s*\d+[.)]\s|(-{3,}|\*{3,})\s*$)/;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]
    );
  }

  function inline(s) {
    const code = [];
    s = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${code.push(c) - 1}\u0000`);
    // A stray "<" (e.g. "<3") would otherwise start a tag.
    s = s.replace(/<(?![a-zA-Z\/!])/g, "&lt;");
    s = s.replace(IMAGE, (_, alt, src) => `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">`);
    s = s.replace(/\[([^\]]+)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g, (_, text, href) => `<a href="${escapeHtml(href)}">${text}</a>`);
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, "$1<em>$2</em>");
    s = s.replace(/(^|[\s(])_(?!\s)(.+?)_(?!\w)/g, "$1<em>$2</em>");
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${escapeHtml(code[i])}</code>`);
  }

  // Returns { html, media: [{ src, caption }] }. Figures carry data-index into media.
  function render(src) {
    const media = [];
    const lines = src.replace(/\r\n?/g, "\n").replace(/<!--[\s\S]*?-->/g, "").split("\n");
    const out = [];
    let i = 0;

    const blank = (l) => !l.trim();

    function figure(img) {
      const index = media.push(img) - 1;
      const isVideo = /\.(mp4|webm|mov)$/i.test(img.src);
      const tag = isVideo
        ? `<video src="${escapeHtml(img.src)}#t=0.1" muted playsinline preload="metadata"></video>`
        : `<img src="${escapeHtml(img.src)}" alt="${escapeHtml(img.caption)}" loading="lazy">`;
      return (
        `<figure class="photo">` +
        `<button class="photo-open" type="button" data-index="${index}" aria-label="Open ${isVideo ? "video" : "photo"} full size">${tag}</button>` +
        (img.caption ? `<figcaption>${inline(img.caption)}</figcaption>` : "") +
        `</figure>`
      );
    }

    function list(pattern, tag) {
      const items = [];
      while (i < lines.length && !blank(lines[i])) {
        const m = lines[i].match(pattern);
        if (m) items.push(m[1]);
        else if (items.length) items[items.length - 1] += " " + lines[i].trim();
        i++;
      }
      out.push(`<${tag}>${items.map((it) => `<li>${inline(it)}</li>`).join("")}</${tag}>`);
    }

    while (i < lines.length) {
      const line = lines[i];
      let m;

      if (blank(line)) {
        i++;
      } else if ((m = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/))) {
        const level = m[1].length <= 2 ? 3 : 4; // the canton name is the page's h2
        out.push(`<h${level}>${inline(m[2])}</h${level}>`);
        i++;
      } else if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
        out.push("<hr>");
        i++;
      } else if (/^>/.test(line)) {
        const quote = [];
        while (i < lines.length && /^>/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ""));
        const inner = render(quote.join("\n"));
        out.push(`<blockquote>${inner.html}</blockquote>`);
      } else if (/^\s*[-*+]\s+/.test(line)) {
        list(/^\s*[-*+]\s+(.*)$/, "ul");
      } else if (/^\s*\d+[.)]\s+/.test(line)) {
        list(/^\s*\d+[.)]\s+(.*)$/, "ol");
      } else if (/^\s*<[a-zA-Z\/!]/.test(line)) {
        const html = [];
        while (i < lines.length && !blank(lines[i])) html.push(lines[i++]);
        out.push(html.join("\n"));
      } else {
        const para = [line];
        i++;
        while (i < lines.length && !blank(lines[i]) && !BLOCK_START.test(lines[i])) para.push(lines[i++]);
        const text = para.join("\n");

        if (IMAGES_ONLY.test(text)) {
          const imgs = [...text.matchAll(IMAGE)].map((mm) => ({ caption: mm[1].trim(), src: mm[2] }));
          if (imgs.length === 1) {
            out.push(figure(imgs[0]));
          } else {
            const cols = imgs.length === 2 || imgs.length === 4 ? 2 : 3;
            out.push(`<div class="gallery cols-${cols}">${imgs.map(figure).join("")}</div>`);
          }
        } else {
          out.push(`<p>${inline(para.map((l) => l.trim()).join(" "))}</p>`);
        }
      }
    }

    return { html: out.join("\n"), media };
  }

  // Splits a "--- key: value ---" header off the top of a file.
  function parseFrontMatter(text) {
    text = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
    const m = text.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
    const meta = {};
    if (!m) return { meta, body: text };
    for (const line of m[1].split("\n")) {
      const idx = line.indexOf(":");
      if (idx < 1) continue;
      const key = line.slice(0, idx).trim().toLowerCase();
      const value = line.slice(idx + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
      if (value) meta[key] = value;
    }
    return { meta, body: text.slice(m[0].length) };
  }

  window.Markdown = { render, parseFrontMatter, escapeHtml };
})();
