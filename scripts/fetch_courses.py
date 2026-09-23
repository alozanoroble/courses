"""Build site/courses.json from the curated list in scripts/data-courses.json.

    python3 scripts/fetch_courses.py

Run daily by .github/workflows/pages.yml. If YouTube refuses a playlist, the
entry already in site/courses.json (the committed copy) is kept, so a bad
fetch never empties a course.

No API key: reads each playlist's public page (ytInitialData) and follows
its continuation tokens through the youtubei endpoint, so playlists longer
than 100 videos come back whole. Standard library only.
"""
import json
import pathlib
import re
import sys
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONFIG = ROOT / "scripts" / "data-courses.json"
OUT = ROOT / "site" / "courses.json"
UA = {"User-Agent": "Mozilla/5.0", "Accept-Language": "en-US"}


def get(url, body=None):
    req = urllib.request.Request(url, body, {**UA, **({"Content-Type": "application/json"} if body else {})})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8")


def walk(o, key):
    if isinstance(o, dict):
        if key in o:
            yield o[key]
        for v in o.values():
            yield from walk(v, key)
    elif isinstance(o, list):
        for v in o:
            yield from walk(v, key)


def text(t):
    if not t:
        return ""
    return t.get("simpleText") or "".join(r.get("text", "") for r in t.get("runs", []))


def videos_from(data):
    vids = []
    # Older page layout
    for v in walk(data, "playlistVideoRenderer"):
        if not v.get("isPlayable", True) or "videoId" not in v:
            continue  # private or deleted entries
        vids.append({"id": v["videoId"], "title": text(v.get("title")),
                     "length": text(v.get("lengthText")) or None})
    # Current layout (2026): each video is a lockupViewModel
    for l in walk(data, "lockupViewModel"):
        if l.get("contentType") != "LOCKUP_CONTENT_TYPE_VIDEO":
            continue
        title = l.get("metadata", {}).get("lockupMetadataViewModel", {}).get("title", {}).get("content", "")
        badge = next((b.get("text") for b in walk(l, "thumbnailBadgeViewModel")
                      if re.fullmatch(r"[\d:]+", b.get("text") or "")), None)
        vids.append({"id": l["contentId"], "title": title, "length": badge})
    return vids


def seconds(length):
    """'1:02:03' -> 3723; None -> 0."""
    total = 0
    for part in (length or "").split(":"):
        total = total * 60 + (int(part) if part.isdigit() else 0)
    return total


def tokens(data):
    return [c["continuationEndpoint"]["continuationCommand"]["token"]
            for c in walk(data, "continuationItemRenderer")
            if "continuationEndpoint" in c and "continuationCommand" in c["continuationEndpoint"]]


def playlist(pid):
    html = get(f"https://www.youtube.com/playlist?list={pid}&hl=en")
    key = re.search(r'"INNERTUBE_API_KEY":"([^"]+)"', html).group(1)
    ver = re.search(r'"INNERTUBE_CLIENT_VERSION":"([^"]+)"', html).group(1)
    data = json.loads(re.search(r"var ytInitialData = (\{.*?\});</script>", html, re.S).group(1))
    title = next((text(h.get("title")) for h in walk(data, "playlistHeaderRenderer")), "") \
        or next((m.get("title") for m in walk(data, "playlistMetadataRenderer")), "")
    desc = next((m.get("description", "") for m in walk(data, "playlistMetadataRenderer")), "")
    m = re.search(r'"accessibilityText":"([\d,]+) (?:videos?|lessons?)"', html) \
        or re.search(r'"(?:text|content)":"([\d,]+) (?:videos?|lessons?)"', html)
    expected = int(m.group(1).replace(",", "")) if m else None
    vids, todo = videos_from(data), tokens(data)
    while todo:
        body = json.dumps({"context": {"client": {"clientName": "WEB", "clientVersion": ver, "hl": "en"}},
                           "continuation": todo.pop(0)}).encode()
        more = json.loads(get(f"https://www.youtube.com/youtubei/v1/browse?key={key}", body))
        vids += videos_from(more)
        todo += tokens(more)
    if expected is not None and len(vids) < expected:
        print(f"  ! {pid}: got {len(vids)} of {expected} videos (some may be private)", file=sys.stderr)
    return {"title": title, "description": desc.strip(), "videos": vids}


def main():
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    previous = {}
    if OUT.exists():
        for g in json.loads(OUT.read_text(encoding="utf-8")).get("groups", []):
            for c in g["courses"]:
                previous[c["id"]] = c["videos"]
    groups, failures = [], 0
    for g in cfg["groups"]:
        courses = []
        for c in g["courses"]:
            p = {"title": "", "description": "", "videos": []}
            for attempt in range(3):  # YouTube occasionally serves a page without ytInitialData
                try:
                    p = playlist(c["id"])
                    break
                except Exception as e:  # network, consent page, layout change
                    print(f"  ! {c['id']} (try {attempt + 1}): {e.__class__.__name__}: {e}", file=sys.stderr)
                    time.sleep(3 * (attempt + 1))
            if not p["videos"] and previous.get(c["id"]):
                failures += 1
                p["videos"] = previous[c["id"]]
                print(f"  ! {c['id']}: kept previous {len(p['videos'])} videos", file=sys.stderr)
            if not p["videos"]:
                print(f"  ! {c['id']} has no playable videos, skipped", file=sys.stderr)
                continue
            courses.append({"id": c["id"], "title": c.get("title") or p["title"],
                            "by": c.get("by"), "year": c.get("year"),
                            "description": c.get("description") or p["description"],
                            "videos": p["videos"]})
            print(f"  {len(p['videos']):4d}  {courses[-1]['title']}", file=sys.stderr)
            time.sleep(0.4)
        if g.get("sort") == "length":  # longest first, by total running time
            courses.sort(key=lambda c: -sum(seconds(v["length"]) for v in c["videos"]))
        groups.append({"name": g["name"], "note": g.get("note", ""), "courses": courses})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"generated": time.strftime("%Y-%m-%d"), "groups": groups},
                              ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({failures} playlists fell back to the previous copy)", file=sys.stderr)


if __name__ == "__main__":
    main()
