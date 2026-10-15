# mateoguaman.com

My academic website: one static page, no build step. Open `index.html` in a
browser to preview it, or serve the folder:

```sh
python3 -m http.server 8000 --bind 127.0.0.1   # then http://localhost:8000
```

| File                     | What it is                                           |
| ------------------------ | ---------------------------------------------------- |
| `index.html`             | All the content                                      |
| `stylesheet.css`         | The design                                           |
| `site.js`                | Behaviour only: rows opening, the pinned clip, menu  |
| `media/`                 | Square stills (`.jpg`) and clips (`.mp4`) per paper  |
| `data/`                  | The CV                                               |
| `side-quests/index.html` | The Side Quests page, linked from the footer         |

## Editing

**CV.** Replace `data/MateoGuaman-CV.pdf` (same name), then change the date
after "CV" in the Contact column of `index.html` (`Oct. 2025`).

**Bio and research.** The About, Previously, Research and Contact columns
are near the top of `index.html`.

**A paper.** Publications are grouped by research thread. Each paper is one
`<li class="row">` block; copy one, change its text, and keep the order
newest first within a thread. A row has:

- the line that is always shown: year, short title, short venue;
- the block that opens: a square figure, the full title (linked), authors
  (yourself as `<span class="me">`), the full venue, an award or oral line,
  one sentence, and links.

The figure is a square still in `media/`, plus optionally a second image
shown on hover (`m-alt`) or a clip (`m-video`, loaded only when it plays):

```html
<figure class="media row-media" data-media>
  <img class="m-still" src="media/sgs.jpg" alt="" loading="lazy">
  <video class="m-video" muted loop playsinline preload="none" data-src="media/sgs.mp4"></video>
</figure>
```

Keep stills about 720 px square and clips about 480 px square and under a
megabyte or so, for example:

```sh
ffmpeg -i in.mp4 -t 10 -vf "crop='min(iw,ih)':'min(iw,ih)',scale=480:480" -an -c:v libx264 -crf 26 \
  -pix_fmt yuv420p -movflags +faststart media/name.mp4
ffmpeg -ss 2 -i media/name.mp4 -frames:v 1 -q:v 3 media/name.jpg
```

The first paper's clip plays when the page opens: pinned on the right on
laptops, and with that paper open on phones.

**Awards and orals.** Put a tag right after the short title, with no space,
and the full wording as a line in the open block:

```html
<span class="row-title">VAMOS<span class="tag" title="Oral at ...">Oral</span></span>
...
<p class="row-award">Oral at ...</p>
```

**A thread.** Each thread starts with a divider row (number, name, years);
update its years when you add a paper. The `id` is its link
(`#nav`, `#scale`, ...).

**Side Quests.** Edit `side-quests/index.html`; each quest is an `<li>` in
the `quests` list.

Analytics: Google Analytics (`G-3ZY845XSCQ`) in the head of both pages.
