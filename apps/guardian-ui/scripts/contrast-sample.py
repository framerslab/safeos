"""Measure the visible words and edges in the exported home screenshots."""

import argparse
from collections import Counter
import json
from math import ceil, floor, log
from pathlib import Path
from statistics import median

from PIL import Image


FLOORS = {"body": (12, 18), "label": (7, 16), "glyph": (4.5, 0), "edge": (4.5, 0)}
DISCLOSURES = ("motion", "sound", "people-animals", "lost-found", "offline", "storage")


def linear(channel):
    value = channel / 255
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


LUMINANCE = [linear(channel) for channel in range(256)]


def luminance(rgb):
    return sum(LUMINANCE[channel] * weight for channel, weight in zip(rgb, (0.2126, 0.7152, 0.0722)))


def contrast(first, second):
    return (max(first, second) + 0.05) / (min(first, second) + 0.05)


def sample_pixels(image, bounds, kind):
    crop = image.crop(bounds)
    pixels = list(crop.getdata())
    population = Counter(pixels)
    ground = luminance(population.most_common(1)[0][0])
    light = [luminance(pixel) for pixel in pixels]
    ratios = [contrast(ground, value) for value in light]
    lighter = sum(value >= ground and ratio >= 1.5 for value, ratio in zip(light, ratios))
    darker = sum(value < ground and ratio >= 1.5 for value, ratio in zip(light, ratios))
    ink = [
        (index, ratio) for index, ratio in enumerate(ratios)
        if ratio >= 1.5 and (light[index] >= ground) == (lighter >= darker)
    ]
    if kind in {"body", "label"}:
        # A long run of nearly solid pixels at the bottom is an underline.
        rows = Counter(index // crop.width for index, _ in ink)
        ink = [
            (index, ratio) for index, ratio in ink
            if rows[index // crop.width] < crop.width * 0.85
            or index // crop.width < crop.height * 0.75
        ]
    if len(ink) < 3:
        raise ValueError("no readable strokes")
    strength = sorted((ratio for _, ratio in ink), reverse=True)
    core = median(strength[:max(1, round(len(strength) * 0.04))])
    strokes = [(index, ratio) for index, ratio in ink if log(ratio) >= log(core) / 2]
    rows = [index // crop.width for index, _ in strokes]
    return core, median(ratio for _, ratio in strokes), max(rows) - min(rows) + 1


def measure(image, box, scale):
    x, y, width, height = (box[key] for key in ("x", "y", "width", "height"))
    bounds = (floor(x * scale), floor(y * scale), ceil((x + width) * scale), ceil((y + height) * scale))
    left, top, right, bottom = bounds
    if not (0 <= left < right <= image.width and 0 <= top < bottom <= image.height):
        raise ValueError(f"box outside the image at {bounds}")
    kind = box["type"]
    core, strokes, height = sample_pixels(image, bounds, kind)
    minimum_ratio, minimum_size = FLOORS[kind]
    css_size = box.get("size")
    expected = box.get("expectedInkHeight")
    estimated_px = height / scale
    estimated_size = css_size * estimated_px / expected if css_size and expected else None
    errors = []
    if strokes < minimum_ratio:
        errors.append(f"strokes {strokes:.2f}:1, expected {minimum_ratio}:1")
    if minimum_size and (css_size is None or css_size < minimum_size):
        errors.append(f"CSS size {css_size}, expected {minimum_size} px")
    # A raster edge can differ by a pixel on either side because its CSS
    # position falls between pixels, or because the stroke edge is antialiased.
    if minimum_size and expected and estimated_px + 2 / scale < expected * 0.75:
        errors.append(f"ink height {estimated_px:.2f} px, CSS range predicts {expected:.2f} px")
    return {
        **box, "pixelBounds": bounds, "core": round(core, 3), "strokes": round(strokes, 3),
        "inkHeight": round(estimated_px, 3), "estimatedSize": round(estimated_size, 3) if estimated_size else None,
        "errors": errors,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    sources = json.loads((args.directory / "home-readability-boxes.json").read_text())
    reports = []
    errors = []
    expected = {
        f"home-readability{('-' + card) if card else ''}-{width}-{look}.png": card
        for width in (390, 1440)
        for look in ("dark", "light")
        for card in ("", *DISCLOSURES)
    }
    files = [source["file"] for source in sources]
    missing = expected.keys() - set(files)
    unexpected = set(files) - expected.keys()
    if missing or unexpected or len(files) != len(set(files)):
        errors.append(f"invalid home picture set: missing {sorted(missing)}, unexpected {sorted(unexpected)}"
                      f", {len(files) - len(set(files))} duplicates")
    for source in sources:
        file = source["file"]
        card = expected.get(file)
        if card is None:
            continue
        scale = source["scale"]
        with Image.open(args.directory / file) as original:
            image = original.convert("RGB")
        if scale != 2 or image.size != (source["width"] * scale, source["height"] * scale):
            errors.append(f"{file}: image size {image.size} disagrees with the CSS extent at {scale}x")
        results = []
        for box in source["boxes"]:
            try:
                result = measure(image, box, scale)
            except ValueError as error:
                result = {**box, "errors": [str(error)]}
            results.append(result)
            errors.extend(f"{file}: {box['name']!r} {message}" for message in result["errors"])
        minima = {}
        kinds = ["body"] if card else list(FLOORS)
        if card == "storage":
            kinds.append("label")
        for kind in kinds:
            measured = [box for box in results if box["type"] == kind and "strokes" in box]
            if not measured:
                errors.append(f"{file}: no sampled {kind} boxes")
                continue
            sizes = [box["size"] for box in measured if box.get("size") is not None]
            minima[kind] = {"strokes": min(box["strokes"] for box in measured), "size": min(sizes) if sizes else None}
        reports.append({**source, "boxes": results, "imageSize": image.size, "minimum": minima})
    report = {"pictures": reports, "errors": errors}
    (args.directory / "home-readability.json").write_text(json.dumps(report, indent=2) + "\n")
    for error in errors:
        print(error)
    print(f"Read {len(reports)} pictures with {sum(len(item['boxes']) for item in reports)} ranges")
    return bool(errors)


if __name__ == "__main__":
    raise SystemExit(main())
