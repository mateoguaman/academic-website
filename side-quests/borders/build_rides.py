#!/usr/bin/env python3
"""Turn the GPS files in rides/ into rides.js for the borders map.

Usage (from anywhere, Python 3.9+, nothing to install):

    python3 side-quests/borders/build_rides.py

For every rides/<name>.gpx this measures distance and climbing, finds where the
track crosses Switzerland's border (and into which country), simplifies the
track for the map, and writes everything to rides.js. It also creates a story
file entries/<name>.md for each new ride, which you can then edit.
"""

import json
import math
import re
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
RIDES_DIR = HERE / "rides"
ENTRIES_DIR = HERE / "entries"
OUT = HERE / "rides.js"
BORDERS = json.loads((HERE / "data" / "borders.json").read_text())

SIMPLIFY_TOLERANCE = 0.15  # map units (~50 m); keeps the drawn track light
MERGE_CROSSINGS = 2.0  # map units (~700 m); GPS jitter at one crossing counts once
CLIMB_THRESHOLD = 4.0  # metres; ignores altitude noise when adding up climbing
PROFILE_POINTS = 300


# ---------- Projection (the same rotated Mercator as the maps) ----------

_proj = BORDERS["projection"]
_dlam = math.radians(_proj["rotate"][0])
_dphi = math.radians(_proj["rotate"][1])
_cos_dphi, _sin_dphi = math.cos(_dphi), math.sin(_dphi)
_k = _proj["scale"]
_tx, _ty = _proj["translate"]


def project(lon, lat):
    lam = math.radians(lon) + _dlam
    if abs(lam) > math.pi:
        lam -= round(lam / (2 * math.pi)) * 2 * math.pi
    phi = math.radians(lat)
    x = math.cos(lam) * math.cos(phi)
    y = math.sin(lam) * math.cos(phi)
    z = math.sin(phi)
    lam2 = math.atan2(y, x * _cos_dphi - z * _sin_dphi)
    phi2 = math.asin(max(-1.0, min(1.0, z * _cos_dphi + x * _sin_dphi)))
    return (_tx + _k * lam2, _ty - _k * math.log(math.tan(math.pi / 4 + phi2 / 2)))


# ---------- Reading GPX ----------

def read_gpx(path):
    """Returns (name, date, segments), each segment a list of (lon, lat, ele|None)."""
    root = ET.parse(path).getroot()
    name = None
    for el in root.iter():
        if el.tag.endswith("}name") or el.tag == "name":
            if el.text and el.text.strip():
                name = el.text.strip()
                break

    first_time = None
    for el in root.iter():
        if (el.tag.endswith("}time") or el.tag == "time") and el.text:
            first_time = el.text.strip()
            break

    segments = []
    for seg in root.iter():
        tag = seg.tag.split("}")[-1]
        if tag not in ("trkseg", "rte"):
            continue
        pts = []
        for pt in seg:
            if pt.tag.split("}")[-1] not in ("trkpt", "rtept"):
                continue
            try:
                lon, lat = float(pt.get("lon")), float(pt.get("lat"))
            except (TypeError, ValueError):
                continue
            ele = None
            for child in pt:
                if child.tag.split("}")[-1] == "ele" and child.text:
                    try:
                        ele = float(child.text)
                    except ValueError:
                        pass
            pts.append((lon, lat, ele))
        if len(pts) >= 2:
            segments.append(pts)

    return name, local_date(first_time), segments


def local_date(iso):
    """GPX times are UTC; the ride date is the date in Switzerland."""
    if not iso:
        return None
    try:
        t = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return iso[:10] if re.match(r"\d{4}-\d{2}-\d{2}", iso) else None
    if t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    try:
        from zoneinfo import ZoneInfo

        t = t.astimezone(ZoneInfo("Europe/Zurich"))
    except Exception:
        pass
    return t.date().isoformat()


# ---------- Measuring ----------

def haversine_km(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371.0088 * math.asin(math.sqrt(h))


def climbing(eles):
    """Metres climbed, counting only rises bigger than CLIMB_THRESHOLD."""
    total, ref = 0.0, None
    for e in eles:
        if e is None:
            continue
        if ref is None:
            ref = e
        elif e - ref >= CLIMB_THRESHOLD:
            total += e - ref
            ref = e
        elif ref - e >= CLIMB_THRESHOLD:
            ref = e
    return total


def profile(segments, projected):
    """[[km, metres, x, y], ...] resampled to about PROFILE_POINTS points. x, y is
    where that point is on the map, so the page can follow the profile on the map."""
    pts, dist = [], 0.0
    for seg, proj in zip(segments, projected):
        prev = None
        for p, (x, y) in zip(seg, proj):
            if prev is not None:
                dist += haversine_km(prev, p)
            prev = p
            if p[2] is not None:
                pts.append((dist, p[2], x, y))
    if len(pts) < 2:
        return []
    step = max(dist / PROFILE_POINTS, 1e-9)
    out, next_km = [], 0.0
    fmt = lambda km, ele, x, y: [round(km, 2), round(ele), round(x, 1), round(y, 1)]
    for pt in pts:
        if pt[0] >= next_km:
            out.append(fmt(*pt))
            next_km = pt[0] + step
    if out[-1][0] != round(pts[-1][0], 2):
        out.append(fmt(*pts[-1]))
    return out


def simplify(points, tol):
    """Ramer–Douglas–Peucker on projected points."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        i, j = stack.pop()
        (ax, ay), (bx, by) = points[i], points[j]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy)
        best, best_d = None, tol
        for k in range(i + 1, j):
            px, py = points[k]
            d = abs(dy * (px - ax) - dx * (py - ay)) / norm if norm else math.hypot(px - ax, py - ay)
            if d > best_d:
                best, best_d = k, d
        if best is not None:
            keep[best] = True
            stack += [(i, best), (best, j)]
    return [p for p, k in zip(points, keep) if k]


# ---------- Border crossings ----------

CELL = 5.0
_grid = {}
for country, lines in BORDERS["stretches"].items():
    for line in lines:
        for a, b in zip(line, line[1:]):
            x0, x1 = sorted((a[0], b[0]))
            y0, y1 = sorted((a[1], b[1]))
            for gx in range(int(x0 // CELL), int(x1 // CELL) + 1):
                for gy in range(int(y0 // CELL), int(y1 // CELL) + 1):
                    _grid.setdefault((gx, gy), []).append((a, b, country))


def _intersect(p, q, a, b):
    """Intersection point of segments p-q and a-b, or None."""
    rx, ry = q[0] - p[0], q[1] - p[1]
    sx, sy = b[0] - a[0], b[1] - a[1]
    den = rx * sy - ry * sx
    if abs(den) < 1e-12:
        return None
    t = ((a[0] - p[0]) * sy - (a[1] - p[1]) * sx) / den
    u = ((a[0] - p[0]) * ry - (a[1] - p[1]) * rx) / den
    if 0 <= t <= 1 and 0 <= u <= 1:
        return (p[0] + t * rx, p[1] + t * ry)
    return None


def crossings(projected_segments):
    found = []
    for seg in projected_segments:
        for p, q in zip(seg, seg[1:]):
            x0, x1 = sorted((p[0], q[0]))
            y0, y1 = sorted((p[1], q[1]))
            seen = set()
            for gx in range(int(x0 // CELL), int(x1 // CELL) + 1):
                for gy in range(int(y0 // CELL), int(y1 // CELL) + 1):
                    for a, b, country in _grid.get((gx, gy), ()):
                        key = (a[0], a[1], b[0], b[1])
                        if key in seen:
                            continue
                        seen.add(key)
                        hit = _intersect(p, q, a, b)
                        if hit:
                            found.append((country, hit))
    merged = []
    for country, (x, y) in found:
        if not any(c == country and math.hypot(x - mx, y - my) < MERGE_CROSSINGS for c, mx, my in merged):
            merged.append((country, x, y))
    return [{"country": c, "x": round(x, 1), "y": round(y, 1)} for c, x, y in merged]


# ---------- Output ----------

def path_d(projected_segments):
    return "".join("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in seg) for seg in projected_segments)


STUB = """---
title: {title}
date: {date}
place:
borders:
---

<!--
Write about this ride below in Markdown. Title and date came from the GPS file;
change them freely. Border crossings are found automatically from the track;
list extra ones under "borders:" (e.g. "FR, DE") if one was missed.

Photos go in side-quests/borders/photos/. Add one on its own line, using the
caption as the alt text:  ![Caption](photos/{id}-something.jpg)
Photos on consecutive lines (no blank line between them) become a grid.
-->
"""


def ride_id(path):
    return re.sub(r"[^a-z0-9]+", "-", path.stem.lower()).strip("-") or "ride"


def main():
    files = sorted(RIDES_DIR.glob("*.gpx")) + sorted(RIDES_DIR.glob("*.GPX"))
    rides, frame = [], BORDERS["frame"]
    ENTRIES_DIR.mkdir(exist_ok=True)

    for f in files:
        rid = ride_id(f)
        try:
            name, date, segments = read_gpx(f)
        except ET.ParseError as e:
            print(f"  skipped {f.name}: not a readable GPX file ({e})")
            continue
        if not segments:
            print(f"  skipped {f.name}: no track points")
            continue

        distance = sum(haversine_km(a, b) for seg in segments for a, b in zip(seg, seg[1:]))
        climb = sum(climbing([p[2] for p in seg]) for seg in segments)
        eles = [p[2] for seg in segments for p in seg if p[2] is not None]
        projected = [[project(p[0], p[1]) for p in seg] for seg in segments]
        found = crossings(projected)
        drawn = [simplify(seg, SIMPLIFY_TOLERANCE) for seg in projected]

        xs = [x for seg in projected for x, _ in seg]
        ys = [y for seg in projected for _, y in seg]
        bbox = [round(min(xs), 1), round(min(ys), 1), round(max(xs), 1), round(max(ys), 1)]
        if bbox[0] < frame[0] or bbox[1] < frame[1] or bbox[2] > frame[2] or bbox[3] > frame[3]:
            print(f"  note: {f.name} goes beyond the mapped area; the map data needs a wider frame")

        title = name or f.stem.replace("-", " ").replace("_", " ").strip().capitalize()
        rides.append({
            "id": rid,
            "file": f.name,
            "title": title,
            "date": date,
            "distanceKm": round(distance, 1),
            "climbM": round(climb),
            "highestM": round(max(eles)) if eles else None,
            "borders": sorted({c["country"] for c in found}),
            "crossings": found,
            "bbox": bbox,
            "path": path_d(drawn),
            "profile": profile(segments, projected),
        })

        entry = ENTRIES_DIR / f"{rid}.md"
        if not entry.exists():
            entry.write_text(STUB.format(title=title, date=date or "", id=rid))
            print(f"  new story file: entries/{entry.name}")

        points = sum(len(s) for s in segments)
        kept = sum(len(s) for s in drawn)
        borders = ", ".join(sorted({c["country"] for c in found})) or "none"
        print(f"  {f.name}: {distance:.1f} km, {climb:.0f} m climbing, borders {borders}, {points} -> {kept} points")

    rides.sort(key=lambda r: (r["date"] or "", r["id"]))
    body = ",\n".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in rides)
    OUT.write_text(
        "// Generated by build_rides.py from the GPS files in rides/. Do not edit by hand;\n"
        "// run `python3 side-quests/borders/build_rides.py` after adding or changing a ride.\n"
        f"window.RIDES = [\n{body}\n];\n"
    )
    print(f"Wrote {OUT.relative_to(HERE.parent.parent)} with {len(rides)} ride(s).")


if __name__ == "__main__":
    sys.exit(main())
