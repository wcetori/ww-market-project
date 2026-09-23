"""Download reviewed Commons photos and produce reproducible local WebP variants.

Maintenance only: uv run --with pillow==11.3.0 --python 3.13 scripts/prepare-photos.py
The storefront itself has no Python dependency. Source selection is manual.
"""

import hashlib
import html
import io
import json
import re
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "assets/images/photo-sources.json"
OUTPUT = ROOT / "assets/images/products"
CACHE = ROOT / "tests/artifacts/photo-originals"
LICENSES = ROOT / "assets/images/photo-licenses.json"
USER_AGENT = "WWMarketDemo/1.0 (open-license photographs; local demo storefront)"
OUTPUT.mkdir(parents=True, exist_ok=True)
CACHE.mkdir(parents=True, exist_ok=True)


def plain(value):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]*>", " ", value or ""))).strip()


def download(url):
    for attempt in range(4):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=40) as response:
                data = response.read(30_000_001)
                if len(data) > 30_000_000:
                    raise ValueError("Photo exceeds the 30 MB download limit")
                return data
        except urllib.error.HTTPError as error:
            if error.code not in (429, 502, 503, 504) or attempt == 3:
                raise
            time.sleep(min(30, int(error.headers.get("Retry-After", "15"))))
    raise RuntimeError("Photo download failed")


def main():
    sources = json.loads(SOURCES.read_text(encoding="utf-8"))
    pages = json.loads((ROOT / "assets/images/photo-source-metadata.json").read_text(encoding="utf-8"))
    old_records = json.loads(LICENSES.read_text(encoding="utf-8")) if LICENSES.exists() else []
    records = {record["id"]: record for record in old_records}
    for source in sources:
        asset_id = source["id"]
        if not re.fullmatch(r"[a-z0-9-]+", asset_id):
            raise ValueError("Invalid asset ID")
        if asset_id in records and records[asset_id]["title"] == source["title"] and all((ROOT / file["path"]).exists() for file in records[asset_id]["files"]):
            print(f"Cached: {asset_id}", flush=True)
            continue
        page = next(page for page in pages if page["title"] == source["title"])
        info = page["imageinfo"][0]
        metadata = info["extmetadata"]
        license_name = plain(metadata.get("LicenseShortName", {}).get("value"))
        license_url = metadata.get("LicenseUrl", {}).get("value", "")
        if license_url.startswith("//"):
            license_url = "https:" + license_url
        # Exclude NC, ND, GFDL-only and ambiguous licenses. PD must be a self-release.
        accepted = re.fullmatch(r"CC BY(?:-SA)? (?:2\.0|2\.5|3\.0|4\.0)", license_name) or license_name == "CC0"
        if license_name == "Public domain" and "PD-self" in metadata.get("Categories", {}).get("value", ""):
            accepted = True
            license_url = "https://commons.wikimedia.org/wiki/Template:PD-self"
        if license_name == "CC0":
            license_url = "https://creativecommons.org/publicdomain/zero/1.0/"
        if not accepted or not license_url:
            raise ValueError(f"Unapproved license for {asset_id}: {license_name} {license_url}")
        author = plain(metadata.get("Artist", {}).get("value"))
        if not author:
            raise ValueError(f"Missing photographer: {asset_id}")
        categories = metadata.get("Categories", {}).get("value", "")
        if re.search(r"copyright violations|deletion requests|disputed|missing permission", categories, re.I):
            raise ValueError(f"Source needs additional copyright review: {asset_id}")
        revision_key = hashlib.sha256(source["title"].encode("utf-8")).hexdigest()[:12]
        cache_path = CACHE / f"{asset_id}-{revision_key}.source"
        download_url = info.get("thumburl") or info["url"]
        if cache_path.exists():
            raw = cache_path.read_bytes()
        else:
            raw = download(download_url)
            cache_path.write_bytes(raw)
            time.sleep(1)
        with Image.open(io.BytesIO(raw)) as opened:
            original = ImageOps.exif_transpose(opened).convert("RGBA")
        files = []
        for width in (480, 960):
            height = width * 3 // 4
            resized = original.copy()
            resized.thumbnail((width, height), Image.Resampling.LANCZOS)
            canvas = Image.new("RGB", (width, height), (237, 238, 240))
            canvas.paste(resized, ((width - resized.width) // 2, (height - resized.height) // 2), resized)
            destination = OUTPUT / f"{asset_id}-{width}.webp"
            canvas.save(destination, "WEBP", quality=82, method=6)
            encoded = destination.read_bytes()
            files.append({"path": destination.relative_to(ROOT).as_posix(), "width": width, "height": height, "bytes": len(encoded), "sha256": hashlib.sha256(encoded).hexdigest()})
        records[asset_id] = {
            "id": asset_id,
            "title": page["title"],
            "author": author,
            "authorHtml": metadata.get("Artist", {}).get("value", ""),
            "source": info["descriptionurl"],
            "originalUrl": info["url"],
            "downloadUrl": download_url,
            "license": license_name,
            "licenseUrl": license_url,
            "attribution": plain(metadata.get("Attribution", {}).get("value", "")),
            "credit": plain(metadata.get("Credit", {}).get("value", "")),
            "copyrightNotice": plain(metadata.get("Copyright", {}).get("value", "")),
            "usageTerms": plain(metadata.get("UsageTerms", {}).get("value", "")),
            "restrictions": plain(metadata.get("Restrictions", {}).get("value", "")),
            "retrievedAt": datetime.now(timezone.utc).isoformat(),
            "sourceSha256": hashlib.sha256(raw).hexdigest(),
            "changes": "Resized without cropping; neutral padding added to 4:3; converted to WebP (quality 82); embedded metadata removed. No generated or substituted image content.",
            "files": files,
        }
        LICENSES.write_text(json.dumps(list(records.values()), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Prepared {asset_id}: {sum(file['bytes'] for file in files):,} bytes ({license_name})", flush=True)
    print(f"Done: {len(sources)} photographs, {sum(file['bytes'] for record in records.values() for file in record['files']):,} bytes", flush=True)


if __name__ == "__main__":
    main()
