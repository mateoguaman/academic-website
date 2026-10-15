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
| `side-quests/*/`         | A folder per quest: its page, map and stories        |
| `terms/index.html`       | Terms of Use, linked from the footer and the menu    |
| `LICENSE`                | The license, as the Terms of Use state it            |

## Editing

**CV.** Replace `data/MateoGuaman-CV.pdf` (same name), change the date
after "CV" in the Contact column of `index.html`, and bump the version on
every CV link (`MateoGuaman-CV.pdf?v=2026-10`) so browsers fetch the new file
instead of a cached one:

```sh
grep -rl 'MateoGuaman-CV.pdf?v=' --include=index.html . | xargs sed -i '' 's/?v=2026-10/?v=2027-03/g'
```

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
the `quests` list, linking to its folder. A quest's page uses this
stylesheet plus `side-quests/shared/quest.css` and its own `style.css`; the
quests either side of it are linked by hand in its Side Quests column
(`←`, `→`). Its stories are Markdown files the page fetches, so preview it
through the server rather than from the file (`.nojekyll` keeps GitHub Pages
from turning them into pages).

- *Touching all 26 cantons*, `side-quests/cantons/`: a story per canton in
  `entries/<code>.md`. `touched: yes` shades the canton on the map; `date:`
  takes one or more dates (YYYY-MM-DD, comma-separated). Photos go in
  `photos/`.
- *Every border by bike*, `side-quests/borders/`: put a ride's GPX file in
  `rides/` (its name becomes the ride's link) and run
  `python3 side-quests/borders/build_rides.py`. It finds the borders
  crossed, the distance and the climbing, writes `rides.js`, and starts a
  story in `entries/` with the title and date, which you can change. More in
  `side-quests/borders/README.md`.

**Terms of Use.** `terms/index.html`, after the SGS site's: the design and
code under CC BY 4.0; each paper's images and videos, and the photo, stay
with their owners. Linked at the end of the footer on laptops and at the
end of the menu on phones.

**After changing the design or scripts** (`stylesheet.css`, `site.js`, or
the Side Quests' own `.css`/`.js`), bump their version so browsers fetch the
new file instead of a cached one (the server sends no caching headers, so
browsers otherwise keep old copies for weeks):

```sh
grep -rl '?v=2026-10-15' --include=index.html . | xargs sed -i '' 's/?v=2026-10-15/?v=2026-11-02/g'
```

Analytics: Google Analytics (`G-3ZY845XSCQ`) in the head of every page.
