from PIL import Image, ImageOps, ImageEnhance
import io, json, os, requests

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PUBLIC = os.path.join(ROOT, "public")
API = "https://commons.wikimedia.org/w/api.php"
HEADERS = {"User-Agent": "WallHaze/1.0 (local media preparation; contact: project owner)"}

SOURCES = {
    "sakura2": {
        "title": "File:Cherry blossom against blue sky (Unsplash).jpg",
        "outputs": [
            ("tablet", "images/wallpapers/sakura-dream.jpg", 1080, 1440, (0.34, 0.5)),
            ("video", "videos/live-demos/night-sakura-frame.jpg", 720, 1280, (0.32, 0.5)),
        ],
    },
    "carina": {
        "title": "File:Carina Nebula in Hubble Palette Rasa 8 ORIGINAL unsharpened.jpg",
        "outputs": [
            ("style-tablet", "images/styles/starry-galaxy.jpg", 1080, 1440, (0.5, 0.5)),
            ("desktop", "images/wallpapers/nebula-drift.jpg", 1920, 1080, (0.35, 0.5)),
            ("video", "videos/live-demos/star-drift-frame.jpg", 1280, 720, (0.5, 0.5)),
        ],
    },
    "mountain1": {
        "title": "File:Mountain Lake at Night (30608832416).jpg",
        "outputs": [
            ("style-tablet", "images/styles/mountain-lake.jpg", 1080, 1440, (0.5, 0.55)),
        ],
    },
    "mountain2": {
        "title": "File:Mountain Lake at Night (30557164961).jpg",
        "outputs": [
            ("desktop", "images/wallpapers/stillwater-night.jpg", 1920, 1080, (0.5, 0.55)),
        ],
    },
    "jelly2": {
        "title": "File:Lion's mane jellyfish in Gullmarn fjord at Sämstad 3.jpg",
        "outputs": [
            ("style-tablet", "images/styles/deep-ocean.jpg", 1080, 1440, (0.52, 0.48)),
            ("video", "videos/live-demos/jellyfish-glow-frame.jpg", 1024, 1024, (0.52, 0.48)),
        ],
    },
    "jelly3": {
        "title": "File:Lion's mane jellyfish in Gullmarn fjord at Sämstad 8.jpg",
        "outputs": [
            ("desktop", "images/wallpapers/jellyfish-deep.jpg", 1920, 1080, (0.5, 0.48)),
        ],
    },
    "aurora1": {
        "title": "File:Lofoten, Norway (Unsplash).jpg",
        "outputs": [
            ("style-tablet", "images/styles/aurora-nights.jpg", 1080, 1440, (0.5, 0.5)),
        ],
    },
    "aurora2": {
        "title": "File:Polar lights over dark trees (Unsplash).jpg",
        "outputs": [
            ("desktop", "images/wallpapers/aurora-veil.jpg", 1920, 1080, (0.5, 0.5)),
            ("video", "videos/live-demos/aurora-veil-frame.jpg", 1280, 720, (0.5, 0.5)),
        ],
    },
    "arch_interior": {
        "title": "File:Minimalist office decor at 1540 7th St (Unsplash).jpg",
        "outputs": [
            ("style-tablet", "images/styles/architecture-minimal.jpg", 1080, 1440, (0.73, 0.5)),
        ],
    },
    "arch_bridge": {
        "title": "File:Queens Bridge. Melbourne.Aust. (21793578980).jpg",
        "outputs": [
            ("desktop", "images/wallpapers/quiet-bridge.jpg", 1920, 1080, (0.55, 0.5)),
        ],
    },
    "macro3": {
        "title": "File:Dew on a thin leaf in macro (Unsplash).jpg",
        "outputs": [
            ("style-tablet", "images/styles/macro-nature.jpg", 1080, 1440, (0.5, 0.5)),
        ],
    },
    "forest2": {
        "title": "File:Sunrise breaking into the forest (Unsplash).jpg",
        "outputs": [
            ("desktop", "images/wallpapers/forest-rays.jpg", 1920, 1080, (0.5, 0.45)),
            ("video", "videos/live-demos/forest-light-frame.jpg", 1280, 720, (0.5, 0.45)),
        ],
    },
    "train1": {
        "title": "File:Sunset Bruges station.JPG",
        "outputs": [
            ("desktop", "images/wallpapers/sunset-platform.jpg", 1920, 1080, (0.5, 0.55)),
            ("video", "videos/live-demos/sunset-station-frame.jpg", 1280, 720, (0.5, 0.55)),
        ],
    },
    "poppy": {
        "title": "File:Poppy field, Oberauroff, detail.jpg",
        "outputs": [
            ("tablet", "images/wallpapers/poppy-field.jpg", 1080, 1440, (0.5, 0.45)),
            ("video", "videos/live-demos/flower-field-frame.jpg", 720, 1280, (0.5, 0.45)),
        ],
    },
    "hongkong2": {
        "title": "File:Hong Kong in the night.jpg",
        "outputs": [
            ("desktop", "images/wallpapers/hong-kong-rain.jpg", 1920, 1080, (0.5, 0.5)),
            ("video", "videos/live-demos/neon-rain-frame.jpg", 720, 1280, (0.48, 0.5)),
        ],
    },
}

def strip_html(value):
    return (value or "").replace("<", " <").split("<")[0].strip()

def fetch_metadata(titles):
    params = {
        "action": "query",
        "titles": "|".join(titles),
        "prop": "imageinfo",
        "iiprop": "url|size|extmetadata",
        "iiurlwidth": "1920",
        "format": "json",
    }
    response = requests.get(API, params=params, headers=HEADERS, timeout=60)
    response.raise_for_status()
    pages = response.json().get("query", {}).get("pages", {})
    by_title = {}
    for page in pages.values():
        info = (page.get("imageinfo") or [{}])[0]
        meta = info.get("extmetadata") or {}
        by_title[page.get("title")] = {
            "url": info.get("url"),
            "thumbUrl": info.get("thumburl"),
            "width": info.get("width"),
            "height": info.get("height"),
            "license": meta.get("LicenseShortName", {}).get("value"),
            "licenseUrl": meta.get("LicenseUrl", {}).get("value"),
            "author": strip_html(meta.get("Artist", {}).get("value")),
            "descriptionUrl": info.get("descriptionurl"),
            "credit": strip_html(meta.get("Credit", {}).get("value")),
        }
    return by_title

metadata = fetch_metadata([source["title"] for source in SOURCES.values()])
manifest = []

for key, source in SOURCES.items():
    meta = metadata.get(source["title"])
    if not meta or not meta.get("url"):
        raise SystemExit(f"missing metadata: {source['title']}")
    license_name = meta.get("license") or ""
    if not any(token in license_name.lower() for token in ("cc0", "public domain", "pd")):
        raise SystemExit(f"license rejected for {source['title']}: {license_name}")
    print(f"download {key}: {source['title']} ({meta['width']}x{meta['height']}, {license_name})")
    import time
    time.sleep(1.0)
    source_url = meta.get("thumbUrl") or meta["url"]
    import time
    cache_dir = os.path.join(os.environ.get("TEMP", "/tmp"), "wallhaze-photo-cache")
    os.makedirs(cache_dir, exist_ok=True)
    cache_path = os.path.join(cache_dir, key + ".jpg")
    if os.path.exists(cache_path):
        image = ImageOps.exif_transpose(Image.open(cache_path)).convert("RGB")
    else:
        response = None
        for attempt in range(4):
            response = requests.get(source_url, headers=HEADERS, timeout=60)
            if response.status_code < 400:
                break
            time.sleep(4 + attempt * 3)
        response.raise_for_status()
        with open(cache_path, "wb") as handle:
            handle.write(response.content)
        image = ImageOps.exif_transpose(Image.open(io.BytesIO(response.content))).convert("RGB")
    for role, relative, width, height, centering in source["outputs"]:
        fitted = ImageOps.fit(image, (width, height), method=Image.LANCZOS, centering=centering)
        fitted = ImageEnhance.Color(fitted).enhance(1.04)
        fitted = ImageEnhance.Contrast(fitted).enhance(1.025)
        if key == "sakura2":
            fitted = ImageEnhance.Brightness(fitted).enhance(0.82)
            fitted = ImageEnhance.Color(fitted).enhance(1.12)
            twilight = Image.new("RGB", fitted.size, (38, 20, 74))
            fitted = Image.blend(fitted, twilight, 0.18)
        if key in ("mountain1", "mountain2"):
            fitted = ImageEnhance.Brightness(fitted).enhance(1.32)
            fitted = ImageEnhance.Contrast(fitted).enhance(1.08)
            fitted = ImageEnhance.Color(fitted).enhance(1.15)
        path = os.path.join(PUBLIC, relative)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        fitted.save(path, "JPEG", quality=92, optimize=True, progressive=True)
        manifest.append({
            "key": key,
            "role": role,
            "sourceTitle": source["title"],
            "sourcePage": meta["descriptionUrl"],
            "sourceUrl": source_url,
            "license": license_name,
            "licenseUrl": meta["licenseUrl"],
            "author": meta["author"],
            "originalWidth": meta["width"],
            "originalHeight": meta["height"],
            "output": "/" + relative.replace(os.sep, "/"),
            "outputWidth": width,
            "outputHeight": height,
            "crop": {
                "method": "center-weighted cover crop, no stretch",
                "centering": list(centering),
            },
            "modifications": "cover crop + slight saturation/contrast adjustment",
            "aiGenerated": False,
        })

path = os.path.join(os.path.dirname(__file__), "photo-manifest.json")
with open(path, "w", encoding="utf-8") as handle:
    json.dump(manifest, handle, indent=2, ensure_ascii=False)
print(f"wrote {len(manifest)} outputs to {path}")
