# Every border by bike

## Adding a ride

1. Export the ride as a GPX file:
   - Strava: open the activity, `⋯` → *Export GPX*
   - Garmin Connect: open the activity, gear icon → *Export to GPX*
   - Komoot: open the tour → *Download* → *GPX*
2. Put it in `rides/`. The file name becomes the ride's link (`rides/basel-loop.gpx` → `#basel-loop`).
3. From the repository folder, run:

   ```sh
   python3 side-quests/borders/build_rides.py
   ```

   This needs Python 3.9 or newer and nothing else. It measures distance and climbing, finds the
   border crossings, writes `rides.js`, and creates `entries/<name>.md` for each new ride.
4. Write the story in `entries/<name>.md` (Markdown, like the cantons page). Photos go in `photos/`.
5. Commit and push. The GPX files are published with the site.

Rerun the script whenever you add, replace or delete a GPX file. It never overwrites a story you
have written.

## What the script decides

- **Borders crossed:** wherever the track crosses Switzerland's border, using the Swiss federal
  (BFS) boundary. If one is missed (a ferry, a patchy recording), list it in the story file:
  `borders: FR, DE`.
- **Date:** the first timestamp in the file, as a Swiss date. Override it with `date:` in the
  story file, which also accepts several dates, comma-separated.
- **Title:** the name inside the GPX file, else the file name. Override it with `title:`.
- **Climbing:** adds up rises of 4 m or more, to ignore altitude noise. It will differ a little
  from what Strava or Garmin report.

## Generated files (don't edit by hand)

- `rides.js`: written by `build_rides.py`.
- `map-data.js` and `data/borders.json`: the map and the border lines, built from swiss-maps
  (BFS GEOSTAT) and Natural Earth. They cover Switzerland plus about 80 km around it; the script
  prints a note if a ride goes beyond that.
